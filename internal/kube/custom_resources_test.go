package kube_test

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/k8s-apis/internal/kube"
)

const (
	testWidgetGroup    = "example.com"
	testWidgetVersion  = "v1"
	testWidgetResource = "widgets"
	testWidgetCRDName  = "widgets.example.com"
)

func newWidgetTestClient(widgets ...*unstructured.Unstructured) *kube.Client {
	crd := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata": map[string]interface{}{
				"name": testWidgetCRDName,
			},
			"spec": map[string]interface{}{
				"group": testWidgetGroup,
				"scope": "Namespaced",
				"names": map[string]interface{}{
					"plural": testWidgetResource,
				},
				"versions": []interface{}{
					map[string]interface{}{
						"name":    testWidgetVersion,
						"served":  true,
						"storage": true,
					},
				},
			},
		},
	}

	gvrToListKind := map[schema.GroupVersionResource]string{
		kube.CRDGVR(): "CustomResourceDefinitionList",
		schema.GroupVersionResource{Group: testWidgetGroup, Version: testWidgetVersion, Resource: testWidgetResource}: "WidgetList",
	}
	objs := make([]runtime.Object, 0, len(widgets)+1)
	objs = append(objs, crd)
	for _, w := range widgets {
		objs = append(objs, w)
	}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), gvrToListKind, objs...)
	typed := k8sfake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "prod"}},
	)
	return kube.ForTestWithDynamic(typed, dyn)
}

func widget(name, namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": testWidgetGroup + "/" + testWidgetVersion,
			"kind":       "Widget",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
		},
	}
}

func TestListCRDs(t *testing.T) {
	t.Parallel()
	client := newWidgetTestClient()

	items, err := client.ListCRDs(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].GetName() != testWidgetCRDName {
		t.Fatalf("crds=%v", items)
	}
}

func TestCustomResourceNamespaced(t *testing.T) {
	t.Parallel()
	client := newWidgetTestClient()

	namespaced, err := client.CustomResourceNamespaced(context.Background(), testWidgetGroup, testWidgetResource)
	if err != nil {
		t.Fatal(err)
	}
	if !namespaced {
		t.Fatal("expected namespaced widget CRD")
	}
}

func TestListCustomResources(t *testing.T) {
	t.Parallel()
	client := newWidgetTestClient(widget("w-dev", "dev"), widget("w-prod", "prod"))

	items, err := client.ListCustomResources(context.Background(), testWidgetGroup, testWidgetVersion, testWidgetResource, "dev", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].GetName() != "w-dev" {
		t.Fatalf("items=%v", items)
	}
}
