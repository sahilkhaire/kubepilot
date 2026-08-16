package httpapi

import (
	"encoding/json"
	"net"
	"net/http"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/store"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
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

func registerAuthRoutes(mux *http.ServeMux, authSvc *auth.Service) {
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		handleLogin(w, r, authSvc)
	})
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		handleLogout(w, r, authSvc)
	})
	mux.HandleFunc("GET /api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		handleMe(w, r, authSvc)
	})
	mux.HandleFunc("POST /api/auth/password", func(w http.ResponseWriter, r *http.Request) {
		handlePassword(w, r, authSvc)
	})
}

func handleLogin(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeLoginError(w)
		return
	}

	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		ip = host
	}

	sessionID, u, err := authSvc.Login(r.Context(), req.Username, req.Password, ip, r.UserAgent())
	if err != nil {
		writeLoginError(w)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    authSvc.SignCookie(sessionID),
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, loginResponse{
		Username:           u.Username,
		Role:               string(u.Role),
		MustChangePassword: u.MustChangePassword,
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request, authSvc *auth.Service) {
	if sessionID, ok := sessionFromRequest(r, authSvc); ok {
		_ = authSvc.Logout(r.Context(), sessionID)
	}
	clearSessionCookie(w)
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
	w.WriteHeader(http.StatusNotImplemented)
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

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
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
