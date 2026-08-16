package rbac

import (
	"strings"

	"github.com/sahilkhaire/k8s-apis/internal/store"
)

type Request struct {
	User            store.User
	InstallNS       string
	PermissionSet   *PermissionSet // nil for owner
	Module          string
	Action          string
	Namespace       string // empty if cluster-scoped
	ClusterScoped   bool
}

type PermissionSet struct {
	ID          string
	Name        string
	Description string
	Grants      map[string][]string
}

func Allow(req Request) bool {
	if req.User.Role == store.RoleOwner {
		return true
	}
	if !req.User.Enabled {
		return false
	}
	if req.PermissionSet == nil {
		return false
	}
	if strings.HasPrefix(req.Module, "settings.") {
		return false
	}
	if req.InstallNS != "" && req.Namespace == req.InstallNS {
		return false
	}
	if !req.ClusterScoped && !namespaceAllowed(req.User.Namespaces, req.Namespace) {
		return false
	}
	actions, ok := req.PermissionSet.Grants[req.Module]
	if !ok {
		return false
	}
	if !hasAction(actions, req.Action) {
		return false
	}
	if req.Action != "view" && !hasAction(actions, "view") {
		return false
	}
	return true
}

func namespaceAllowed(namespaces []string, ns string) bool {
	for _, n := range namespaces {
		if n == "*" || n == ns {
			return true
		}
	}
	return false
}

func hasAction(actions []string, action string) bool {
	for _, a := range actions {
		if a == action {
			return true
		}
	}
	return false
}
