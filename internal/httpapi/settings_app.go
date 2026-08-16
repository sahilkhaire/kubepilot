package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/store"
)

func registerAppSettingsRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/settings/app", func(w http.ResponseWriter, r *http.Request) {
		handleGetAppSettings(w, r, deps)
	})
	mux.HandleFunc("PUT /api/settings/app", func(w http.ResponseWriter, r *http.Request) {
		handlePutAppSettings(w, r, deps)
	})
}

func handleGetAppSettings(w http.ResponseWriter, r *http.Request, deps Deps) {
	owner, ok := requireOwner(w, r, deps.Auth)
	if !ok {
		return
	}
	settings, err := deps.Store.GetAppSettings(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if settings == nil {
		settings = &store.AppSettings{HelmRepositories: []store.HelmRepository{}}
	}
	if settings.HelmRepositories == nil {
		settings.HelmRepositories = []store.HelmRepository{}
	}
	writeJSON(w, http.StatusOK, settings)
	_ = owner
}

func handlePutAppSettings(w http.ResponseWriter, r *http.Request, deps Deps) {
	owner, ok := requireOwner(w, r, deps.Auth)
	if !ok {
		return
	}
	var body store.AppSettings
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if body.HelmRepositories == nil {
		body.HelmRepositories = []store.HelmRepository{}
	}
	for i, repo := range body.HelmRepositories {
		body.HelmRepositories[i].Name = strings.TrimSpace(repo.Name)
		body.HelmRepositories[i].URL = strings.TrimSpace(repo.URL)
		if body.HelmRepositories[i].Name == "" || body.HelmRepositories[i].URL == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
	}
	if err := deps.Store.PutAppSettings(r.Context(), body); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if deps.Audit != nil {
		_ = deps.Audit.Write(r.Context(), audit.Event{
			UserID:     owner.ID,
			Username:   owner.Username,
			Role:       string(owner.Role),
			IP:         clientIP(r, deps.TrustProxy),
			UserAgent:  audit.TruncateUserAgent(r.UserAgent()),
			Module:     "settings.app",
			Action:     "edit",
			Result:     "success",
			HTTPStatus: http.StatusOK,
			Path:       r.URL.Path,
			Method:     r.Method,
		})
	}
	writeJSON(w, http.StatusOK, body)
}
