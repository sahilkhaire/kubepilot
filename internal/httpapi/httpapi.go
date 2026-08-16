package httpapi

import (
	"context"
	"net/http"
	"os"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/store"
)

type Deps struct {
	Ready      func(context.Context) error
	Auth       *auth.Service
	Store      store.Store
	Audit      *audit.Auditor
	InstallNS  string
	TrustProxy bool
	WebDist    string // optional; falls back to WEB_DIST env
}

func New(deps Deps) http.Handler {
	mux := http.NewServeMux()
	if deps.Auth != nil {
		registerAuthRoutes(mux, deps.Auth, deps.Audit, deps.TrustProxy)
	}
	if deps.Auth != nil && deps.Store != nil {
		registerPermissionSetRoutes(mux, deps.Auth, deps.Store, deps.Audit, deps.TrustProxy)
		registerMemberRoutes(mux, deps.Auth, deps.Store, deps.InstallNS, deps.Audit, deps.TrustProxy)
		registerAuditRoutes(mux, deps.Auth, deps.Store, deps.Audit, deps.TrustProxy)
	}
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ready := deps.Ready
		if ready == nil {
			w.WriteHeader(http.StatusOK)
			return
		}
		if err := ready(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	webDist := deps.WebDist
	if webDist == "" {
		webDist = os.Getenv("WEB_DIST")
	}
	handler := http.Handler(mux)
	if deps.Auth != nil {
		handler = mustChangePasswordMiddleware(deps.Auth, handler)
	}
	if deps.Audit != nil && deps.Auth != nil {
		handler = auditDeniedMiddleware(deps.Audit, deps.Auth, deps.TrustProxy, handler)
	}
	return registerSPARoutes(handler, webDist)
}
