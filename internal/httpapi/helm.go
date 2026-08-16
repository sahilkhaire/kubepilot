package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/sahilkhaire/k8s-apis/internal/audit"
	"github.com/sahilkhaire/k8s-apis/internal/helmctrl"
	"github.com/sahilkhaire/k8s-apis/internal/rbac"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

func registerHelmRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/helm/releases", func(w http.ResponseWriter, r *http.Request) {
		handleListHelmReleases(w, r, deps)
	})
	mux.HandleFunc("POST /api/helm/releases", func(w http.ResponseWriter, r *http.Request) {
		handleInstallHelmRelease(w, r, deps)
	})
	mux.HandleFunc("POST /api/helm/releases/{name}/upgrade", func(w http.ResponseWriter, r *http.Request) {
		handleUpgradeHelmRelease(w, r, deps)
	})
	mux.HandleFunc("POST /api/helm/releases/{name}/rollback", func(w http.ResponseWriter, r *http.Request) {
		handleRollbackHelmRelease(w, r, deps)
	})
	mux.HandleFunc("POST /api/helm/releases/{name}/uninstall", func(w http.ResponseWriter, r *http.Request) {
		handleUninstallHelmRelease(w, r, deps)
	})
}

type installHelmRequest struct {
	Name      string         `json:"name"`
	Namespace string         `json:"namespace"`
	Chart     string         `json:"chart"`
	Version   string         `json:"version,omitempty"`
	Values    map[string]any `json:"values,omitempty"`
}

type upgradeHelmRequest struct {
	Namespace string         `json:"namespace"`
	Chart     string         `json:"chart"`
	Version   string         `json:"version,omitempty"`
	Values    map[string]any `json:"values,omitempty"`
}

type rollbackHelmRequest struct {
	Namespace string `json:"namespace"`
	Revision  int    `json:"revision,omitempty"`
}

type uninstallHelmRequest struct {
	Namespace string `json:"namespace"`
}

func handleListHelmReleases(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ps, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
	if !ok {
		return
	}
	if deps.Helm == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	nsFilter := strings.TrimSpace(r.URL.Query().Get("namespace"))
	if nsFilter != "" {
		if !namespaceAccessible(*u, deps.InstallNS, nsFilter) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if !rbac.Allow(rbac.Request{
			User:          *u,
			InstallNS:     deps.InstallNS,
			PermissionSet: ps,
			Module:        "helm",
			Action:        "view",
			Namespace:     nsFilter,
		}) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		rels, err := deps.Helm.List(r.Context(), nsFilter)
		if err != nil {
			log.Printf("helm list ns=%s: err=%v", nsFilter, err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, rels)
		return
	}

	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	clusterNS, err := deps.Kube.ClusterNamespaces(r.Context())
	if err != nil {
		log.Printf("kube list namespaces: err=%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	visible := rbac.VisibleNamespaces(*u, deps.InstallNS, clusterNS)
	var out []helmctrl.Release
	for _, ns := range visible {
		if !rbac.Allow(rbac.Request{
			User:          *u,
			InstallNS:     deps.InstallNS,
			PermissionSet: ps,
			Module:        "helm",
			Action:        "view",
			Namespace:     ns,
		}) {
			continue
		}
		rels, err := deps.Helm.List(r.Context(), ns)
		if err != nil {
			log.Printf("helm list ns=%s: err=%v", ns, err)
			continue
		}
		out = append(out, rels...)
	}
	if out == nil {
		out = []helmctrl.Release{}
	}
	writeJSON(w, http.StatusOK, out)
}

func handleInstallHelmRelease(w http.ResponseWriter, r *http.Request, deps Deps) {
	var body installHelmRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.Name = strings.TrimSpace(body.Name)
	body.Chart = strings.TrimSpace(body.Chart)
	if body.Namespace == "" || body.Name == "" || body.Chart == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	u, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "helm", "install", body.Namespace, false)
	if !ok {
		return
	}
	if deps.Helm == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	rel, err := deps.Helm.Install(r.Context(), helmctrl.InstallRequest{
		Name:      body.Name,
		Namespace: body.Namespace,
		Chart:     body.Chart,
		Version:   body.Version,
		Values:    body.Values,
	})
	if err != nil {
		log.Printf("helm install name=%s ns=%s: err=%v", body.Name, body.Namespace, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	details := map[string]any{"chart": body.Chart}
	if body.Version != "" {
		details["version"] = body.Version
	}
	if rel != nil && rel.Revision > 0 {
		details["revision"] = rel.Revision
	}
	writeHelmMutationAudit(r, deps, u, "install", body.Namespace, body.Name, http.StatusCreated, details)
	writeJSON(w, http.StatusCreated, rel)
}

func handleUpgradeHelmRelease(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := strings.TrimSpace(r.PathValue("name"))
	var body upgradeHelmRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.Chart = strings.TrimSpace(body.Chart)
	if name == "" || body.Namespace == "" || body.Chart == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	u, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "helm", "upgrade", body.Namespace, false)
	if !ok {
		return
	}
	if deps.Helm == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	rel, err := deps.Helm.Upgrade(r.Context(), helmctrl.UpgradeRequest{
		Namespace: body.Namespace,
		Name:      name,
		Chart:     body.Chart,
		Version:   body.Version,
		Values:    body.Values,
	})
	if err != nil {
		log.Printf("helm upgrade name=%s ns=%s: err=%v", name, body.Namespace, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	details := map[string]any{"chart": body.Chart}
	if body.Version != "" {
		details["version"] = body.Version
	}
	if rel != nil && rel.Revision > 0 {
		details["revision"] = rel.Revision
	}
	writeHelmMutationAudit(r, deps, u, "upgrade", body.Namespace, name, http.StatusOK, details)
	writeJSON(w, http.StatusOK, rel)
}

func handleRollbackHelmRelease(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := strings.TrimSpace(r.PathValue("name"))
	var body rollbackHelmRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	body.Namespace = strings.TrimSpace(body.Namespace)
	if name == "" || body.Namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	u, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "helm", "rollback", body.Namespace, false)
	if !ok {
		return
	}
	if deps.Helm == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	rel, err := deps.Helm.Rollback(r.Context(), helmctrl.RollbackRequest{
		Namespace: body.Namespace,
		Name:      name,
		Revision:  body.Revision,
	})
	if err != nil {
		log.Printf("helm rollback name=%s ns=%s: err=%v", name, body.Namespace, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	details := map[string]any{}
	if body.Revision > 0 {
		details["revision"] = body.Revision
	} else if rel != nil && rel.Revision > 0 {
		details["revision"] = rel.Revision
	}
	writeHelmMutationAudit(r, deps, u, "rollback", body.Namespace, name, http.StatusOK, details)
	writeJSON(w, http.StatusOK, rel)
}

func handleUninstallHelmRelease(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := strings.TrimSpace(r.PathValue("name"))
	var body uninstallHelmRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	body.Namespace = strings.TrimSpace(body.Namespace)
	if name == "" || body.Namespace == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	u, ps, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
	if !ok {
		return
	}
	if !namespaceAccessible(*u, deps.InstallNS, body.Namespace) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if !rbac.Allow(rbac.Request{
		User:          *u,
		InstallNS:     deps.InstallNS,
		PermissionSet: ps,
		Module:        "helm",
		Action:        "uninstall",
		Namespace:     body.Namespace,
	}) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if deps.Helm == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	if err := deps.Helm.Uninstall(r.Context(), body.Namespace, name); err != nil {
		log.Printf("helm uninstall name=%s ns=%s: err=%v", name, body.Namespace, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeHelmMutationAudit(r, deps, u, "uninstall", body.Namespace, name, http.StatusNoContent, nil)
	w.WriteHeader(http.StatusNoContent)
}

func writeHelmMutationAudit(r *http.Request, deps Deps, u *store.User, action, ns, name string, status int, details map[string]any) {
	if deps.Audit == nil {
		return
	}
	writeAuditOrLog(r.Context(), deps.Audit, audit.Event{
		UserID:     u.ID,
		Username:   u.Username,
		Role:       string(u.Role),
		IP:         clientIP(r, deps.TrustProxy),
		UserAgent:  audit.TruncateUserAgent(r.UserAgent()),
		SessionID:  actorSessionID(r, deps.Auth),
		Module:     "helm",
		Action:     action,
		Result:     "success",
		HTTPStatus: status,
		Namespace:  ns,
		Name:       name,
		Path:       r.URL.Path,
		Method:     r.Method,
		Details:    details,
	})
}
