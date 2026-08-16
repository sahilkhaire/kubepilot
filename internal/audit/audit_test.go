package audit_test

import (
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/audit"
)

func TestModuleForPathK8s(t *testing.T) {
	t.Parallel()
	tests := []struct {
		path string
		want string
	}{
		{"/api/k8s/namespaces/dev/pods", "pods"},
		{"/api/k8s/namespaces/dev/deployments", "deployments"},
		{"/api/k8s/namespaces/dev/pods/my-pod", "pods"},
		{"/api/k8s/namespaces/dev/pods/my-pod/events", "pods"},
		{"/api/k8s/workloads/overview", "workloads.overview"},
		{"/api/k8s/cluster/overview", "cluster.overview"},
		{"/api/streams/logs", "pods"},
		{"/api/streams/logs?namespace=dev&pod=my-pod", "pods"},
		{"/api/streams/exec", "pods"},
		{"/api/streams/exec?namespace=dev&pod=my-pod", "pods"},
		{"/api/k8s/namespaces/dev/secrets", ""},
	}
	for _, tc := range tests {
		t.Run(tc.path, func(t *testing.T) {
			if got := audit.ModuleForPath(tc.path); got != tc.want {
				t.Fatalf("ModuleForPath(%q)=%q want %q", tc.path, got, tc.want)
			}
		})
	}
}

func TestRedactDetailsStripsPasswordKeys(t *testing.T) {
	t.Parallel()
	in := map[string]any{
		"username":        "alice",
		"password":        "secret",
		"passwordHash":    "hash",
		"currentPassword": "old",
		"newPassword":     "new",
		"nested": map[string]any{
			"password": "nested-secret",
			"ok":       true,
		},
	}
	out := audit.RedactDetails(in)
	if _, ok := out["password"]; ok {
		t.Fatal("password must be redacted")
	}
	if _, ok := out["passwordHash"]; ok {
		t.Fatal("passwordHash must be redacted")
	}
	if _, ok := out["currentPassword"]; ok {
		t.Fatal("currentPassword must be redacted")
	}
	if _, ok := out["newPassword"]; ok {
		t.Fatal("newPassword must be redacted")
	}
	if out["username"] != "alice" {
		t.Fatalf("username=%v", out["username"])
	}
	nested, ok := out["nested"].(map[string]any)
	if !ok {
		t.Fatal("nested map missing")
	}
	if _, ok := nested["password"]; ok {
		t.Fatal("nested password must be redacted")
	}
	if nested["ok"] != true {
		t.Fatal("nested ok missing")
	}
}
