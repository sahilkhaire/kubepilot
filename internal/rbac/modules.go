package rbac

import "strings"

// ClusterScoped reports whether a module id is cluster-scoped per AUTH-AND-PERMISSIONS.md.
func ClusterScoped(module string) bool {
	if strings.HasPrefix(module, "settings.") {
		return true
	}
	return moduleScopes[module] == ScopeCluster
}
