package httpapi

import (
	"net/http"
	"time"

	"github.com/sahilkhaire/k8s-apis/internal/auth"
	"github.com/sahilkhaire/k8s-apis/internal/store"
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
	CreatedAt       string              `json:"createdAt,omitempty"`
	UpdatedAt       string              `json:"updatedAt,omitempty"`
}

type createPermissionSetRequest struct {
	Name              string              `json:"name"`
	Description       string              `json:"description"`
	Grants            map[string][]string `json:"grants"`
	CloneFromTemplate string              `json:"cloneFromTemplate"`
}

type updatePermissionSetRequest struct {
	Name        *string             `json:"name"`
	Description *string             `json:"description"`
	Grants      map[string][]string `json:"grants"`
}

func permissionSetPublic(ps *store.PermissionSet) permissionSetResponse {
	resp := permissionSetResponse{
		ID:              ps.ID,
		Name:            ps.Name,
		Description:     ps.Description,
		BuiltinTemplate: ps.BuiltinTemplate,
		Grants:          ps.Grants,
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
