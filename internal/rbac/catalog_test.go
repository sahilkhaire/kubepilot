package rbac_test

import (
	"strings"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/rbac"
)

func TestCatalogCoversAllModules(t *testing.T) {
	t.Parallel()
	seen := make(map[string]bool)
	for _, g := range rbac.Catalog() {
		if g.ID == "" || g.Title == "" {
			t.Fatalf("group missing id/title: %+v", g)
		}
		for _, m := range g.Modules {
			if seen[m.ID] {
				t.Fatalf("duplicate module %q", m.ID)
			}
			seen[m.ID] = true
			if m.Label == "" {
				t.Fatalf("module %q missing label", m.ID)
			}
			if len(m.Actions) == 0 || m.Actions[0] != "view" {
				t.Fatalf("module %q actions=%v want view first", m.ID, m.Actions)
			}
			got := rbac.ModuleActions(m.ID)
			if strings.Join(got, ",") != strings.Join(m.Actions, ",") {
				t.Fatalf("module %q ModuleActions=%v catalog=%v", m.ID, got, m.Actions)
			}
		}
	}
	for _, id := range rbac.CatalogModules {
		if !seen[id] {
			t.Fatalf("CatalogModules %q missing from Catalog()", id)
		}
	}
	if len(seen) != len(rbac.CatalogModules) {
		t.Fatalf("catalog modules=%d CatalogModules=%d", len(seen), len(rbac.CatalogModules))
	}
}

func TestCatalogHasNoSettingsModules(t *testing.T) {
	t.Parallel()
	for _, id := range rbac.CatalogModules {
		if strings.HasPrefix(id, "settings.") {
			t.Fatalf("grantable catalog includes %q", id)
		}
	}
}

func TestValidateGrants(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		grants  map[string][]string
		wantErr string
	}{
		{name: "valid", grants: map[string][]string{"pods": {"view", "logs"}}},
		{name: "empty map ok", grants: map[string][]string{}},
		{name: "nil ok", grants: nil},
		{name: "unknown module", grants: map[string][]string{"nope": {"view"}}, wantErr: `unknown module "nope"`},
		{name: "settings rejected", grants: map[string][]string{"settings.members": {"view"}}, wantErr: `module "settings.members" is not grantable`},
		{name: "unknown action", grants: map[string][]string{"pods": {"view", "fly"}}, wantErr: `unknown action "fly" for module "pods"`},
		{name: "scale without view", grants: map[string][]string{"deployments": {"scale"}}, wantErr: `module "deployments" requires view`},
		{name: "empty actions", grants: map[string][]string{"pods": {}}, wantErr: `module "pods" requires at least view`},
		{name: "pods create invalid", grants: map[string][]string{"pods": {"view", "create"}}, wantErr: `unknown action "create" for module "pods"`},
		{name: "endpoints delete invalid", grants: map[string][]string{"endpoints": {"view", "delete"}}, wantErr: `unknown action "delete" for module "endpoints"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := rbac.ValidateGrants(tt.grants)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateGrants() err=%v", err)
				}
				return
			}
			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("ValidateGrants() err=%v want %q", err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeGrants(t *testing.T) {
	t.Parallel()
	got := rbac.NormalizeGrants(map[string][]string{
		"pods":        {"logs", "view", "view", "logs"},
		"deployments": {},
		"nodes":       {"drain", "view", "cordon"},
	})
	if _, ok := got["deployments"]; ok {
		t.Fatalf("empty module should be dropped: %v", got)
	}
	if strings.Join(got["pods"], ",") != "view,logs" {
		t.Fatalf("pods=%v want view,logs", got["pods"])
	}
	if strings.Join(got["nodes"], ",") != "view,cordon,drain" {
		t.Fatalf("nodes=%v want view,cordon,drain", got["nodes"])
	}
}

func TestClusterScopedFromCatalog(t *testing.T) {
	t.Parallel()
	if !rbac.ClusterScoped("nodes") {
		t.Fatal("nodes should be cluster scoped")
	}
	if rbac.ClusterScoped("pods") {
		t.Fatal("pods should be namespaced")
	}
	if rbac.ClusterScoped("custom_resources") {
		t.Fatal("custom_resources is mixed, not cluster-scoped by default")
	}
	if !rbac.ClusterScoped("settings.members") {
		t.Fatal("settings modules are cluster/app scoped")
	}
}
