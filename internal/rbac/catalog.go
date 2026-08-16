package rbac

import (
	"fmt"
	"strings"
)

type ModuleScope string

const (
	ScopeNamespaced ModuleScope = "ns"
	ScopeCluster    ModuleScope = "cluster"
	ScopeMixed      ModuleScope = "mixed"
)

// CatalogGroup is a sidebar-aligned group of grantable modules.
type CatalogGroup struct {
	ID      string          `json:"id"`
	Title   string          `json:"title"`
	Modules []CatalogModule `json:"modules"`
}

// CatalogModule is one grantable module from AUTH-AND-PERMISSIONS.md.
type CatalogModule struct {
	ID      string      `json:"id"`
	Label   string      `json:"label"`
	Scope   ModuleScope `json:"scope"`
	Actions []string    `json:"actions"`
	Notes   string      `json:"notes,omitempty"`
}

type catalogModuleDef struct {
	id      string
	label   string
	scope   ModuleScope
	actions []string
	notes   string
}

type catalogGroupDef struct {
	id      string
	title   string
	modules []catalogModuleDef
}

// CatalogModules lists all grantable module ids (no settings.*).
var CatalogModules []string

var moduleActions map[string][]string
var moduleScopes map[string]ModuleScope

var catalogGroups = []catalogGroupDef{
	{
		id:    "cluster",
		title: "Cluster",
		modules: []catalogModuleDef{
			{
				id:      "cluster.overview",
				label:   "Overview",
				scope:   ScopeCluster,
				actions: []string{"view"},
				notes:   "Aggregates only from modules the user can view.",
			},
			{
				id:      "nodes",
				label:   "Nodes",
				scope:   ScopeCluster,
				actions: []string{"view", "edit", "delete", "yaml_edit", "cordon", "drain"},
				notes:   "Uncordon is stored as action cordon. Edit covers labels and taints.",
			},
			{
				id:      "namespaces",
				label:   "Namespaces",
				scope:   ScopeCluster,
				actions: []string{"view", "create", "edit", "delete", "yaml_edit"},
				notes:   "The namespace switcher does not require this module. Install namespace is never grantable to members.",
			},
			{
				id:      "events",
				label:   "Events",
				scope:   ScopeNamespaced,
				actions: []string{"view"},
				notes:   "Cluster-wide lists are filtered to granted namespaces.",
			},
			{
				id:      "metrics",
				label:   "Metrics",
				scope:   ScopeCluster,
				actions: []string{"view"},
				notes:   "Charts are hidden if the metrics source is missing.",
			},
		},
	},
	{
		id:    "workloads",
		title: "Workloads",
		modules: []catalogModuleDef{
			{id: "workloads.overview", label: "Overview", scope: ScopeNamespaced, actions: []string{"view"}},
			{
				id:      "pods",
				label:   "Pods",
				scope:   ScopeNamespaced,
				actions: []string{"view", "delete", "yaml_edit", "logs", "exec"},
				notes:   "No structured create. yaml_edit allows editing container env on the owning workload. Pod YAML is view-only.",
			},
			{id: "deployments", label: "Deployments", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit", "scale", "restart", "rollback"}},
			{id: "statefulsets", label: "StatefulSets", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit", "scale", "restart"}},
			{id: "daemonsets", label: "DaemonSets", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit", "restart"}},
			{id: "replicasets", label: "ReplicaSets", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit", "scale"}},
			{id: "jobs", label: "Jobs", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "cronjobs", label: "CronJobs", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit", "trigger"}},
		},
	},
	{
		id:    "config",
		title: "Config",
		modules: []catalogModuleDef{
			{id: "configmaps", label: "ConfigMaps", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{
				id:      "secrets",
				label:   "Secrets",
				scope:   ScopeNamespaced,
				actions: []string{"view", "create", "edit", "delete", "yaml_edit", "reveal"},
				notes:   "Without reveal, secret data is never returned.",
			},
			{id: "resourcequotas", label: "ResourceQuotas", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "limitranges", label: "LimitRanges", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "hpas", label: "HPAs", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "pdbs", label: "PDBs", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "priorityclasses", label: "PriorityClasses", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "runtimeclasses", label: "RuntimeClasses", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "leases", label: "Leases", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
		},
	},
	{
		id:    "network",
		title: "Network",
		modules: []catalogModuleDef{
			{id: "services", label: "Services", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{
				id:      "endpoints",
				label:   "Endpoints",
				scope:   ScopeNamespaced,
				actions: []string{"view", "yaml_edit"},
				notes:   "Create/edit/delete omitted; endpoints are controller-owned.",
			},
			{id: "ingresses", label: "Ingresses", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "ingressclasses", label: "IngressClasses", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "networkpolicies", label: "NetworkPolicies", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
		},
	},
	{
		id:    "storage",
		title: "Storage",
		modules: []catalogModuleDef{
			{id: "pvcs", label: "PVCs", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "pvs", label: "PVs", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "storageclasses", label: "StorageClasses", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
		},
	},
	{
		id:    "access",
		title: "Access control",
		modules: []catalogModuleDef{
			{id: "serviceaccounts", label: "ServiceAccounts", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "roles", label: "Roles", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "rolebindings", label: "RoleBindings", scope: ScopeNamespaced, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "clusterroles", label: "ClusterRoles", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
			{id: "clusterrolebindings", label: "ClusterRoleBindings", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}},
		},
	},
	{
		id:    "custom_resources",
		title: "Custom resources",
		modules: []catalogModuleDef{
			{id: "crds", label: "CRDs", scope: ScopeCluster, actions: []string{"view", "create", "edit", "delete", "yaml_edit"}, notes: "CRD definitions, not instances."},
			{
				id:      "custom_resources",
				label:   "Custom resources",
				scope:   ScopeMixed,
				actions: []string{"view", "create", "edit", "delete", "yaml_edit"},
				notes:   "Namespaced CRs use the member namespace list; cluster CRs ignore it.",
			},
		},
	},
	{
		id:    "helm",
		title: "Helm",
		modules: []catalogModuleDef{
			{
				id:      "helm",
				label:   "Helm",
				scope:   ScopeNamespaced,
				actions: []string{"view", "install", "upgrade", "rollback", "uninstall"},
				notes:   "View is required for any Helm write action.",
			},
		},
	},
}

func init() {
	moduleActions = make(map[string][]string, 48)
	moduleScopes = make(map[string]ModuleScope, 48)
	for _, g := range catalogGroups {
		for _, m := range g.modules {
			CatalogModules = append(CatalogModules, m.id)
			moduleActions[m.id] = append([]string(nil), m.actions...)
			moduleScopes[m.id] = m.scope
		}
	}
}

// Catalog returns the grantable module matrix grouped for the owner UI.
func Catalog() []CatalogGroup {
	out := make([]CatalogGroup, 0, len(catalogGroups))
	for _, g := range catalogGroups {
		group := CatalogGroup{ID: g.id, Title: g.title, Modules: make([]CatalogModule, 0, len(g.modules))}
		for _, m := range g.modules {
			group.Modules = append(group.Modules, CatalogModule{
				ID:      m.id,
				Label:   m.label,
				Scope:   m.scope,
				Actions: append([]string(nil), m.actions...),
				Notes:   m.notes,
			})
		}
		out = append(out, group)
	}
	return out
}

// ModuleActions returns the canonical actions for a catalog module.
func ModuleActions(module string) []string {
	return append([]string(nil), moduleActions[module]...)
}

// KnownModule reports whether module is a grantable catalog module.
func KnownModule(module string) bool {
	_, ok := moduleActions[module]
	return ok
}

// NormalizeGrants copies grants, drops empty modules, and orders actions canonically.
func NormalizeGrants(grants map[string][]string) map[string][]string {
	out := make(map[string][]string)
	if grants == nil {
		return out
	}
	for module, actions := range grants {
		ordered := normalizeActions(module, actions)
		if len(ordered) == 0 {
			continue
		}
		out[module] = ordered
	}
	return out
}

func normalizeActions(module string, actions []string) []string {
	if len(actions) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(actions))
	var ordered []string
	for _, a := range moduleActions[module] {
		for _, got := range actions {
			if got == a && !seen[a] {
				seen[a] = true
				ordered = append(ordered, a)
			}
		}
	}
	for _, got := range actions {
		if got == "" || seen[got] {
			continue
		}
		seen[got] = true
		ordered = append(ordered, got)
	}
	return ordered
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
		if len(actions) == 0 {
			return fmt.Errorf("module %q requires at least view", module)
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
		if !hasView {
			return fmt.Errorf("module %q requires view", module)
		}
	}
	return nil
}
