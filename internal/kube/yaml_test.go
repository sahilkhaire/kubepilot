package kube_test

import (
	"context"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/zixflow/k8s/internal/kube"
)

func TestParseGVK(t *testing.T) {
	t.Parallel()
	apiVersion, kind, ok := kube.ParseGVK("v1/Pod")
	if !ok || apiVersion != "v1" || kind != "Pod" {
		t.Fatalf("got %q %q ok=%v", apiVersion, kind, ok)
	}
	apiVersion, kind, ok = kube.ParseGVK("apps/v1/Deployment")
	if !ok || apiVersion != "apps/v1" || kind != "Deployment" {
		t.Fatalf("got %q %q ok=%v", apiVersion, kind, ok)
	}
	if _, _, ok := kube.ParseGVK("bad"); ok {
		t.Fatal("expected invalid gvk")
	}
}

func TestModuleForKind(t *testing.T) {
	t.Parallel()
	module, ok := kube.ModuleForKind("Deployment")
	if !ok || module != "deployments" {
		t.Fatalf("got %q ok=%v", module, ok)
	}
	if _, ok := kube.ModuleForKind("Unknown"); ok {
		t.Fatal("expected unknown kind")
	}
}

func TestGetResourceYAML(t *testing.T) {
	t.Parallel()
	replicas := int32(2)
	now := metav1.Now()
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "web",
			Namespace:         "dev",
			UID:               "abc-123",
			ResourceVersion:   "42",
			Generation:        3,
			CreationTimestamp: now,
			Labels:            map[string]string{"app": "web"},
			Annotations:       map[string]string{"note": "keep"},
			ManagedFields: []metav1.ManagedFieldsEntry{
				{Manager: "kubectl", Operation: metav1.ManagedFieldsOperationUpdate, APIVersion: "apps/v1", FieldsType: "FieldsV1"},
			},
		},
		Status: appsv1.DeploymentStatus{Replicas: 2, ReadyReplicas: 2},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx"}}},
			},
		},
	}
	client := kube.ForTest(fake.NewSimpleClientset(dep))

	out, err := client.GetResourceYAML(context.Background(), "deployments", "dev", "web")
	if err != nil {
		t.Fatal(err)
	}
	text := string(out)
	if !strings.Contains(text, "kind: Deployment") || !strings.Contains(text, "name: web") {
		t.Fatalf("yaml=%s", text)
	}
	if !strings.Contains(text, "labels:") || !strings.Contains(text, "app: web") {
		t.Fatalf("expected labels preserved: %s", text)
	}
	if !strings.Contains(text, "annotations:") || !strings.Contains(text, "note: keep") {
		t.Fatalf("expected annotations preserved: %s", text)
	}
	for _, forbidden := range []string{
		"managedFields", "resourceVersion", "uid:", "generation:", "creationTimestamp",
		"status:", "readyReplicas", "selfLink",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("expected %q stripped from export: %s", forbidden, text)
		}
	}
}

func TestModuleFromYAML(t *testing.T) {
	t.Parallel()
	doc := []byte(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: dev
`)
	module, err := kube.ModuleFromYAML(doc)
	if err != nil || module != "deployments" {
		t.Fatalf("module=%q err=%v", module, err)
	}
}
