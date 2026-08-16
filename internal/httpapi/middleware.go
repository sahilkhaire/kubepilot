package httpapi

import (
	"net/http"
	"strings"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/store"
)

func mustChangePasswordMiddleware(authSvc *auth.Service, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !mustChangePasswordRestricted(r) {
			next.ServeHTTP(w, r)
			return
		}

		u, err := authenticateRequest(r, authSvc)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}
		if u.Role == store.RoleMember && u.MustChangePassword {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func mustChangePasswordRestricted(r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		return false
	}

	switch r.Method + " " + r.URL.Path {
	case http.MethodPost + " /api/auth/login":
		return false
	case http.MethodGet + " /api/auth/me":
		return false
	case http.MethodPost + " /api/auth/password":
		return false
	case http.MethodPost + " /api/auth/logout":
		return false
	}

	return true
}
