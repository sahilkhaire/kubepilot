package rbac

import (
	"strings"

	"github.com/sahilkhaire/kubepilot/internal/store"
)

type Request struct {
	User          store.User
	InstallNS     string
	PermissionSet *PermissionSet // nil for owner
	Module        string
	Action        string
	Namespace     string // empty if cluster-scoped
	ClusterScoped bool
}

type PermissionSet struct {
	ID             string
	Name           string
	Description    string
	Grants         map[string][]string
	NamespaceScope string
	Namespaces     []string
	NamespaceRegex []string
}

func FromStore(ps *store.PermissionSet) *PermissionSet {
	if ps == nil {
		return nil
	}
	return &PermissionSet{
		ID:             ps.ID,
		Name:           ps.Name,
		Description:    ps.Description,
		Grants:         ps.Grants,
		NamespaceScope: ps.NamespaceScope,
		Namespaces:     append([]string(nil), ps.Namespaces...),
		NamespaceRegex: append([]string(nil), ps.NamespaceRegex...),
	}
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
	if !req.ClusterScoped && !NamespaceAllowed(req.PermissionSet, req.Namespace, req.InstallNS) {
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

func hasAction(actions []string, action string) bool {
	for _, a := range actions {
		if a == action {
			return true
		}
	}
	return false
}
