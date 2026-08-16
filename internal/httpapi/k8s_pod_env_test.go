package httpapi_test

import (
	"context"
	"encoding/json"
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

func boolPtr(v bool) *bool { return &v }

func seedPodEnvClient() *kube.Client {
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "app", Image: "nginx"}}},
			},
		},
	}
	rs := &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-abc",
			Namespace: "dev",
			OwnerReferences: []metav1.OwnerReference{{
				APIVersion: "apps/v1",
				Kind:       "Deployment",
				Name:       "web",
				Controller: boolPtr(true),
			}},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-abc-xyz",
			Namespace: "dev",
			OwnerReferences: []metav1.OwnerReference{{
				APIVersion: "apps/v1",
				Kind:       "ReplicaSet",
				Name:       "web-abc",
				Controller: boolPtr(true),
			}},
		},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	bare := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "bare", Namespace: "dev"}}
	return kube.ForTest(fake.NewSimpleClientset(dep, rs, pod, bare, nsDev))
}

func TestUpdatePodEnvUnauthenticated(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newK8sHandler(t, st, seedPodEnvClient())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/web-abc-xyz/env", strings.NewReader(`{"containers":[]}`))
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUpdatePodEnvDeniedWithoutYamlEdit(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedPodEnvClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/web-abc-xyz/env", strings.NewReader(
		`{"containers":[{"name":"app","env":[{"name":"FOO","value":"bar"}]}]}`,
	))
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestUpdatePodEnvSuccessAudited(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	client := seedPodEnvClient()
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/web-abc-xyz/env", strings.NewReader(
		`{"containers":[{"name":"app","env":[{"name":"FOO","value":"bar"}]}]}`,
	))
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}
	var owner kube.PodEnvOwner
	if err := json.Unmarshal(rec.Body.Bytes(), &owner); err != nil {
		t.Fatal(err)
	}
	if owner.Kind != "Deployment" || owner.Name != "web" {
		t.Fatalf("owner=%+v", owner)
	}

	updated, err := client.Inner.AppsV1().Deployments("dev").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	env := updated.Spec.Template.Spec.Containers[0].Env
	if len(env) != 1 || env[0].Name != "FOO" || env[0].Value != "bar" {
		t.Fatalf("env=%v", env)
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "pods",
		Action: "yaml_edit",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	if logs[0].Name != "web-abc-xyz" {
		t.Fatalf("audit=%+v", logs[0])
	}
}

func TestUpdatePodEnvBarePodBadRequest(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedPodEnvClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/bare/env", strings.NewReader(
		`{"containers":[{"name":"app","env":[{"name":"FOO","value":"bar"}]}]}`,
	))
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusBadRequest)
	}
	if !strings.Contains(rec.Body.String(), "immutable") {
		t.Fatalf("body=%s", rec.Body.String())
	}
}

func TestUpdateDeploymentEnvDeniedWithoutYamlEdit(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedPodEnvClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/deployments/web/env", strings.NewReader(
		`{"containers":[{"name":"app","env":[{"name":"FOO","value":"bar"}]}]}`,
	))
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestUpdateDeploymentEnvSuccessAudited(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "yaml_edit"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	client := seedPodEnvClient()
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/deployments/web/env", strings.NewReader(
		`{"containers":[{"name":"app","env":[{"name":"FOO","value":"bar"}]}]}`,
	))
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}
	var owner kube.PodEnvOwner
	if err := json.Unmarshal(rec.Body.Bytes(), &owner); err != nil {
		t.Fatal(err)
	}
	if owner.Kind != "Deployment" || owner.Name != "web" {
		t.Fatalf("owner=%+v", owner)
	}

	updated, err := client.Inner.AppsV1().Deployments("dev").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	env := updated.Spec.Template.Spec.Containers[0].Env
	if len(env) != 1 || env[0].Name != "FOO" || env[0].Value != "bar" {
		t.Fatalf("env=%v", env)
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
	if logs[0].Name != "web" {
		t.Fatalf("audit=%+v", logs[0])
	}
}
