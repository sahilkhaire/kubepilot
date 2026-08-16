package kube_test

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/zixflow/k8s/internal/kube"
)

func TestStripSecretRemovesData(t *testing.T) {
	t.Parallel()
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "s", Namespace: "dev"},
		Data:       map[string][]byte{"key": []byte("value")},
		StringData: map[string]string{"other": "val"},
	}
	out := kube.StripSecret(secret)
	if out.Data != nil {
		t.Fatalf("data=%v want nil", out.Data)
	}
	if out.StringData != nil {
		t.Fatalf("stringData=%v want nil", out.StringData)
	}
	if out.Name != "s" {
		t.Fatalf("name=%q", out.Name)
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
