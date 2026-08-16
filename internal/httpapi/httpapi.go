package httpapi

import (
	"context"
	"net/http"

	"github.com/zixflow/k8s/internal/auth"
)

type Deps struct {
	Ready func(context.Context) error
	Auth  *auth.Service
}

func New(deps Deps) http.Handler {
	mux := http.NewServeMux()
	if deps.Auth != nil {
		registerAuthRoutes(mux, deps.Auth)
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
	return mux
}
