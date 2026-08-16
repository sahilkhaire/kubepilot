package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/store"
)

func seedNodesFakeClient() *kube.Client {
	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}}
	return kube.ForTest(fake.NewSimpleClientset(node))
}

func seedEventsFakeClientWithInstallNS() *kube.Client {
	evDev := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Name: "ev-dev", Namespace: "dev"},
		InvolvedObject: corev1.ObjectReference{
			Kind:      "Pod",
			Name:      "pod-dev",
			Namespace: "dev",
		},
	}
	evInstall := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Name: "ev-install", Namespace: testInstallNS},
		InvolvedObject: corev1.ObjectReference{
			Kind:      "Pod",
			Name:      "pod-install",
			Namespace: testInstallNS,
		},
	}
	evNode := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Name: "ev-node", Namespace: "default"},
		InvolvedObject: corev1.ObjectReference{
			Kind: "Node",
			Name: "node-1",
		},
	}
	nsDev := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	nsInstall := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}}
	nsDefault := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}}
	return kube.ForTest(fake.NewSimpleClientset(evDev, evInstall, evNode, nsDev, nsInstall, nsDefault))
}

type fakeNodeDrainer struct{}

func (fakeNodeDrainer) DrainNode(_ context.Context, _ string) error {
	return nil
}

func TestListNodesDeniedWithoutGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	h := newK8sHandler(t, st, seedNodesFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/nodes", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListNodesAllowedWithGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"nodes": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedNodesFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/nodes", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}
}

func TestNodeDrainDeniedWithoutDrainGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"nodes": {"view", "cordon"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	client := seedNodesFakeClient()
	client.Drainer = fakeNodeDrainer{}
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/nodes/node-1/drain", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestNodeDrainAllowedWithGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"nodes": {"view", "drain"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	client := seedNodesFakeClient()
	client.Drainer = fakeNodeDrainer{}
	h := newK8sHandler(t, st, client)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/nodes/node-1/drain", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}
}

func TestMemberCannotDeleteInstallNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"namespaces": {"view", "delete"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	nsInstall := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}}
	h := newK8sHandler(t, st, kube.ForTest(fake.NewSimpleClientset(nsInstall)))
	session := login(t, h, "member", "pass")

	body := bytes.NewBufferString(`{"confirm":"` + testInstallNS + `"}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/"+testInstallNS+"/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestOwnerCannotDeleteInstallNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	nsInstall := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}}
	h := newK8sHandler(t, st, kube.ForTest(fake.NewSimpleClientset(nsInstall)))
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"confirm":"` + testInstallNS + `"}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/k8s/namespaces/"+testInstallNS+"/delete", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
}

func TestMemberEventsExcludeInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"events": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedEventsFakeClientWithInstallNS())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/events", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var events []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &events); err != nil {
		t.Fatal(err)
	}
	for _, ev := range events {
		meta, _ := ev["metadata"].(map[string]any)
		if meta != nil && meta["namespace"] == testInstallNS {
			t.Fatalf("member saw install NS event: %v", ev)
		}
		obj, _ := ev["involvedObject"].(map[string]any)
		if obj != nil && obj["namespace"] == testInstallNS {
			t.Fatalf("member saw install NS involved object event: %v", ev)
		}
	}
	foundDev := false
	for _, ev := range events {
		obj, _ := ev["involvedObject"].(map[string]any)
		if obj != nil && obj["namespace"] == "dev" {
			foundDev = true
		}
	}
	if !foundDev {
		t.Fatalf("expected dev event in %v", events)
	}
}
