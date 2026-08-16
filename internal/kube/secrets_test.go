package kube_test

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/zixflow/k8s/internal/kube"
)

func secretWithData() *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "s", Namespace: "dev"},
		Data:       map[string][]byte{"key": []byte("value")},
		StringData: map[string]string{"other": "val"},
	}
}

func assertSecretStripped(t *testing.T, obj any) {
	t.Helper()
	switch v := obj.(type) {
	case *corev1.Secret:
		if v.Data != nil {
			t.Fatalf("data=%v want nil", v.Data)
		}
		if v.StringData != nil {
			t.Fatalf("stringData=%v want nil", v.StringData)
		}
	case corev1.Secret:
		if v.Data != nil {
			t.Fatalf("data=%v want nil", v.Data)
		}
		if v.StringData != nil {
			t.Fatalf("stringData=%v want nil", v.StringData)
		}
	case map[string]interface{}:
		if _, ok := v["data"]; ok {
			t.Fatalf("data should be stripped: %v", v)
		}
		if _, ok := v["stringData"]; ok {
			t.Fatalf("stringData should be stripped: %v", v)
		}
	case *unstructured.Unstructured:
		if _, ok := v.Object["data"]; ok {
			t.Fatalf("data should be stripped: %v", v.Object)
		}
		if _, ok := v.Object["stringData"]; ok {
			t.Fatalf("stringData should be stripped: %v", v.Object)
		}
	case unstructured.Unstructured:
		if _, ok := v.Object["data"]; ok {
			t.Fatalf("data should be stripped: %v", v.Object)
		}
		if _, ok := v.Object["stringData"]; ok {
			t.Fatalf("stringData should be stripped: %v", v.Object)
		}
	default:
		t.Fatalf("unexpected type %T", obj)
	}
}

func TestStripSecretRemovesData(t *testing.T) {
	t.Parallel()
	out := kube.StripSecret(secretWithData())
	assertSecretStripped(t, out)
	if out.Name != "s" {
		t.Fatalf("name=%q", out.Name)
	}
}

func TestSanitizeSecretTypes(t *testing.T) {
	t.Parallel()

	secret := secretWithData()
	secretList := &corev1.SecretList{
		Items: []corev1.Secret{*secret.DeepCopy(), *secretWithData()},
	}

	cases := []struct {
		name string
		in   any
	}{
		{name: "pointer", in: secret},
		{name: "value", in: *secret},
		{name: "pointer list", in: secretList},
		{name: "value list", in: *secretList},
		{name: "map", in: map[string]interface{}{
			"kind":       "Secret",
			"data":       map[string]string{"token": "abc"},
			"stringData": map[string]string{"plain": "text"},
		}},
		{name: "unstructured pointer", in: &unstructured.Unstructured{
			Object: map[string]interface{}{
				"kind":       "Secret",
				"data":       map[string]string{"token": "abc"},
				"stringData": map[string]string{"plain": "text"},
			},
		}},
		{name: "unstructured value", in: unstructured.Unstructured{
			Object: map[string]interface{}{
				"kind":       "Secret",
				"data":       map[string]string{"token": "abc"},
				"stringData": map[string]string{"plain": "text"},
			},
		}},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			out := kube.SanitizeSecret(tc.in, false)
			switch v := out.(type) {
			case *corev1.SecretList:
				for i := range v.Items {
					assertSecretStripped(t, &v.Items[i])
				}
			case corev1.SecretList:
				for i := range v.Items {
					assertSecretStripped(t, &v.Items[i])
				}
			default:
				assertSecretStripped(t, out)
			}

			if kube.SanitizeSecret(tc.in, true) == nil && tc.in != nil {
				t.Fatal("reveal should return input")
			}
		})
	}
}

func TestSanitizeSecretsTypes(t *testing.T) {
	t.Parallel()

	secret := secretWithData()
	secretList := &corev1.SecretList{
		Items: []corev1.Secret{*secret.DeepCopy(), *secretWithData()},
	}

	cases := []struct {
		name string
		in   any
	}{
		{name: "slice value", in: []corev1.Secret{*secret, *secretWithData()}},
		{name: "slice pointer", in: []*corev1.Secret{secret, secretWithData()}},
		{name: "pointer list", in: secretList},
		{name: "value list", in: *secretList},
		{name: "map list", in: map[string]interface{}{
			"kind": "SecretList",
			"items": []interface{}{
				map[string]interface{}{
					"kind": "Secret",
					"data": map[string]string{"token": "abc"},
				},
				map[string]interface{}{
					"kind":       "Secret",
					"stringData": map[string]string{"plain": "text"},
				},
			},
		}},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			out := kube.SanitizeSecrets(tc.in, false)
			switch v := out.(type) {
			case []corev1.Secret:
				for i := range v {
					assertSecretStripped(t, &v[i])
				}
			case []*corev1.Secret:
				for _, s := range v {
					assertSecretStripped(t, s)
				}
			case *corev1.SecretList:
				for i := range v.Items {
					assertSecretStripped(t, &v.Items[i])
				}
			case corev1.SecretList:
				for i := range v.Items {
					assertSecretStripped(t, &v.Items[i])
				}
			case map[string]interface{}:
				items, ok := v["items"].([]interface{})
				if !ok {
					t.Fatalf("items type=%T", v["items"])
				}
				for _, it := range items {
					assertSecretStripped(t, it)
				}
			default:
				t.Fatalf("unexpected type %T", out)
			}
		})
	}
}

func TestStripSecretYAML(t *testing.T) {
	t.Parallel()
	doc := []byte(`apiVersion: v1
kind: Secret
metadata:
  name: s
data:
  token: abc
stringData:
  plain: text
`)
	out, err := kube.StripSecretYAML(doc)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if strings.Contains(s, "\ndata:") || strings.Contains(s, "stringData:") || strings.Contains(s, "token:") {
		t.Fatalf("stripped yaml=%s", s)
	}
	if !strings.Contains(s, "kind: Secret") {
		t.Fatalf("yaml=%s", s)
	}
}
