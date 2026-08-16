package rbac_test

import (
	"strings"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
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
	if viewer.NamespaceScope != rbac.NamespaceScopeAll {
		t.Fatalf("namespaceScope=%q want all", viewer.NamespaceScope)
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

func TestOperatorTemplateMatchesSpec(t *testing.T) {
	t.Parallel()
	op := templateByID(t, rbac.BuiltinOperator)
	if !contains(op.Grants["pods"], "logs") || !contains(op.Grants["pods"], "delete") {
		t.Fatalf("pods grants=%v want logs and delete", op.Grants["pods"])
	}
	if contains(op.Grants["pods"], "exec") || contains(op.Grants["pods"], "yaml_edit") {
		t.Fatalf("pods grants=%v must not include exec or yaml_edit", op.Grants["pods"])
	}
	if contains(op.Grants["secrets"], "reveal") {
		t.Fatalf("secrets grants=%v must not include reveal", op.Grants["secrets"])
	}
	if contains(op.Grants["helm"], "install") || contains(op.Grants["helm"], "upgrade") {
		t.Fatalf("helm grants=%v must not include writes", op.Grants["helm"])
	}
	if contains(op.Grants["deployments"], "delete") {
		t.Fatalf("deployments grants=%v must not include workload delete", op.Grants["deployments"])
	}
	if !contains(op.Grants["cronjobs"], "trigger") {
		t.Fatalf("cronjobs grants=%v want trigger", op.Grants["cronjobs"])
	}
	if err := rbac.ValidateGrants(op.Grants); err != nil {
		t.Fatalf("operator grants invalid: %v", err)
	}
}

func TestAdminTemplateAllCatalogActions(t *testing.T) {
	t.Parallel()
	admin := templateByID(t, rbac.BuiltinAdmin)
	for _, module := range rbac.CatalogModules {
		want := rbac.ModuleActions(module)
		got := admin.Grants[module]
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Fatalf("admin %s grants=%v want %v", module, got, want)
		}
	}
}

func TestViewerTemplateViewOnly(t *testing.T) {
	t.Parallel()
	viewer := templateByID(t, rbac.BuiltinViewer)
	if len(viewer.Grants) != len(rbac.CatalogModules) {
		t.Fatalf("viewer modules=%d want %d", len(viewer.Grants), len(rbac.CatalogModules))
	}
	for module, actions := range viewer.Grants {
		if len(actions) != 1 || actions[0] != "view" {
			t.Fatalf("viewer %s grants=%v want [view]", module, actions)
		}
	}
}

func templateByID(t *testing.T, id string) store.PermissionSet {
	t.Helper()
	for _, tmpl := range rbac.Templates() {
		if tmpl.BuiltinTemplate == id {
			return tmpl
		}
	}
	t.Fatalf("template %s not found", id)
	return store.PermissionSet{}
}

func contains(actions []string, action string) bool {
	for _, a := range actions {
		if a == action {
			return true
		}
	}
	return false
}
