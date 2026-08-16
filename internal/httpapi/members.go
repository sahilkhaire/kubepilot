package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/audit"
	"github.com/sahilkhaire/kubepilot/internal/auth"
	"github.com/sahilkhaire/kubepilot/internal/password"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

var usernameRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{1,31}$`)

type memberResponse struct {
	ID                 string `json:"id"`
	Username           string `json:"username"`
	DisplayName        string `json:"displayName"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"mustChangePassword"`
	Enabled            bool   `json:"enabled"`
	PermissionSetID    string `json:"permissionSetId"`
	CreatedAt          string `json:"createdAt,omitempty"`
	UpdatedAt          string `json:"updatedAt,omitempty"`
	CreatedBy          string `json:"createdBy,omitempty"`
}

type createMemberRequest struct {
	Username        string `json:"username"`
	DisplayName     string `json:"displayName"`
	PermissionSetID string `json:"permissionSetId"`
	Password        string `json:"password"`
}

type createMemberResponse struct {
	User     memberResponse `json:"user"`
	Password string         `json:"password"`
}

type updateMemberRequest struct {
	DisplayName     *string `json:"displayName"`
	PermissionSetID *string `json:"permissionSetId"`
	Enabled         *bool   `json:"enabled"`
}

type resetPasswordRequest struct {
	Password string `json:"password"`
}

type resetPasswordResponse struct {
	Password string `json:"password"`
}

func registerMemberRoutes(mux *http.ServeMux, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	mux.HandleFunc("GET /api/settings/members", func(w http.ResponseWriter, r *http.Request) {
		handleListMembers(w, r, authSvc, st)
	})
	mux.HandleFunc("POST /api/settings/members", func(w http.ResponseWriter, r *http.Request) {
		handleCreateMember(w, r, authSvc, st, auditor, trustProxy)
	})
	mux.HandleFunc("PATCH /api/settings/members/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleUpdateMember(w, r, authSvc, st, auditor, trustProxy)
	})
	mux.HandleFunc("DELETE /api/settings/members/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleDeleteMember(w, r, authSvc, st, auditor, trustProxy)
	})
	mux.HandleFunc("POST /api/settings/members/{id}/reset-password", func(w http.ResponseWriter, r *http.Request) {
		handleResetMemberPassword(w, r, authSvc, st, auditor, trustProxy)
	})
}

func handleListMembers(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store) {
	if _, ok := requireOwner(w, r, authSvc); !ok {
		return
	}
	list, err := st.ListMembers(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	out := make([]memberResponse, 0, len(list))
	for _, u := range list {
		out = append(out, memberPublic(&u))
	}
	writeJSON(w, http.StatusOK, out)
}

func handleCreateMember(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	var req createMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	username := strings.ToLower(strings.TrimSpace(req.Username))
	if !usernameRegex.MatchString(username) {
		writeError(w, http.StatusBadRequest, "invalid username")
		return
	}
	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" || len(displayName) > 80 {
		writeError(w, http.StatusBadRequest, "display name required")
		return
	}
	if strings.TrimSpace(req.PermissionSetID) == "" {
		writeError(w, http.StatusBadRequest, "permission set required")
		return
	}

	ps, err := st.PermissionSet(r.Context(), req.PermissionSetID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if ps == nil {
		writeError(w, http.StatusBadRequest, "permission set not found")
		return
	}

	existing, err := st.UserByUsername(r.Context(), username)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing != nil {
		writeError(w, http.StatusConflict, "username taken")
		return
	}

	plain, mustChange, err := resolveMemberPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := password.Hash(plain)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	memberID, err := newMemberID()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	u := store.User{
		ID:                 memberID,
		Username:           username,
		DisplayName:        displayName,
		Role:               store.RoleMember,
		PasswordHash:       hash,
		MustChangePassword: mustChange,
		Enabled:            true,
		PermissionSetID:    req.PermissionSetID,
		CreatedAt:          now,
		UpdatedAt:          now,
		CreatedBy:          owner.ID,
	}
	if err := st.CreateMember(r.Context(), u); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.members",
		Action:     "member_create",
		HTTPStatus: http.StatusCreated,
		Name:       u.Username,
		Details:    map[string]any{"memberId": u.ID, "username": u.Username},
	})
	writeJSON(w, http.StatusCreated, createMemberResponse{
		User:     memberPublic(&u),
		Password: plain,
	})
}

func handleUpdateMember(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	id := r.PathValue("id")
	existing, err := st.UserByID(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if existing.Role != store.RoleMember {
		writeError(w, http.StatusForbidden, "cannot modify owner")
		return
	}

	var req updateMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	updated := *existing
	if req.DisplayName != nil {
		name := strings.TrimSpace(*req.DisplayName)
		if name == "" || len(name) > 80 {
			writeError(w, http.StatusBadRequest, "display name required")
			return
		}
		updated.DisplayName = name
	}
	if req.PermissionSetID != nil {
		psID := strings.TrimSpace(*req.PermissionSetID)
		if psID == "" {
			writeError(w, http.StatusBadRequest, "permission set required")
			return
		}
		ps, err := st.PermissionSet(r.Context(), psID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if ps == nil {
			writeError(w, http.StatusBadRequest, "permission set not found")
			return
		}
		updated.PermissionSetID = psID
	}
	wasEnabled := existing.Enabled
	if req.Enabled != nil {
		if !*req.Enabled && existing.Role == store.RoleOwner {
			writeError(w, http.StatusForbidden, "cannot disable owner")
			return
		}
		updated.Enabled = *req.Enabled
		if wasEnabled && !updated.Enabled {
			_ = st.DeleteSessionsForUser(r.Context(), id)
		}
	}
	updated.UpdatedAt = time.Now().UTC()

	if err := st.UpdateMember(r.Context(), updated); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	action := "member_edit"
	if req.Enabled != nil && wasEnabled != updated.Enabled {
		if updated.Enabled {
			action = "member_enable"
		} else {
			action = "member_disable"
		}
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.members",
		Action:     action,
		HTTPStatus: http.StatusOK,
		Name:       updated.Username,
		Details:    map[string]any{"memberId": updated.ID},
	})
	writeJSON(w, http.StatusOK, memberPublic(&updated))
}

func handleDeleteMember(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	id := r.PathValue("id")
	existing, err := st.UserByID(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if existing.Role != store.RoleMember {
		writeError(w, http.StatusForbidden, "cannot delete owner")
		return
	}

	if err := st.DeleteMember(r.Context(), id); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.members",
		Action:     "member_delete",
		HTTPStatus: http.StatusNoContent,
		Name:       existing.Username,
		Details:    map[string]any{"memberId": id},
	})
	w.WriteHeader(http.StatusNoContent)
}

func handleResetMemberPassword(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	id := r.PathValue("id")
	existing, err := st.UserByID(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if existing.Role != store.RoleMember {
		writeError(w, http.StatusForbidden, "cannot reset owner password")
		return
	}

	var req resetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	plain, mustChange, err := resolveMemberPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := password.Hash(plain)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if err := st.ResetMemberPassword(r.Context(), id, hash, mustChange); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if err := st.DeleteSessionsForUser(r.Context(), id); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeSettingsAudit(r, auditor, authSvc, trustProxy, owner, audit.Event{
		Module:     "settings.members",
		Action:     "member_password_reset",
		HTTPStatus: http.StatusOK,
		Name:       existing.Username,
		Details:    map[string]any{"memberId": id},
	})
	writeJSON(w, http.StatusOK, resetPasswordResponse{Password: plain})
}

func memberPublic(u *store.User) memberResponse {
	resp := memberResponse{
		ID:                 u.ID,
		Username:           u.Username,
		DisplayName:        u.DisplayName,
		Role:               string(u.Role),
		MustChangePassword: u.MustChangePassword,
		Enabled:            u.Enabled,
		PermissionSetID:    u.PermissionSetID,
		CreatedBy:          u.CreatedBy,
	}
	if !u.CreatedAt.IsZero() {
		resp.CreatedAt = u.CreatedAt.UTC().Format(time.RFC3339)
	}
	if !u.UpdatedAt.IsZero() {
		resp.UpdatedAt = u.UpdatedAt.UTC().Format(time.RFC3339)
	}
	return resp
}

func newMemberID() (string, error) {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("generate member id: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

func resolveMemberPassword(provided string) (string, bool, error) {
	if provided == "" {
		return password.Generate(24), true, nil
	}
	if err := password.Validate(provided); err != nil {
		return "", false, err
	}
	return provided, false, nil
}
