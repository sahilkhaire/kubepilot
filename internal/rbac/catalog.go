package rbac

import (
	"fmt"
	"strings"
)

// CatalogModules lists all grantable module ids (no settings.*).
var CatalogModules = []string{
	"cluster.overview",
	"namespaces",
	"nodes",
	"workloads.overview",
	"pods",
	"deployments",
	"statefulsets",
	"daemonsets",
	"replicasets",
	"jobs",
	"cronjobs",
	"configmaps",
	"secrets",
	"resourcequotas",
	"limitranges",
	"hpas",
	"pdbs",
	"priorityclasses",
	"runtimeclasses",
	"leases",
	"services",
	"endpoints",
	"ingresses",
	"ingressclasses",
	"networkpolicies",
	"pvcs",
	"pvs",
	"storageclasses",
	"serviceaccounts",
	"roles",
	"rolebindings",
	"clusterroles",
	"clusterrolebindings",
	"crds",
	"custom_resources",
	"helm",
	"events",
	"metrics",
}

var moduleActions = map[string][]string{
	"cluster.overview":    {"view"},
	"namespaces":          {"view", "create", "edit", "delete", "yaml_edit"},
	"nodes":               {"view", "edit", "delete", "yaml_edit", "cordon", "drain"},
	"workloads.overview":  {"view"},
	"pods":                {"view", "delete", "yaml_edit", "logs", "exec"},
	"deployments":         {"view", "create", "edit", "delete", "yaml_edit", "scale", "restart", "rollback"},
	"statefulsets":        {"view", "create", "edit", "delete", "yaml_edit", "scale", "restart"},
	"daemonsets":          {"view", "create", "edit", "delete", "yaml_edit", "restart"},
	"replicasets":         {"view", "create", "edit", "delete", "yaml_edit", "scale"},
	"jobs":                {"view", "create", "edit", "delete", "yaml_edit"},
	"cronjobs":            {"view", "create", "edit", "delete", "yaml_edit", "trigger"},
	"configmaps":          {"view", "create", "edit", "delete", "yaml_edit"},
	"secrets":             {"view", "create", "edit", "delete", "yaml_edit", "reveal"},
	"resourcequotas":      {"view", "create", "edit", "delete", "yaml_edit"},
	"limitranges":         {"view", "create", "edit", "delete", "yaml_edit"},
	"hpas":                {"view", "create", "edit", "delete", "yaml_edit"},
	"pdbs":                {"view", "create", "edit", "delete", "yaml_edit"},
	"priorityclasses":     {"view", "create", "edit", "delete", "yaml_edit"},
	"runtimeclasses":      {"view", "create", "edit", "delete", "yaml_edit"},
	"leases":              {"view", "create", "edit", "delete", "yaml_edit"},
	"services":            {"view", "create", "edit", "delete", "yaml_edit"},
	"endpoints":           {"view", "yaml_edit"},
	"ingresses":           {"view", "create", "edit", "delete", "yaml_edit"},
	"ingressclasses":      {"view", "create", "edit", "delete", "yaml_edit"},
	"networkpolicies":     {"view", "create", "edit", "delete", "yaml_edit"},
	"pvcs":                {"view", "create", "edit", "delete", "yaml_edit"},
	"pvs":                 {"view", "create", "edit", "delete", "yaml_edit"},
	"storageclasses":      {"view", "create", "edit", "delete", "yaml_edit"},
	"serviceaccounts":     {"view", "create", "edit", "delete", "yaml_edit"},
	"roles":               {"view", "create", "edit", "delete", "yaml_edit"},
	"rolebindings":        {"view", "create", "edit", "delete", "yaml_edit"},
	"clusterroles":        {"view", "create", "edit", "delete", "yaml_edit"},
	"clusterrolebindings": {"view", "create", "edit", "delete", "yaml_edit"},
	"crds":                {"view", "create", "edit", "delete", "yaml_edit"},
	"custom_resources":    {"view", "create", "edit", "delete", "yaml_edit"},
	"helm":                {"view", "install", "upgrade", "rollback", "uninstall"},
	"events":              {"view"},
	"metrics":             {"view"},
}

// ModuleActions returns the canonical actions for a catalog module.
func ModuleActions(module string) []string {
	return append([]string(nil), moduleActions[module]...)
}

// ValidateGrants rejects unknown modules, settings.* modules, and unknown actions.
func ValidateGrants(grants map[string][]string) error {
	for module, actions := range grants {
		if strings.HasPrefix(module, "settings.") {
			return fmt.Errorf("module %q is not grantable", module)
		}
		allowed, ok := moduleActions[module]
		if !ok {
			return fmt.Errorf("unknown module %q", module)
		}
		allowedSet := make(map[string]bool, len(allowed))
		for _, a := range allowed {
			allowedSet[a] = true
		}
		hasView := false
		for _, action := range actions {
			if !allowedSet[action] {
				return fmt.Errorf("unknown action %q for module %q", action, module)
			}
			if action == "view" {
				hasView = true
			}
		}
		for _, action := range actions {
			if action != "view" && !hasView {
				return fmt.Errorf("module %q requires view for action %q", module, action)
			}
		}
	}
	return nil
}

func cloneGrants(grants map[string][]string) map[string][]string {
	out := make(map[string][]string, len(grants))
	for k, v := range grants {
		out[k] = append([]string(nil), v...)
	}
	return out
}
