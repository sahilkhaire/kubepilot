package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/k8s-apis/internal/helmctrl"
	"github.com/sahilkhaire/k8s-apis/internal/httpapi"
	"github.com/sahilkhaire/k8s-apis/internal/kube"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

type mockHelmClient struct {
	mu              sync.Mutex
	uninstallCalled bool
	uninstallNS     string
	uninstallName   string
	releases        []helmctrl.Release
}

func (m *mockHelmClient) List(ctx context.Context, ns string) ([]helmctrl.Release, error) {
	var out []helmctrl.Release
	for _, rel := range m.releases {
		if rel.Namespace == ns {
			out = append(out, rel)
		}
	}
	return out, nil
}

func (m *mockHelmClient) Install(ctx context.Context, req helmctrl.InstallRequest) (*helmctrl.Release, error) {
	return &helmctrl.Release{
		Name:      req.Name,
		Namespace: req.Namespace,
		Revision:  1,
		Chart:     req.Chart,
		Status:    "deployed",
	}, nil
}

func (m *mockHelmClient) Upgrade(ctx context.Context, req helmctrl.UpgradeRequest) (*helmctrl.Release, error) {
	return &helmctrl.Release{
		Name:      req.Name,
		Namespace: req.Namespace,
		Revision:  2,
		Chart:     req.Chart,
		Status:    "deployed",
	}, nil
}

func (m *mockHelmClient) Rollback(ctx context.Context, req helmctrl.RollbackRequest) (*helmctrl.Release, error) {
	rev := req.Revision
	if rev == 0 {
		rev = 1
	}
	return &helmctrl.Release{
		Name:      req.Name,
		Namespace: req.Namespace,
		Revision:  rev,
		Status:    "deployed",
	}, nil
}

func (m *mockHelmClient) Uninstall(ctx context.Context, ns, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.uninstallCalled = true
	m.uninstallNS = ns
	m.uninstallName = name
	return nil
}

func (m *mockHelmClient) wasUninstallCalled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.uninstallCalled
}

func newHelmHandler(t *testing.T, st store.Store, helm helmctrl.Client) http.Handler {
	t.Helper()
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsProd := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}}
	kubeClient := kube.ForTest(fake.NewSimpleClientset(nsDev, nsProd))
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{
		InstallNS: testInstallNS,
		Kube:      kubeClient,
		Helm:      helm,
	})
}

func TestHelmUninstallDeniedNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps-helm", map[string][]string{
		"helm": {"view", "uninstall"},
	})
	createK8sMember(t, st, "member", "pass", "ps-helm", []string{"dev"})
	mock := &mockHelmClient{
		releases: []helmctrl.Release{
			{Name: "web", Namespace: "prod", Revision: 1, Chart: "nginx", Status: "deployed"},
		},
	}
	h := newHelmHandler(t, st, mock)
	session := login(t, h, "member", "pass")

	body := bytes.NewBufferString(`{"namespace":"prod"}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/helm/releases/web/uninstall", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s want 403", rec.Code, rec.Body.String())
	}
	if mock.wasUninstallCalled() {
		t.Fatal("helm Uninstall must not be called on 403")
	}
}

func TestHelmUninstallAllowedNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps-helm", map[string][]string{
		"helm": {"view", "uninstall"},
	})
	createK8sMember(t, st, "member", "pass", "ps-helm", []string{"dev"})
	mock := &mockHelmClient{}
	h := newHelmHandler(t, st, mock)
	session := login(t, h, "member", "pass")

	body := bytes.NewBufferString(`{"namespace":"dev"}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/helm/releases/web/uninstall", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("code=%d body=%s want 204", rec.Code, rec.Body.String())
	}
	if !mock.wasUninstallCalled() {
		t.Fatal("helm Uninstall should be called")
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "helm",
		Action: "uninstall",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	log := logs[0]
	if log.Result != "success" || log.Namespace != "dev" || log.Name != "web" {
		t.Fatalf("audit=%+v", log)
	}
	for _, key := range []string{"values", "password", "chart"} {
		if _, ok := log.Details[key]; ok {
			t.Fatalf("details must not include %q: %v", key, log.Details)
		}
	}
}

func TestHelmInstallWritesAuditWithoutValues(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps-helm", map[string][]string{
		"helm": {"view", "install"},
	})
	createK8sMember(t, st, "member", "pass", "ps-helm", []string{"dev"})
	mock := &mockHelmClient{}
	h := newHelmHandler(t, st, mock)
	session := login(t, h, "member", "pass")

	body := bytes.NewBufferString(`{"name":"web","namespace":"dev","chart":"nginx","values":{"password":"secret"}}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/helm/releases", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "helm",
		Action: "install",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	log := logs[0]
	if log.Result != "success" || log.Namespace != "dev" || log.Name != "web" {
		t.Fatalf("audit=%+v", log)
	}
	if log.Details["chart"] != "nginx" {
		t.Fatalf("details=%v", log.Details)
	}
	for _, key := range []string{"values", "password"} {
		if _, ok := log.Details[key]; ok {
			t.Fatalf("details must not include %q: %v", key, log.Details)
		}
	}
}

func TestAppSettingsOwnerRoundTrip(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	h := newAuthHandlerWithStore(t, st)
	ownerSession := login(t, h, "owner", "secret")

	putBody := bytes.NewBufferString(`{"helmRepositories":[{"name":"private","url":"https://charts.example.com"}]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/settings/app", putBody)
	req.AddCookie(ownerSession)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("put code=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/settings/app", nil)
	req.AddCookie(ownerSession)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get code=%d body=%s", rec.Code, rec.Body.String())
	}

	var settings store.AppSettings
	if err := json.Unmarshal(rec.Body.Bytes(), &settings); err != nil {
		t.Fatal(err)
	}
	if len(settings.HelmRepositories) != 1 || settings.HelmRepositories[0].Name != "private" {
		t.Fatalf("settings=%+v", settings)
	}

	got, err := st.GetAppSettings(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got.HelmRepositories) != 1 {
		t.Fatalf("stored=%+v", got)
	}
}

func TestAppSettingsMemberForbidden(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createMember(t, st, "member", "pass")
	now := time.Now().UTC()
	if err := st.UpdateMember(context.Background(), store.User{
		ID:                 "member-1",
		Username:           "member",
		DisplayName:        "Member",
		Role:               store.RoleMember,
		MustChangePassword: false,
		Enabled:            true,
		UpdatedAt:          now,
	}); err != nil {
		t.Fatal(err)
	}
	h := newAuthHandlerWithStore(t, st)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/app", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want 403", rec.Code)
	}
}

func TestHelmListVisibleNamespaces(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps-helm", map[string][]string{
		"helm": {"view"},
	})
	createK8sMember(t, st, "member", "pass", "ps-helm", []string{"dev"})
	mock := &mockHelmClient{
		releases: []helmctrl.Release{
			{Name: "web", Namespace: "dev", Revision: 1, Chart: "nginx", Status: "deployed"},
			{Name: "api", Namespace: "prod", Revision: 1, Chart: "api", Status: "deployed"},
		},
	}
	h := newHelmHandler(t, st, mock)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/helm/releases", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var releases []helmctrl.Release
	if err := json.Unmarshal(rec.Body.Bytes(), &releases); err != nil {
		t.Fatal(err)
	}
	if len(releases) != 1 || releases[0].Namespace != "dev" {
		t.Fatalf("releases=%+v want only dev", releases)
	}
}
