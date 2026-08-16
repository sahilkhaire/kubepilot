package httpapi

import (
	"net/http"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/auth"
	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

func requireOwner(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) (*store.User, bool) {
	u, err := authenticateRequest(r, authSvc)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return nil, false
	}
	if u.Role != store.RoleOwner {
		w.WriteHeader(http.StatusForbidden)
		return nil, false
	}
	return u, true
}

type permissionSetResponse struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	Description     string              `json:"description"`
	BuiltinTemplate string              `json:"builtinTemplate,omitempty"`
	Grants          map[string][]string `json:"grants"`
	NamespaceScope  string              `json:"namespaceScope"`
	Namespaces      []string            `json:"namespaces"`
	NamespaceRegex  []string            `json:"namespaceRegex"`
	MemberCount     int                 `json:"memberCount"`
	CreatedAt       string              `json:"createdAt,omitempty"`
	UpdatedAt       string              `json:"updatedAt,omitempty"`
}

type createPermissionSetRequest struct {
	Name              string              `json:"name"`
	Description       string              `json:"description"`
	Grants            map[string][]string `json:"grants"`
	CloneFromTemplate string              `json:"cloneFromTemplate"`
	NamespaceScope    string              `json:"namespaceScope"`
	Namespaces        []string            `json:"namespaces"`
	NamespaceRegex    []string            `json:"namespaceRegex"`
}

type updatePermissionSetRequest struct {
	Name           *string             `json:"name"`
	Description    *string             `json:"description"`
	Grants         map[string][]string `json:"grants"`
	NamespaceScope *string             `json:"namespaceScope"`
	Namespaces     *[]string           `json:"namespaces"`
	NamespaceRegex *[]string           `json:"namespaceRegex"`
}

func permissionSetPublic(ps *store.PermissionSet) permissionSetResponse {
	return permissionSetPublicWithCount(ps, 0)
}

func permissionSetPublicWithCount(ps *store.PermissionSet, memberCount int) permissionSetResponse {
	resp := permissionSetResponse{
		ID:              ps.ID,
		Name:            ps.Name,
		Description:     ps.Description,
		BuiltinTemplate: ps.BuiltinTemplate,
		Grants:          ps.Grants,
		NamespaceScope:  ps.NamespaceScope,
		Namespaces:      ps.Namespaces,
		NamespaceRegex:  ps.NamespaceRegex,
		MemberCount:     memberCount,
	}
	if resp.Namespaces == nil {
		resp.Namespaces = []string{}
	}
	if resp.NamespaceRegex == nil {
		resp.NamespaceRegex = []string{}
	}
	if resp.NamespaceScope == "" {
		resp.NamespaceScope = rbac.NamespaceScopeAll
	}
	if !ps.CreatedAt.IsZero() {
		resp.CreatedAt = ps.CreatedAt.UTC().Format(time.RFC3339)
	}
	if !ps.UpdatedAt.IsZero() {
		resp.UpdatedAt = ps.UpdatedAt.UTC().Format(time.RFC3339)
	}
	return resp
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}
