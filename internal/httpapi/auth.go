package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/sahilkhaire/k8s-apis/internal/audit"
	"github.com/sahilkhaire/k8s-apis/internal/auth"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type passwordChangeRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type loginResponse struct {
	Username           string `json:"username"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"mustChangePassword"`
}

type publicUser struct {
	Username           string   `json:"username"`
	DisplayName        string   `json:"displayName"`
	Role               string   `json:"role"`
	MustChangePassword bool     `json:"mustChangePassword"`
	Enabled            bool     `json:"enabled"`
	PermissionSetID    string   `json:"permissionSetId,omitempty"`
	Namespaces         []string `json:"namespaces,omitempty"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func registerAuthRoutes(mux *http.ServeMux, authSvc *auth.Service, auditor *audit.Auditor, trustProxy bool) {
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		handleLogin(w, r, authSvc, auditor, trustProxy)
	})
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		handleLogout(w, r, authSvc, auditor, trustProxy)
	})
	mux.HandleFunc("GET /api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		handleMe(w, r, authSvc)
	})
	mux.HandleFunc("POST /api/auth/password", func(w http.ResponseWriter, r *http.Request) {
		handlePassword(w, r, authSvc)
	})
}

func handleLogin(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, auditor *audit.Auditor, trustProxy bool) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeLoginError(w)
		return
	}

	ip := clientIP(r, trustProxy)

	sessionID, u, err := authSvc.Login(r.Context(), req.Username, req.Password, ip, r.UserAgent())
	if err != nil {
		writeAuthAudit(r, auditor, trustProxy, audit.Event{
			Username:   req.Username,
			Role:       "anonymous",
			Module:     "auth",
			Action:     "login_failed",
			Result:     "denied",
			HTTPStatus: http.StatusUnauthorized,
			Details:    map[string]any{"username": req.Username},
		})
		writeLoginError(w)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    authSvc.SignCookie(sessionID),
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure(r, trustProxy),
		SameSite: http.SameSiteLaxMode,
	})
	writeAuthAudit(r, auditor, trustProxy, audit.Event{
		UserID:     u.ID,
		Username:   u.Username,
		Role:       string(u.Role),
		SessionID:  sessionID,
		Module:     "auth",
		Action:     "login",
		Result:     "success",
		HTTPStatus: http.StatusOK,
	})
	writeJSON(w, http.StatusOK, loginResponse{
		Username:           u.Username,
		Role:               string(u.Role),
		MustChangePassword: u.MustChangePassword,
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, auditor *audit.Auditor, trustProxy bool) {
	var actor *store.User
	var sessionID string
	if sid, ok := sessionFromRequest(r, authSvc); ok {
		sessionID = sid
		if u, _, err := authSvc.Authenticate(r.Context(), sid); err == nil {
			actor = u
		}
		_ = authSvc.Logout(r.Context(), sid)
	}
	if actor != nil {
		writeAuthAudit(r, auditor, trustProxy, audit.Event{
			UserID:     actor.ID,
			Username:   actor.Username,
			Role:       string(actor.Role),
			SessionID:  sessionID,
			Module:     "auth",
			Action:     "logout",
			Result:     "success",
			HTTPStatus: http.StatusNoContent,
		})
	}
	clearSessionCookie(w, r, trustProxy)
	w.WriteHeader(http.StatusNoContent)
}

func handleMe(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) {
	u, err := authenticateRequest(r, authSvc)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	writeJSON(w, http.StatusOK, userPublic(u))
}

func handlePassword(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) {
	u, err := authenticateRequest(r, authSvc)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if u.Role == store.RoleOwner {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	var req passwordChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeLoginError(w)
		return
	}
	if err := authSvc.ChangePassword(r.Context(), u.ID, req.CurrentPassword, req.NewPassword); err != nil {
		if err == auth.ErrInvalidCredentials {
			writeLoginError(w)
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func authenticateRequest(r *http.Request, authSvc *auth.Service) (*store.User, error) {
	sessionID, ok := sessionFromRequest(r, authSvc)
	if !ok {
		return nil, auth.ErrSessionInvalid
	}
	u, _, err := authSvc.Authenticate(r.Context(), sessionID)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func sessionFromRequest(r *http.Request, authSvc *auth.Service) (string, bool) {
	c, err := r.Cookie(auth.CookieName)
	if err != nil || c.Value == "" {
		return "", false
	}
	return authSvc.ParseCookie(c.Value)
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request, trustProxy bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(r, trustProxy),
		SameSite: http.SameSiteLaxMode,
	})
}

func writeLoginError(w http.ResponseWriter) {
	writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "invalid credentials"})
}

func userPublic(u *store.User) publicUser {
	return publicUser{
		Username:           u.Username,
		DisplayName:        u.DisplayName,
		Role:               string(u.Role),
		MustChangePassword: u.MustChangePassword,
		Enabled:            u.Enabled,
		PermissionSetID:    u.PermissionSetID,
		Namespaces:         u.Namespaces,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
