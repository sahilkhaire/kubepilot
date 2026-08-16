package kube

import (
	"fmt"
	"strings"
)

// ParseGVK query param format: slash-separated apiVersion and kind, e.g. "v1/Pod" or "apps/v1/Deployment".
func ParseGVK(gvk string) (apiVersion, kind string, ok bool) {
	gvk = strings.TrimSpace(gvk)
	if gvk == "" {
		return "", "", false
	}
	parts := strings.Split(gvk, "/")
	switch len(parts) {
	case 2:
		return parts[0], parts[1], true
	case 3:
		return parts[0] + "/" + parts[1], parts[2], true
	default:
		return "", "", false
	}
}

// ModuleForKind maps a Kubernetes kind to a catalog resource module path segment.
func ModuleForKind(kind string) (string, bool) {
	for module, spec := range resources {
		if spec.kind == kind {
			return module, true
		}
	}
	return "", false
}

var moduleGVK = map[string]string{
	"pods":              "v1/Pod",
	"deployments":       "apps/v1/Deployment",
	"statefulsets":      "apps/v1/StatefulSet",
	"daemonsets":        "apps/v1/DaemonSet",
	"replicasets":       "apps/v1/ReplicaSet",
	"jobs":              "batch/v1/Job",
	"cronjobs":          "batch/v1/CronJob",
	"configmaps":        "v1/ConfigMap",
	"secrets":           "v1/Secret",
	"resourcequotas":    "v1/ResourceQuota",
	"limitranges":       "v1/LimitRange",
	"hpas":              "autoscaling/v2/HorizontalPodAutoscaler",
	"pdbs":              "policy/v1/PodDisruptionBudget",
	"leases":            "coordination.k8s.io/v1/Lease",
	"priorityclasses":   "scheduling.k8s.io/v1/PriorityClass",
	"runtimeclasses":    "node.k8s.io/v1/RuntimeClass",
	"services":          "v1/Service",
	"endpoints":         "v1/Endpoints",
	"ingresses":         "networking.k8s.io/v1/Ingress",
	"ingressclasses":    "networking.k8s.io/v1/IngressClass",
	"networkpolicies":   "networking.k8s.io/v1/NetworkPolicy",
	"pvcs":              "v1/PersistentVolumeClaim",
	"pvs":               "v1/PersistentVolume",
	"storageclasses":    "storage.k8s.io/v1/StorageClass",
	"nodes":             "v1/Node",
	"namespaces":        "v1/Namespace",
	"serviceaccounts":   "v1/ServiceAccount",
	"roles":             "rbac.authorization.k8s.io/v1/Role",
	"rolebindings":      "rbac.authorization.k8s.io/v1/RoleBinding",
	"clusterroles":      "rbac.authorization.k8s.io/v1/ClusterRole",
	"clusterrolebindings": "rbac.authorization.k8s.io/v1/ClusterRoleBinding",
}

// GVKForModule returns the slash GVK form for a catalog resource module.
func GVKForModule(module string) (string, error) {
	gvk, ok := moduleGVK[module]
	if !ok {
		return "", fmt.Errorf("unknown resource %q", module)
	}
	return gvk, nil
}
