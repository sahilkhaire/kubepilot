package kube

// WorkloadModules lists namespace-scoped workload resource path segments.
var WorkloadModules = []string{
	"pods",
	"deployments",
	"statefulsets",
	"daemonsets",
	"replicasets",
	"jobs",
	"cronjobs",
}

// ConfigModules lists config group resource path segments.
var ConfigModules = []string{
	"configmaps",
	"secrets",
	"resourcequotas",
	"limitranges",
	"hpas",
	"pdbs",
	"priorityclasses",
	"runtimeclasses",
	"leases",
}

// NetworkModules lists network group resource path segments.
var NetworkModules = []string{
	"services",
	"endpoints",
	"ingresses",
	"ingressclasses",
	"networkpolicies",
}

// StorageModules lists storage group resource path segments.
var StorageModules = []string{
	"pvcs",
	"pvs",
	"storageclasses",
}

// CatalogResourceModules lists all API-backed catalog modules (workloads + config + network + storage).
var CatalogResourceModules []string

func init() {
	CatalogResourceModules = append([]string{}, WorkloadModules...)
	CatalogResourceModules = append(CatalogResourceModules, ConfigModules...)
	CatalogResourceModules = append(CatalogResourceModules, NetworkModules...)
	CatalogResourceModules = append(CatalogResourceModules, StorageModules...)
}

// IsCatalogModule reports whether module is a registered catalog resource module.
func IsCatalogModule(module string) bool {
	_, ok := resources[module]
	return ok
}
