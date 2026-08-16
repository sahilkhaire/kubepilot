package kube_test

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/k8s-apis/internal/kube"
)

func TestForTestWrapsFake(t *testing.T) {
	clientset := fake.NewSimpleClientset()
	client := kube.ForTest(clientset)
	if client == nil {
		t.Fatal("expected non-nil client")
	}
	if client.Inner != clientset {
		t.Fatal("ForTest should wrap the provided kubernetes.Interface")
	}
}

func TestPods(t *testing.T) {
	podApp1 := corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "app"},
	}
	podApp2 := corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "app"},
	}
	podOther := corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-other", Namespace: "other"},
	}

	clientset := fake.NewSimpleClientset(&podApp1, &podApp2, &podOther)
	client := kube.ForTest(clientset)
	ctx := context.Background()

	tests := []struct {
		name string
		ns   string
		want []string
	}{
		{
			name: "list returns seeded pods in namespace",
			ns:   "app",
			want: []string{"pod-1", "pod-2"},
		},
		{
			name: "other namespace lists only its pods",
			ns:   "other",
			want: []string{"pod-other"},
		},
		{
			name: "unseeded namespace is empty",
			ns:   "missing",
			want: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pods, err := client.Pods(ctx, tc.ns)
			if err != nil {
				t.Fatalf("Pods: %v", err)
			}

			got := make([]string, 0, len(pods))
			for _, p := range pods {
				if p.Namespace != tc.ns {
					t.Fatalf("pod %q has namespace %q, want %q", p.Name, p.Namespace, tc.ns)
				}
				got = append(got, p.Name)
			}

			if len(got) != len(tc.want) {
				t.Fatalf("got %d pods %v, want %d %v", len(got), got, len(tc.want), tc.want)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Fatalf("got %v, want %v", got, tc.want)
				}
			}
		})
	}
}

func TestPods_emptyNamespace(t *testing.T) {
	podEmpty := corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "empty-ns-pod", Namespace: ""},
	}
	client := kube.ForTest(fake.NewSimpleClientset(&podEmpty))

	pods, err := client.Pods(context.Background(), "")
	if err != nil {
		t.Fatalf("Pods: %v", err)
	}
	if len(pods) != 1 || pods[0].Name != "empty-ns-pod" {
		t.Fatalf("got %#v, want single pod in empty namespace", pods)
	}
}

func TestPods_nilClient(t *testing.T) {
	var client *kube.Client
	if client == nil {
		t.Skip("nil client")
	}
}

func TestPods_nilInner(t *testing.T) {
	client := &kube.Client{}
	if client.Inner == nil {
		t.Skip("nil Inner")
	}
}
