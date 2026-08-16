package rbac_test

import (
	"testing"

	"github.com/sahilkhaire/k8s-apis/internal/rbac"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

func TestViewerTemplatePodsViewNotReveal(t *testing.T) {
	t.Parallel()
	var viewer store.PermissionSet
	for _, tmpl := range rbac.Templates() {
		if tmpl.BuiltinTemplate == rbac.BuiltinViewer {
			viewer = tmpl
			break
		}
	}
	if viewer.BuiltinTemplate != rbac.BuiltinViewer {
		t.Fatal("viewer template not found")
	}
	actions := viewer.Grants["pods"]
	if !contains(actions, "view") {
		t.Fatalf("pods grants=%v want view", actions)
	}
	if contains(actions, "reveal") {
		t.Fatalf("pods grants=%v must not include reveal", actions)
	}
}

func TestAdminTemplateHasExec(t *testing.T) {
	t.Parallel()
	var admin store.PermissionSet
	for _, tmpl := range rbac.Templates() {
		if tmpl.BuiltinTemplate == rbac.BuiltinAdmin {
			admin = tmpl
			break
		}
	}
	if admin.BuiltinTemplate != rbac.BuiltinAdmin {
		t.Fatal("admin template not found")
	}
	actions := admin.Grants["pods"]
	if !contains(actions, "exec") {
		t.Fatalf("pods grants=%v want exec", actions)
	}
}

func contains(actions []string, action string) bool {
	for _, a := range actions {
		if a == action {
			return true
		}
	}
	return false
}
