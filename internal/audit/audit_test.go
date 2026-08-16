package audit_test

import (
	"testing"

	"github.com/zixflow/k8s/internal/audit"
)

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
