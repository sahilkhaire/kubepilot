package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/sahilkhaire/k8s-apis/internal/auth"
	"github.com/sahilkhaire/k8s-apis/internal/rbac"
	"github.com/sahilkhaire/k8s-apis/internal/store"
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

func requireKubeAllow(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, installNS, module, action, namespace string, clusterScoped bool) (*store.User, bool) {
	u, err := authenticateRequest(r, authSvc)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return nil, false
	}

	var ps *rbac.PermissionSet
	if u.Role != store.RoleOwner {
		var loadErr error
		ps, loadErr = permissionSetForRBAC(r.Context(), st, u.PermissionSetID)
		if loadErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return nil, false
		}
	}

	if !rbac.Allow(rbac.Request{
		User:          *u,
		InstallNS:     installNS,
		PermissionSet: ps,
		Module:        module,
		Action:        action,
		Namespace:     namespace,
		ClusterScoped: clusterScoped,
	}) {
		w.WriteHeader(http.StatusForbidden)
		return nil, false
	}
	return u, true
}

func permissionSetForRBAC(ctx context.Context, st store.Store, id string) (*rbac.PermissionSet, error) {
	if id == "" {
		return nil, nil
	}
	ps, err := st.PermissionSet(ctx, id)
	if err != nil {
		return nil, err
	}
	if ps == nil {
		return nil, nil
	}
	return &rbac.PermissionSet{
		ID:          ps.ID,
		Name:        ps.Name,
		Description: ps.Description,
		Grants:      ps.Grants,
	}, nil
}
