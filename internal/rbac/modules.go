package rbac

// ClusterScoped reports whether a module id is cluster-scoped per AUTH-AND-PERMISSIONS.md.
func ClusterScoped(module string) bool {
	return clusterScopedModules[module]
}

var clusterScopedModules = map[string]bool{
	"cluster.overview":      true,
	"namespaces":            true,
	"nodes":                 true,
	"priorityclasses":       true,
	"runtimeclasses":        true,
	"ingressclasses":        true,
	"pvs":                   true,
	"storageclasses":        true,
	"clusterroles":          true,
	"clusterrolebindings":   true,
	"crds":                  true,
	"metrics":               true,
	"settings.members":      true,
	"settings.permission_sets": true,
	"settings.audit":        true,
	"settings.app":          true,
}
