package httpapi

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/sahilkhaire/k8s-apis/internal/audit"
	"github.com/sahilkhaire/k8s-apis/internal/kube"
	"github.com/sahilkhaire/k8s-apis/internal/rbac"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

type yamlApplyRequest struct {
	YAML      string `json:"yaml"`
	Namespace string `json:"namespace"`
	Module    string `json:"module"`
}

func registerK8sYAMLRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/k8s/yaml", func(w http.ResponseWriter, r *http.Request) {
		handleGetYAML(w, r, deps)
	})
	mux.HandleFunc("POST /api/k8s/yaml/apply", func(w http.ResponseWriter, r *http.Request) {
		handleApplyYAML(w, r, deps)
	})
}

func handleGetYAML(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, err := authenticateRequest(r, deps.Auth)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	gvkParam := strings.TrimSpace(r.URL.Query().Get("gvk"))
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if gvkParam == "" || name == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	_, kind, ok := kube.ParseGVK(gvkParam)
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	module, ok := kube.ModuleForKind(kind)
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	clusterScoped := kube.ResourceClusterScoped(module)
	if !clusterScoped && ns == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	reveal := false
	if module == "secrets" && secretRevealRequested(r) {
		var ps *rbac.PermissionSet
		if u.Role != store.RoleOwner {
			ps, err = permissionSetForRBAC(r.Context(), deps.Store, u.PermissionSetID)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
		if !rbac.Allow(rbac.Request{
			User:          *u,
			InstallNS:     deps.InstallNS,
			PermissionSet: ps,
			Module:        "secrets",
			Action:        "reveal",
			Namespace:     ns,
		}) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		reveal = true
	}

	var ps *rbac.PermissionSet
	if u.Role != store.RoleOwner {
		ps, err = permissionSetForRBAC(r.Context(), deps.Store, u.PermissionSetID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
	if !rbac.Allow(rbac.Request{
		User:          *u,
		InstallNS:     deps.InstallNS,
		PermissionSet: ps,
		Module:        module,
		Action:        "view",
		Namespace:     ns,
		ClusterScoped: clusterScoped,
	}) {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	out, err := deps.Kube.GetResourceYAML(r.Context(), module, ns, name)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube get yaml %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if module == "secrets" && !reveal {
		out, err = kube.StripSecretYAML(out)
		if err != nil {
			log.Printf("strip secret yaml: err=%v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	} else if module == "secrets" && reveal {
		writeSecretRevealAudit(r, deps, u, ns, name, nil)
	}

	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out)
}

func handleApplyYAML(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}

	doc, nsOverride, moduleHint, ok := parseYAMLApplyBody(w, r)
	if !ok {
		return
	}
	if moduleHint == "" {
		moduleHint = strings.TrimSpace(r.URL.Query().Get("module"))
	}

	module, err := kube.ModuleFromYAML(doc)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if moduleHint != "" && moduleHint != module {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	kind := kube.KindForModule(module)
	clusterScoped := kube.ResourceClusterScoped(module)
	ns := nsOverride
	if !clusterScoped {
		if ns == "" {
			obj, parseErr := kube.ParseYAMLNamespace(doc)
			if parseErr == nil {
				ns = obj
			}
		}
		if ns == "" {
			writeError(w, http.StatusBadRequest, "namespace required")
			return
		}
	}

	if !kubeMutationAllowed(w, r, deps, u, module, "yaml_edit", ns, clusterScoped) {
		return
	}

	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	if err := deps.Kube.ApplyYAML(r.Context(), doc, nsOverride); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if apierrors.IsForbidden(err) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		log.Printf("kube apply yaml %s: ns=%s err=%v", module, ns, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	name := kube.YAMLObjectName(doc)
	writeKubeYAMLAudit(r, deps, u, module, ns, name, kind)
	w.WriteHeader(http.StatusOK)
}

func parseYAMLApplyBody(w http.ResponseWriter, r *http.Request) (doc []byte, nsOverride, moduleHint string, ok bool) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "application/yaml") || strings.HasPrefix(ct, "text/yaml") {
		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) == 0 {
			writeError(w, http.StatusBadRequest, "yaml required")
			return nil, "", "", false
		}
		return body, "", "", true
	}

	var req yamlApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.YAML) == "" {
		writeError(w, http.StatusBadRequest, "yaml required")
		return nil, "", "", false
	}
	return []byte(req.YAML), strings.TrimSpace(req.Namespace), strings.TrimSpace(req.Module), true
}

func writeKubeYAMLAudit(r *http.Request, deps Deps, u *store.User, module, ns, name, kind string) {
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
		Module:     module,
		Action:     "yaml_edit",
		Result:     "success",
		HTTPStatus: http.StatusOK,
		Kind:       kind,
		Namespace:  ns,
		Name:       name,
		Path:       r.URL.Path,
		Method:     r.Method,
	})
}
