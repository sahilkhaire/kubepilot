package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/audit"
	"github.com/sahilkhaire/kubepilot/internal/auth"
	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

const (
	permissionSetNameMax        = 80
	permissionSetDescriptionMax = 240
)

func registerPermissionSetRoutes(mux *http.ServeMux, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	mux.HandleFunc("GET /api/settings/permission-sets", func(w http.ResponseWriter, r *http.Request) {
		handleListPermissionSets(w, r, authSvc, st)
	})
	mux.HandleFunc("GET /api/settings/permission-sets/catalog", func(w http.ResponseWriter, r *http.Request) {
		handlePermissionSetCatalog(w, r, authSvc)
	})
	mux.HandleFunc("GET /api/settings/permission-sets/templates", func(w http.ResponseWriter, r *http.Request) {
		handlePermissionSetTemplates(w, r, authSvc)
	})
	mux.HandleFunc("GET /api/settings/permission-sets/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleGetPermissionSet(w, r, authSvc, st)
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
	counts, err := permissionSetMemberCounts(r, st)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	out := make([]permissionSetResponse, 0, len(list))
	for _, ps := range list {
		out = append(out, permissionSetPublicWithCount(&ps, counts[ps.ID]))
	}
	writeJSON(w, http.StatusOK, out)
}

func handlePermissionSetCatalog(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) {
	if _, ok := requireOwner(w, r, authSvc); !ok {
		return
	}
	writeJSON(w, http.StatusOK, rbac.Catalog())
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

func handleGetPermissionSet(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store) {
	if _, ok := requireOwner(w, r, authSvc); !ok {
		return
	}
	existing, err := st.PermissionSet(r.Context(), r.PathValue("id"))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	count := 0
	members, err := st.MembersByPermissionSetID(r.Context(), existing.ID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	count = len(members)
	writeJSON(w, http.StatusOK, permissionSetPublicWithCount(existing, count))
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
	name, err := validatePermissionSetName(req.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	description, err := validatePermissionSetDescription(req.Description)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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
	grants, err = prepareGrants(grants)
	if err != nil {
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
		Name:            name,
		Description:     description,
		BuiltinTemplate: "",
		Grants:          grants,
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
		name, err := validatePermissionSetName(*req.Name)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		updated.Name = name
	}
	if req.Description != nil {
		description, err := validatePermissionSetDescription(*req.Description)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		updated.Description = description
	}
	if req.Grants != nil {
		grants, err := prepareGrants(req.Grants)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		updated.Grants = grants
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
		if errors.Is(err, store.ErrInUse) {
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

func prepareGrants(grants map[string][]string) (map[string][]string, error) {
	normalized := rbac.NormalizeGrants(grants)
	if err := rbac.ValidateGrants(normalized); err != nil {
		return nil, err
	}
	return normalized, nil
}

func validatePermissionSetName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("name required")
	}
	if len(name) > permissionSetNameMax {
		return "", errors.New("name too long")
	}
	return name, nil
}

func validatePermissionSetDescription(description string) (string, error) {
	description = strings.TrimSpace(description)
	if len(description) > permissionSetDescriptionMax {
		return "", errors.New("description too long")
	}
	return description, nil
}

func permissionSetMemberCounts(r *http.Request, st store.Store) (map[string]int, error) {
	members, err := st.ListMembers(r.Context())
	if err != nil {
		return nil, err
	}
	counts := make(map[string]int)
	for _, m := range members {
		if m.PermissionSetID == "" {
			continue
		}
		counts[m.PermissionSetID]++
	}
	return counts, nil
}
