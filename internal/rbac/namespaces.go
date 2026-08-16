package rbac

import "github.com/sahilkhaire/k8s-apis/internal/store"

func VisibleNamespaces(user store.User, installNS string, clusterNamespaces []string) []string {
	if len(clusterNamespaces) == 0 {
		return nil
	}

	out := make([]string, 0, len(clusterNamespaces))
	seen := make(map[string]struct{}, len(clusterNamespaces))
	for _, ns := range clusterNamespaces {
		if user.Role != store.RoleOwner && ns == installNS {
			continue
		}
		if user.Role != store.RoleOwner && !namespaceAllowed(user.Namespaces, ns) {
			continue
		}
		if _, ok := seen[ns]; ok {
			continue
		}
		seen[ns] = struct{}{}
		out = append(out, ns)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
