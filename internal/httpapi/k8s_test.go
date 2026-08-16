package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/password"
	"github.com/zixflow/k8s/internal/store"
)

func newK8sHandler(t *testing.T, st store.Store, kubeClient *kube.Client) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{
		InstallNS: testInstallNS,
		Kube:      kubeClient,
	})
}

func createK8sMember(t *testing.T, st store.Store, username, plainPassword, permissionSetID string, namespaces []string) {
	t.Helper()
	hash, err := password.Hash(plainPassword)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := st.CreateMember(context.Background(), store.User{
		ID:                 "member-k8s",
		Username:           username,
		DisplayName:        "Member",
		Role:               store.RoleMember,
		PasswordHash:       hash,
		MustChangePassword: false,
		Enabled:            true,
		PermissionSetID:    permissionSetID,
		Namespaces:         namespaces,
		CreatedAt:          now,
		UpdatedAt:          now,
	}); err != nil {
		t.Fatal(err)
	}
}

func createPermissionSetWithGrants(t *testing.T, st store.Store, id string, grants map[string][]string) {
	t.Helper()
	now := time.Now().UTC()
	if err := st.CreatePermissionSet(context.Background(), store.PermissionSet{
		ID:          id,
		Name:        "Viewer",
		Description: "test",
		Grants:      grants,
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatal(err)
	}
}

func seedWorkloadFakeClient() *kube.Client {
	podDev := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-dev", Namespace: "dev"},
	}
	podProd := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-prod", Namespace: "prod"},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsProd := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}}
	return kube.ForTest(fake.NewSimpleClientset(podDev, podProd, nsDev, nsProd))
}

func seedWorkloadFakeClientWithInstallNS() *kube.Client {
	podDev := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-dev", Namespace: "dev"},
	}
	podProd := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-prod", Namespace: "prod"},
	}
	podInstall := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-install", Namespace: testInstallNS},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsProd := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}}
	nsInstall := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}}
	return kube.ForTest(fake.NewSimpleClientset(podDev, podProd, podInstall, nsDev, nsProd, nsInstall))
}

func TestListPodsAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	tests := []struct {
		name       string
		path       string
		session    *http.Cookie
		wantStatus int
		wantEmpty  bool
	}{
		{
			name:       "unauthenticated",
			path:       "/api/k8s/namespaces/dev/pods",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "denied wrong namespace",
			path:       "/api/k8s/namespaces/prod/pods",
			session:    session,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "allowed list",
			path:       "/api/k8s/namespaces/dev/pods",
			session:    session,
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.session != nil {
				req.AddCookie(tc.session)
			}
			h.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), tc.wantStatus)
			}

			if tc.wantStatus == http.StatusOK {
				var pods []map[string]any
				if err := json.Unmarshal(rec.Body.Bytes(), &pods); err != nil {
					t.Fatalf("decode: %v body=%s", err, rec.Body.String())
				}
				if tc.wantEmpty && len(pods) != 0 {
					t.Fatalf("pods=%v want empty array", pods)
				}
				if !tc.wantEmpty && tc.path == "/api/k8s/namespaces/dev/pods" && len(pods) != 1 {
					t.Fatalf("pods=%v want one pod in dev", pods)
				}
			}
		})
	}
}

func TestGetPodAuthz(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	tests := []struct {
		name       string
		path       string
		wantStatus int
	}{
		{name: "denied prod", path: "/api/k8s/namespaces/prod/pods/pod-prod", wantStatus: http.StatusForbidden},
		{name: "get dev", path: "/api/k8s/namespaces/dev/pods/pod-dev", wantStatus: http.StatusOK},
		{name: "missing name", path: "/api/k8s/namespaces/dev/pods/missing", wantStatus: http.StatusNotFound},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.AddCookie(session)
			h.ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), tc.wantStatus)
			}
		})
	}
}

func TestListPodsKubeNil(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, nil)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/pods", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestWorkloadsOverviewOmitsDeniedModules(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace=dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var counts map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &counts); err != nil {
		t.Fatal(err)
	}
	if counts["pods"] != 1 {
		t.Fatalf("pods=%d want 1", counts["pods"])
	}
	if _, ok := counts["deployments"]; ok {
		t.Fatalf("deployments should be omitted: %v", counts)
	}
}

func TestWorkloadsOverviewRequiresNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	tests := []struct {
		name       string
		path       string
		wantStatus int
	}{
		{name: "missing namespace", path: "/api/k8s/workloads/overview", wantStatus: http.StatusBadRequest},
		{name: "blank namespace", path: "/api/k8s/workloads/overview?namespace=", wantStatus: http.StatusBadRequest},
		{name: "whitespace namespace", path: "/api/k8s/workloads/overview?namespace=%20", wantStatus: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.AddCookie(session)
			h.ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), tc.wantStatus)
			}
		})
	}
}

func TestMemberStarCannotSeeInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace="+testInstallNS, nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("workloads overview code=%d want %d", rec.Code, http.StatusForbidden)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/k8s/cluster/overview", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("cluster overview code=%d body=%s", rec.Code, rec.Body.String())
	}

	var counts map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &counts); err != nil {
		t.Fatal(err)
	}
	if counts["pods"] != 2 {
		t.Fatalf("pods=%d want 2 (dev+prod, excluding install NS)", counts["pods"])
	}
}

func TestWorkloadsOverviewDeniedNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/workloads/overview?namespace=prod", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestUnknownResource404(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSet(t, st, "ps1")
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedWorkloadFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/secrets", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusNotFound)
	}
}
