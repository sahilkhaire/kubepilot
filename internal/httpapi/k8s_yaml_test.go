package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

type recordingYAMLApplier struct {
	applyCalled bool
	lastDoc     []byte
}

func (r *recordingYAMLApplier) GetResourceYAML(ctx context.Context, module, ns, name string) ([]byte, error) {
	return []byte("apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: dev\n"), nil
}

func (r *recordingYAMLApplier) ApplyYAML(ctx context.Context, doc []byte, namespaceOverride string) error {
	r.applyCalled = true
	r.lastDoc = doc
	return nil
}

func deploymentYAMLApplyBody() string {
	return `{"yaml":"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: dev\n"}`
}

func TestGetYAMLUnauthenticated(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newK8sHandler(t, st, seedMutationFakeClient())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/yaml?gvk=apps/v1/Deployment&namespace=dev&name=web", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestGetYAMLDeniedWithoutView(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset())
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/yaml?gvk=apps/v1/Deployment&namespace=dev&name=web", nil)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestGetYAMLSuccess(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset())
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/yaml?gvk=apps/v1/Deployment&namespace=dev&name=web", nil)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", recorder.Code, recorder.Body.String(), http.StatusOK)
	}
	if ct := recorder.Header().Get("Content-Type"); !strings.Contains(ct, "application/yaml") {
		t.Fatalf("content-type=%q", ct)
	}
	if !strings.Contains(recorder.Body.String(), "kind: Deployment") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}

func TestApplyYAMLDeniedWithoutYamlEdit(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset(
		&appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
	))
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	recorder := httptest.NewRecorder()
	body := strings.NewReader(deploymentYAMLApplyBody())
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/yaml/apply", body)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", recorder.Code, http.StatusForbidden)
	}
	if rec.applyCalled {
		t.Fatal("applier should not be called without yaml_edit grant")
	}
}

func TestApplyYAMLModuleMismatchForbidden(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset())
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	recorder := httptest.NewRecorder()
	body := strings.NewReader(deploymentYAMLApplyBody())
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/yaml/apply?module=pods", body)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", recorder.Code, http.StatusForbidden)
	}
	if rec.applyCalled {
		t.Fatal("applier should not be called on module mismatch")
	}
}

func TestApplyYAMLSuccessAudited(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
	))
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	recorder := httptest.NewRecorder()
	body := strings.NewReader(deploymentYAMLApplyBody())
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/yaml/apply", body)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", recorder.Code, recorder.Body.String(), http.StatusOK)
	}
	if !rec.applyCalled {
		t.Fatal("expected applier to be called")
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "deployments",
		Action: "yaml_edit",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	if logs[0].Namespace != "dev" || logs[0].Name != "web" || logs[0].Kind != "Deployment" {
		t.Fatalf("audit=%+v", logs[0])
	}
}

func TestApplyYAMLInstallNSForbidden(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{testInstallNS})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset())
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	body := bytes.NewBufferString(`{"yaml":"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: ` + testInstallNS + `\n"}`)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/yaml/apply", body)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", recorder.Code, http.StatusForbidden)
	}
	if rec.applyCalled {
		t.Fatal("applier should not be called for install namespace")
	}
}

func TestApplyPodYAMLRejected(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	rec := &recordingYAMLApplier{}
	client := kube.ForTest(fake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
	))
	client.YAML = rec
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	body := bytes.NewBufferString(`{"yaml":"apiVersion: v1\nkind: Pod\nmetadata:\n  name: p1\n  namespace: dev\n"}`)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/yaml/apply", body)
	req.AddCookie(session)
	h.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s want %d", recorder.Code, recorder.Body.String(), http.StatusBadRequest)
	}
	if rec.applyCalled {
		t.Fatal("applier should not be called for pod yaml")
	}
	if !strings.Contains(recorder.Body.String(), "immutable") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}
