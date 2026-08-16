package kube

import (
	"fmt"
	"strings"
)

// GVK query param format: slash-separated apiVersion and kind, e.g. "v1/Pod" or "apps/v1/Deployment".
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

// ModuleForKind maps a Kubernetes kind to a workload module path segment.
func ModuleForKind(kind string) (string, bool) {
	for module, spec := range resources {
		if spec.kind == kind {
			return module, true
		}
	}
	return "", false
}

// GVKForModule returns the slash GVK form for a workload module.
func GVKForModule(module string) (string, error) {
	spec, ok := resources[module]
	if !ok {
		return "", fmt.Errorf("unknown resource %q", module)
	}
	switch module {
	case "pods":
		return "v1/Pod", nil
	case "deployments", "statefulsets", "daemonsets", "replicasets":
		return "apps/v1/" + spec.kind, nil
	case "jobs", "cronjobs":
		return "batch/v1/" + spec.kind, nil
	default:
		return "", fmt.Errorf("unknown resource %q", module)
	}
}
