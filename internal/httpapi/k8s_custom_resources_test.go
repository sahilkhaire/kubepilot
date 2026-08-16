package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

const (
	widgetGroup    = "example.com"
	widgetVersion  = "v1"
	widgetResource = "widgets"
	widgetCRDName  = "widgets.example.com"
)

func seedCustomResourceFakeClient() *kube.Client {
	crd := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata": map[string]interface{}{
				"name": widgetCRDName,
			},
			"spec": map[string]interface{}{
				"group": widgetGroup,
				"scope": "Namespaced",
				"names": map[string]interface{}{
					"plural": widgetResource,
				},
				"versions": []interface{}{
					map[string]interface{}{
						"name":    widgetVersion,
						"served":  true,
						"storage": true,
					},
				},
			},
		},
	}
	widgetDev := widgetCR("w-dev", "dev")
	widgetProd := widgetCR("w-prod", "prod")
	widgetInstall := widgetCR("w-install", testInstallNS)

	gvrToListKind := map[schema.GroupVersionResource]string{
		kube.CRDGVR(): "CustomResourceDefinitionList",
		schema.GroupVersionResource{Group: widgetGroup, Version: widgetVersion, Resource: widgetResource}: "WidgetList",
	}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), gvrToListKind, crd, widgetDev, widgetProd, widgetInstall)
	typed := k8sfake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: testInstallNS}},
	)
	return kube.ForTestWithDynamic(typed, dyn)
}

func widgetCR(name, namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": widgetGroup + "/" + widgetVersion,
			"kind":       "Widget",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
		},
	}
}

func customResourceListURL(namespace string) string {
	url := "/api/k8s/custom-resources?group=" + widgetGroup + "&version=" + widgetVersion + "&resource=" + widgetResource
	if namespace != "" {
		url += "&namespace=" + namespace
	}
	return url
}

func TestListCRDsRequiresAuth(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	h := newK8sHandler(t, st, seedCustomResourceFakeClient())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/crds", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListCRDsMember(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"crds": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedCustomResourceFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/k8s/crds", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("crds=%d want 1", len(items))
	}
}

func TestListCustomResourcesMemberDeniedOtherNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"custom_resources": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedCustomResourceFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, customResourceListURL("prod"), nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusForbidden)
	}
}

func TestListCustomResourcesMemberVisibleNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"custom_resources": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	h := newK8sHandler(t, st, seedCustomResourceFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, customResourceListURL("dev"), nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items=%d want 1", len(items))
	}
	meta, ok := items[0]["metadata"].(map[string]interface{})
	if !ok || meta["name"] != "w-dev" {
		t.Fatalf("item=%v", items[0])
	}
}

func TestListCustomResourcesMemberHidesInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"custom_resources": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev", testInstallNS})
	h := newK8sHandler(t, st, seedCustomResourceFakeClient())
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, customResourceListURL(""), nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		meta, ok := item["metadata"].(map[string]interface{})
		if !ok {
			continue
		}
		if meta["namespace"] == testInstallNS {
			t.Fatalf("install NS item visible: %v", item)
		}
	}
}

func TestListCustomResourcesOwnerCanListProd(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	h := newK8sHandler(t, st, seedCustomResourceFakeClient())
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, customResourceListURL("prod"), nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items=%d want 1", len(items))
	}
	meta, ok := items[0]["metadata"].(map[string]interface{})
	if !ok || meta["name"] != "w-prod" {
		t.Fatalf("item=%v", items[0])
	}
}
