package kube_test

import (
	"context"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

func TestDeletePod(t *testing.T) {
	t.Parallel()
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "dev"}}
	client := kube.ForTest(fake.NewSimpleClientset(pod))

	if err := client.DeletePod(context.Background(), "dev", "p1"); err != nil {
		t.Fatal(err)
	}
	_, err := client.GetResource(context.Background(), "pods", "dev", "p1")
	if err == nil {
		t.Fatal("expected pod to be deleted")
	}
}

func TestRestartDeploymentSetsAnnotation(t *testing.T) {
	t.Parallel()
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx"}}},
			},
		},
	}
	client := kube.ForTest(fake.NewSimpleClientset(dep))

	if err := client.RestartDeployment(context.Background(), "dev", "web"); err != nil {
		t.Fatal(err)
	}
	updated, err := client.Inner.AppsV1().Deployments("dev").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	ann := updated.Spec.Template.Annotations
	if ann == nil || ann["kubectl.kubernetes.io/restartedAt"] == "" {
		t.Fatalf("annotations=%v want restartedAt", ann)
	}
}

func TestScaleDeployment(t *testing.T) {
	t.Parallel()
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
	client := kube.ForTest(fake.NewSimpleClientset(dep))

	if err := client.ScaleDeployment(context.Background(), "dev", "web", 3); err != nil {
		t.Fatal(err)
	}
	updated, err := client.Inner.AppsV1().Deployments("dev").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Spec.Replicas == nil || *updated.Spec.Replicas != 3 {
		t.Fatalf("replicas=%v want 3", updated.Spec.Replicas)
	}
}

func TestRollbackDeployment(t *testing.T) {
	t.Parallel()
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx:2"}}},
			},
		},
	}
	rs := &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-old",
			Namespace: "dev",
			Labels:    map[string]string{"app": "web"},
			Annotations: map[string]string{
				"deployment.kubernetes.io/revision": "1",
			},
		},
		Spec: appsv1.ReplicaSetSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx:1"}}},
			},
		},
	}
	client := kube.ForTest(fake.NewSimpleClientset(dep, rs))

	if err := client.RollbackDeployment(context.Background(), "dev", "web", 1); err != nil {
		t.Fatal(err)
	}
	updated, err := client.Inner.AppsV1().Deployments("dev").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Spec.Template.Spec.Containers[0].Image != "nginx:1" {
		t.Fatalf("image=%q want nginx:1", updated.Spec.Template.Spec.Containers[0].Image)
	}
}

func TestTriggerCronJobCreatesJob(t *testing.T) {
	t.Parallel()
	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "tick", Namespace: "dev"},
		Spec: batchv1.CronJobSpec{
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "busybox"}}},
					},
				},
			},
		},
	}
	client := kube.ForTest(fake.NewSimpleClientset(cj))

	jobName, err := client.TriggerCronJob(context.Background(), "dev", "tick")
	if err != nil {
		t.Fatal(err)
	}
	if jobName == "" {
		t.Fatal("expected job name")
	}
	jobs, err := client.Inner.BatchV1().Jobs("dev").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs.Items) != 1 {
		t.Fatalf("jobs=%d want 1", len(jobs.Items))
	}
}

func int32Ptr(v int32) *int32 { return &v }
