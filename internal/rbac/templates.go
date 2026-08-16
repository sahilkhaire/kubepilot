package rbac

import "github.com/zixflow/k8s/internal/store"

const (
	BuiltinViewer   = "viewer"
	BuiltinOperator = "operator"
	BuiltinAdmin    = "admin"
)

// Templates returns built-in permission set templates (not persisted).
func Templates() []store.PermissionSet {
	return []store.PermissionSet{
		viewerTemplate(),
		operatorTemplate(),
		adminTemplate(),
	}
}

func viewerTemplate() store.PermissionSet {
	grants := make(map[string][]string, len(CatalogModules))
	for _, m := range CatalogModules {
		grants[m] = []string{"view"}
	}
	return store.PermissionSet{
		ID:              BuiltinViewer,
		Name:            "Viewer",
		Description:     "Read-only access to all catalog modules; secrets without reveal.",
		BuiltinTemplate: BuiltinViewer,
		Grants:          grants,
	}
}

func operatorTemplate() store.PermissionSet {
	grants := viewerGrants()
	addActions(grants, "pods", "logs", "delete")
	addActions(grants, "deployments", "restart", "scale")
	addActions(grants, "statefulsets", "restart", "scale")
	addActions(grants, "daemonsets", "restart")
	addActions(grants, "replicasets", "scale")
	addActions(grants, "cronjobs", "trigger")
	return store.PermissionSet{
		ID:              BuiltinOperator,
		Name:            "Operator",
		Description:     "Viewer plus logs, restart, scale, trigger, and pod delete.",
		BuiltinTemplate: BuiltinOperator,
		Grants:          grants,
	}
}

func adminTemplate() store.PermissionSet {
	grants := make(map[string][]string, len(CatalogModules))
	for _, m := range CatalogModules {
		grants[m] = append([]string(nil), moduleActions[m]...)
	}
	return store.PermissionSet{
		ID:              BuiltinAdmin,
		Name:            "Admin",
		Description:     "Full catalog module access except owner settings.",
		BuiltinTemplate: BuiltinAdmin,
		Grants:          grants,
	}
}

func viewerGrants() map[string][]string {
	grants := make(map[string][]string, len(CatalogModules))
	for _, m := range CatalogModules {
		grants[m] = []string{"view"}
	}
	return grants
}

func addActions(grants map[string][]string, module string, actions ...string) {
	existing := grants[module]
	for _, a := range actions {
		if !containsAction(existing, a) {
			existing = append(existing, a)
		}
	}
	grants[module] = existing
}

func containsAction(actions []string, action string) bool {
	for _, a := range actions {
		if a == action {
			return true
		}
	}
	return false
}

// TemplateByBuiltin returns a built-in template by id (viewer, operator, admin).
func TemplateByBuiltin(id string) (store.PermissionSet, bool) {
	for _, t := range Templates() {
		if t.BuiltinTemplate == id {
			return t, true
		}
	}
	return store.PermissionSet{}, false
}
