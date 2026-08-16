package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/sahilkhaire/k8s-apis/internal/audit"
	"github.com/sahilkhaire/k8s-apis/internal/auth"
	"github.com/sahilkhaire/k8s-apis/internal/rbac"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

func registerPermissionSetRoutes(mux *http.ServeMux, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	mux.HandleFunc("GET /api/settings/permission-sets", func(w http.ResponseWriter, r *http.Request) {
		handleListPermissionSets(w, r, authSvc, st)
	})
	mux.HandleFunc("GET /api/settings/permission-sets/templates", func(w http.ResponseWriter, r *http.Request) {
		handlePermissionSetTemplates(w, r, authSvc)
	})
	mux.HandleFunc("POST /api/settings/permission-sets", func(w http.ResponseWriter, r *http.Request) {
		handleCreatePermissionSet(w, r, authSvc, st, auditor, trustProxy)
	})
	mux.HandleFunc("PATCH /api/settings/permission-sets/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleUpdatePermissionSet(w, r, authSvc, st, auditor, trustProxy)
	})
	mux.HandleFunc("DELETE /api/settings/permission-sets/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleDeletePermissionSet(w, r, authSvc, st, auditor, trustProxy)
	})
}

func handleListPermissionSets(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store) {
	if _, ok := requireOwner(w, r, authSvc); !ok {
		return
	}
	list, err := st.ListPermissionSets(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	out := make([]permissionSetResponse, 0, len(list))
	for _, ps := range list {
		out = append(out, permissionSetPublic(&ps))
	}
	writeJSON(w, http.StatusOK, out)
}

func handlePermissionSetTemplates(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) {
	if _, ok := requireOwner(w, r, authSvc); !ok {
		return
	}
	templates := rbac.Templates()
	out := make([]permissionSetResponse, 0, len(templates))
	for _, t := range templates {
		out = append(out, permissionSetPublic(&t))
	}
	writeJSON(w, http.StatusOK, out)
}

func handleCreatePermissionSet(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	var req createPermissionSetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}

	grants := req.Grants
	if req.CloneFromTemplate != "" {
		tmpl, ok := rbac.TemplateByBuiltin(req.CloneFromTemplate)
		if !ok {
			writeError(w, http.StatusBadRequest, "unknown template")
			return
		}
		grants = tmpl.Grants
	}
	if grants == nil {
		writeError(w, http.StatusBadRequest, "grants required")
		return
	}
	if err := rbac.ValidateGrants(grants); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now().UTC()
	psID, err := newPermissionSetID()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	ps := store.PermissionSet{
		ID:              psID,
		Name:            strings.TrimSpace(req.Name),
		Description:     strings.TrimSpace(req.Description),
		BuiltinTemplate: "",
		Grants:          cloneGrantsHTTP(grants),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := st.CreatePermissionSet(r.Context(), ps); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.permission_sets",
		Action:     "permission_set_create",
		HTTPStatus: http.StatusCreated,
		Name:       ps.Name,
		Details:    map[string]any{"permissionSetId": ps.ID},
	})
	writeJSON(w, http.StatusCreated, permissionSetPublic(&ps))
}

func handleUpdatePermissionSet(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	id := r.PathValue("id")
	existing, err := st.PermissionSet(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	var req updatePermissionSetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	updated := *existing
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "name required")
			return
		}
		updated.Name = name
	}
	if req.Description != nil {
		updated.Description = strings.TrimSpace(*req.Description)
	}
	if req.Grants != nil {
		if err := rbac.ValidateGrants(req.Grants); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		updated.Grants = cloneGrantsHTTP(req.Grants)
	}
	updated.UpdatedAt = time.Now().UTC()

	if err := st.UpdatePermissionSet(r.Context(), updated); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.permission_sets",
		Action:     "permission_set_edit",
		HTTPStatus: http.StatusOK,
		Name:       updated.Name,
		Details:    map[string]any{"permissionSetId": updated.ID},
	})
	writeJSON(w, http.StatusOK, permissionSetPublic(&updated))
}

func handleDeletePermissionSet(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	id := r.PathValue("id")
	existing, err := st.PermissionSet(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := st.DeletePermissionSet(r.Context(), id); err != nil {
		if err == store.ErrInUse {
			writeError(w, http.StatusConflict, "permission set in use")
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.permission_sets",
		Action:     "permission_set_delete",
		HTTPStatus: http.StatusNoContent,
		Name:       existing.Name,
		Details:    map[string]any{"permissionSetId": id},
	})
	w.WriteHeader(http.StatusNoContent)
}

func newPermissionSetID() (string, error) {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("generate permission set id: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

func cloneGrantsHTTP(grants map[string][]string) map[string][]string {
	out := make(map[string][]string, len(grants))
	for k, v := range grants {
		out[k] = append([]string(nil), v...)
	}
	return out
}
