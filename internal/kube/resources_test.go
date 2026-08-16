package kube_test

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

func TestListResourcePods(t *testing.T) {
	t.Parallel()
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "dev"}}
	client := kube.ForTest(fake.NewSimpleClientset(pod))

	items, err := client.ListResource(context.Background(), "pods", "dev")
	if err != nil {
		t.Fatal(err)
	}
	pods, ok := items.([]corev1.Pod)
	if !ok {
		t.Fatalf("type %T", items)
	}
	if len(pods) != 1 || pods[0].Name != "p1" {
		t.Fatalf("pods=%v", pods)
	}
}

func TestGetResourcePodNotFound(t *testing.T) {
	t.Parallel()
	client := kube.ForTest(fake.NewSimpleClientset())

	_, err := client.GetResource(context.Background(), "pods", "dev", "missing")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCountResourcePods(t *testing.T) {
	t.Parallel()
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "dev"}}
	client := kube.ForTest(fake.NewSimpleClientset(pod))

	n, err := client.CountResource(context.Background(), "pods", "dev")
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("count=%d want 1", n)
	}
}

func TestEventsForObject(t *testing.T) {
	t.Parallel()
	ev := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Name: "e1", Namespace: "dev"},
		InvolvedObject: corev1.ObjectReference{
			Kind:      "Pod",
			Name:      "p1",
			Namespace: "dev",
		},
	}
	client := kube.ForTest(fake.NewSimpleClientset(ev))

	events, err := client.EventsForObject(context.Background(), "dev", "Pod", "p1")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Name != "e1" {
		t.Fatalf("events=%v", events)
	}
}

func TestClusterNamespaces(t *testing.T) {
	t.Parallel()
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "dev"}}
	client := kube.ForTest(fake.NewSimpleClientset(ns))

	names, err := client.ClusterNamespaces(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || names[0] != "dev" {
		t.Fatalf("names=%v", names)
	}
}

func TestResourceKind(t *testing.T) {
	t.Parallel()
	kind, ok := kube.ResourceKind("pods")
	if !ok || kind != "Pod" {
		t.Fatalf("kind=%q ok=%v", kind, ok)
	}
	_, ok = kube.ResourceKind("unknown")
	if ok {
		t.Fatal("expected false")
	}
}

func TestFilterObjectsByNamespace(t *testing.T) {
	t.Parallel()
	items := []corev1.Pod{
		{ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "dev"}},
		{ObjectMeta: metav1.ObjectMeta{Name: "b", Namespace: "prod"}},
	}
	filtered, ok := kube.FilterObjects(items, func(ns string) bool { return ns == "dev" }).([]corev1.Pod)
	if !ok {
		t.Fatalf("type %T", kube.FilterObjects(items, func(string) bool { return true }))
	}
	if len(filtered) != 1 || filtered[0].Name != "a" {
		t.Fatalf("filtered=%v", filtered)
	}
}
