package kube_test

import (
	"context"
	"errors"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

func boolPtr(v bool) *bool { return &v }

func deploymentOwnedPod() (*corev1.Pod, *appsv1.ReplicaSet, *appsv1.Deployment) {
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "dev"},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "web"}},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name:  "app",
						Image: "nginx",
						Env: []corev1.EnvVar{
							{Name: "KEEP", ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "creds"},
								Key:                  "token",
							}}},
							{Name: "OLD", Value: "1"},
						},
					}},
				},
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
		Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "app", Image: "nginx"}}},
	}
	return pod, rs, dep
}

func TestUpdatePodEnvDeployment(t *testing.T) {
	t.Parallel()
	pod, rs, dep := deploymentOwnedPod()
	client := kube.ForTest(fake.NewSimpleClientset(pod, rs, dep))

	owner, err := client.UpdatePodEnv(context.Background(), "dev", "web-abc-xyz", []kube.PodEnvContainer{{
		Name: "app",
		Env: []kube.PodEnvVar{
			{Name: "KEEP", ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "creds"},
				Key:                  "token",
			}}},
			{Name: "FOO", Value: "bar"},
		},
	}})
	if err != nil {
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
	if len(env) != 2 {
		t.Fatalf("env=%v", env)
	}
	if env[0].Name != "KEEP" || env[0].ValueFrom == nil || env[0].ValueFrom.SecretKeyRef == nil {
		t.Fatalf("keep=%+v", env[0])
	}
	if env[1].Name != "FOO" || env[1].Value != "bar" {
		t.Fatalf("foo=%+v", env[1])
	}
	if updated.Spec.Template.Spec.Containers[0].Image != "nginx" {
		t.Fatal("image should be unchanged")
	}
}

func TestUpdatePodEnvStatefulSet(t *testing.T) {
	t.Parallel()
	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: "db", Namespace: "dev"},
		Spec: appsv1.StatefulSetSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "db"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "db"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "pg", Image: "postgres"}}},
			},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "db-0",
			Namespace: "dev",
			OwnerReferences: []metav1.OwnerReference{{
				APIVersion: "apps/v1",
				Kind:       "StatefulSet",
				Name:       "db",
				Controller: boolPtr(true),
			}},
		},
	}
	client := kube.ForTest(fake.NewSimpleClientset(pod, sts))

	owner, err := client.UpdatePodEnv(context.Background(), "dev", "db-0", []kube.PodEnvContainer{{
		Name: "pg",
		Env:  []kube.PodEnvVar{{Name: "PGDATA", Value: "/data"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if owner.Kind != "StatefulSet" || owner.Name != "db" {
		t.Fatalf("owner=%+v", owner)
	}
	updated, err := client.Inner.AppsV1().StatefulSets("dev").Get(context.Background(), "db", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	env := updated.Spec.Template.Spec.Containers[0].Env
	if len(env) != 1 || env[0].Name != "PGDATA" {
		t.Fatalf("env=%v", env)
	}
}

func TestUpdatePodEnvBarePodImmutable(t *testing.T) {
	t.Parallel()
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "bare", Namespace: "dev"}}
	client := kube.ForTest(fake.NewSimpleClientset(pod))

	_, err := client.UpdatePodEnv(context.Background(), "dev", "bare", []kube.PodEnvContainer{{
		Name: "app",
		Env:  []kube.PodEnvVar{{Name: "FOO", Value: "bar"}},
	}})
	if !errors.Is(err, kube.ErrPodEnvImmutable) {
		t.Fatalf("err=%v want ErrPodEnvImmutable", err)
	}
}

func TestUpdatePodEnvInvalidName(t *testing.T) {
	t.Parallel()
	pod, rs, dep := deploymentOwnedPod()
	client := kube.ForTest(fake.NewSimpleClientset(pod, rs, dep))

	_, err := client.UpdatePodEnv(context.Background(), "dev", "web-abc-xyz", []kube.PodEnvContainer{{
		Name: "app",
		Env:  []kube.PodEnvVar{{Name: "FOO-BAR", Value: "x"}},
	}})
	var ve *kube.PodEnvValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("err=%v want PodEnvValidationError", err)
	}
}

func TestUpdatePodEnvUnknownContainer(t *testing.T) {
	t.Parallel()
	pod, rs, dep := deploymentOwnedPod()
	client := kube.ForTest(fake.NewSimpleClientset(pod, rs, dep))

	_, err := client.UpdatePodEnv(context.Background(), "dev", "web-abc-xyz", []kube.PodEnvContainer{{
		Name: "missing",
		Env:  []kube.PodEnvVar{{Name: "FOO", Value: "bar"}},
	}})
	if !errors.Is(err, kube.ErrPodEnvNoMatch) {
		t.Fatalf("err=%v want ErrPodEnvNoMatch", err)
	}
}

func TestUpdateDeploymentEnv(t *testing.T) {
	t.Parallel()
	_, _, dep := deploymentOwnedPod()
	client := kube.ForTest(fake.NewSimpleClientset(dep))

	owner, err := client.UpdateDeploymentEnv(context.Background(), "dev", "web", []kube.PodEnvContainer{{
		Name: "app",
		Env:  []kube.PodEnvVar{{Name: "FOO", Value: "bar"}},
	}})
	if err != nil {
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
}
