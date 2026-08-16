package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

func seedSecretFakeClient() *kube.Client {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "my-secret", Namespace: "dev"},
		Data:       map[string][]byte{"token": []byte("super-secret-value")},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsProd := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}}
	return kube.ForTest(fake.NewSimpleClientset(secret, nsDev, nsProd))
}

func seedStorageClassFakeClient() *kube.Client {
	sc := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	// storage class uses storage API - need storagev1.StorageClass
	return kube.ForTest(fake.NewSimpleClientset(sc))
}

func TestListSecretsWithoutRevealStripsData(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"secrets": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedSecretFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/secrets", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var items []map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("expected at least one secret")
	}
	for i, item := range items {
		if _, ok := item["data"]; ok {
			t.Fatalf("item[%d] data should be stripped: %s", i, rec.Body.String())
		}
		if _, ok := item["stringData"]; ok {
			t.Fatalf("item[%d] stringData should be stripped: %s", i, rec.Body.String())
		}
	}
}

func TestGetSecretWithoutRevealStripsData(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"secrets": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedSecretFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/secrets/my-secret", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var obj map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &obj); err != nil {
		t.Fatal(err)
	}
	if _, ok := obj["data"]; ok {
		t.Fatalf("data should be stripped: %s", rec.Body.String())
	}
	if _, ok := obj["stringData"]; ok {
		t.Fatalf("stringData should be stripped: %s", rec.Body.String())
	}
}

func TestListSecretsWithRevealAudited(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"secrets": {"view", "reveal"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedSecretFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/secrets?reveal=1", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var items []map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("expected at least one secret")
	}
	for i, item := range items {
		if _, ok := item["data"]; !ok {
			t.Fatalf("item[%d] data should be present: %s", i, rec.Body.String())
		}
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "secrets",
		Action: "reveal",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	if logs[0].Namespace != "dev" || logs[0].Name != "" {
		t.Fatalf("audit=%+v", logs[0])
	}
	if logs[0].Details == nil {
		t.Fatal("audit details should include count")
	}
	for _, key := range []string{"data", "stringData"} {
		if _, ok := logs[0].Details[key]; ok {
			t.Fatalf("audit details must not include %q: %+v", key, logs[0].Details)
		}
	}
}

func TestGetSecretWithRevealAudited(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"secrets": {"view", "reveal"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedSecretFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/secrets/my-secret?reveal=1", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var obj map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &obj); err != nil {
		t.Fatal(err)
	}
	if _, ok := obj["data"]; !ok {
		t.Fatalf("data should be present: %s", rec.Body.String())
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "secrets",
		Action: "reveal",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	if logs[0].Namespace != "dev" || logs[0].Name != "my-secret" {
		t.Fatalf("audit=%+v", logs[0])
	}
	if logs[0].Details != nil {
		t.Fatalf("audit details should be empty: %+v", logs[0].Details)
	}
}

func TestGetSecretRevealDeniedWithoutGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"secrets": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedSecretFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/dev/secrets/my-secret?reveal=1", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListConfigMapsDeniedWrongNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"configmaps": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "cfg", Namespace: "prod"}}
	client := kube.ForTest(fake.NewSimpleClientset(
		cm,
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}},
	))
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/namespaces/prod/configmaps", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListStorageClassesDeniedWithoutView(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"configmaps": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, kube.ForTest(fake.NewSimpleClientset()))
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/storageclasses", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}
