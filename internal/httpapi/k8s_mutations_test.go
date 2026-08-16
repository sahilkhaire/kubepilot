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
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"

	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/store"
)

func seedMutationFakeClient() *kube.Client {
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-dev", Namespace: "dev"}}
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx"}}},
			},
		},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	return kube.ForTest(fake.NewSimpleClientset(pod, dep, nsDev))
}

func int32Ptr(v int32) *int32 { return &v }

func TestDeletePodUnauthenticated(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newK8sHandler(t, st, seedMutationFakeClient())

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"pod-dev"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/pod-dev/delete", body)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestDeletePodConfirmMismatch(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "delete"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedMutationFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"wrong-name"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/pod-dev/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusBadRequest)
	}

	_, err := seedMutationFakeClient().GetResource(context.Background(), "pods", "dev", "pod-dev")
	if err != nil {
		t.Fatalf("pod should still exist: %v", err)
	}
}

func TestDeletePodDeniedWithoutDeleteGrant(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})

	cs := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-dev", Namespace: "dev"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
	)
	deleteCalled := false
	cs.PrependReactor("delete", "pods", func(action ktesting.Action) (bool, runtime.Object, error) {
		deleteCalled = true
		return false, nil, nil
	})
	h := newK8sHandler(t, st, kube.ForTest(cs))
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"pod-dev"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/pod-dev/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
	if deleteCalled {
		t.Fatal("delete reactor should not run without delete grant")
	}
}

func TestDeletePodSuccessAudited(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "delete"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedMutationFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"pod-dev"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/pod-dev/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "pods",
		Action: "delete",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	if logs[0].Namespace != "dev" || logs[0].Name != "pod-dev" || logs[0].Kind != "Pod" {
		t.Fatalf("audit=%+v", logs[0])
	}
}

func TestRestartDeploymentDeniedWithoutRestartGrant(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "scale"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})

	cs := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"},
			Spec: appsv1.DeploymentSpec{
				Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
				Template: corev1.PodTemplateSpec{
					ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
					Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx"}}},
				},
			},
		},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
	)
	patchCalled := false
	cs.PrependReactor("patch", "deployments", func(action ktesting.Action) (bool, runtime.Object, error) {
		patchCalled = true
		return false, nil, nil
	})
	h := newK8sHandler(t, st, kube.ForTest(cs))
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/deployments/web/restart", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
	if patchCalled {
		t.Fatal("patch should not run without restart grant")
	}
}

func TestRestartDeploymentSuccessAudited(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "restart"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedMutationFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/deployments/web/restart", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Module: "deployments",
		Action: "restart",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("audit logs=%d want 1", len(logs))
	}
	if logs[0].Namespace != "dev" || logs[0].Name != "web" {
		t.Fatalf("audit=%+v", logs[0])
	}
}

func TestDeletePodNotFound(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "delete"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedMutationFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"missing"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/pods/missing/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusNotFound)
	}
}

func TestScaleDeploymentSuccess(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"deployments": {"view", "scale"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	kubeClient := seedMutationFakeClient()
	h := newK8sHandler(t, st, kubeClient)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := bytes.NewBufferString(`{"replicas":5}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/dev/deployments/web/scale", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	dep, err := kubeClient.Inner.AppsV1().Deployments("dev").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if dep.Spec.Replicas == nil || *dep.Spec.Replicas != 5 {
		t.Fatalf("replicas=%v want 5", dep.Spec.Replicas)
	}
}

func TestDeletePodInstallNSForbidden(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "delete"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedWorkloadFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"pod-install"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/"+testInstallNS+"/pods/pod-install/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestDeletePodInstallNSForbiddenBeforeConfirmValidation(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "delete"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})

	cs := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-install", Namespace: testInstallNS}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}},
	)
	deleteCalled := false
	cs.PrependReactor("delete", "pods", func(action ktesting.Action) (bool, runtime.Object, error) {
		deleteCalled = true
		return false, nil, nil
	})
	h := newK8sHandler(t, st, kube.ForTest(cs))
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"confirm":"wrong-name"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/"+testInstallNS+"/pods/pod-install/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusForbidden)
	}
	if deleteCalled {
		t.Fatal("delete reactor should not run for install namespace")
	}
}
