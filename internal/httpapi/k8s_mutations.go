package httpapi

import (
	"encoding/json"
	"log"
	"net/http"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/rbac"
	"github.com/zixflow/k8s/internal/store"
)

type confirmRequest struct {
	Confirm string `json:"confirm"`
}

type scaleRequest struct {
	Replicas *int32 `json:"replicas"`
}

type rollbackRequest struct {
	Revision *int64 `json:"revision"`
}

func registerK8sMutationRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/pods/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "pods")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/deployments/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "deployments")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/statefulsets/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "statefulsets")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/daemonsets/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "daemonsets")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/replicasets/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "replicasets")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/jobs/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "jobs")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/cronjobs/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadDelete(w, r, deps, "cronjobs")
	})

	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/deployments/{name}/scale", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadScale(w, r, deps, "deployments")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/statefulsets/{name}/scale", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadScale(w, r, deps, "statefulsets")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/replicasets/{name}/scale", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadScale(w, r, deps, "replicasets")
	})

	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/deployments/{name}/restart", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadRestart(w, r, deps, "deployments")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/statefulsets/{name}/restart", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadRestart(w, r, deps, "statefulsets")
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/daemonsets/{name}/restart", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadRestart(w, r, deps, "daemonsets")
	})

	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/deployments/{name}/rollback", func(w http.ResponseWriter, r *http.Request) {
		handleDeploymentRollback(w, r, deps)
	})

	mux.HandleFunc("POST /api/k8s/namespaces/{ns}/cronjobs/{name}/trigger", func(w http.ResponseWriter, r *http.Request) {
		handleCronJobTrigger(w, r, deps)
	})
}

func handleWorkloadDelete(w http.ResponseWriter, r *http.Request, deps Deps, module string) {
	if !isWorkloadModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")

	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !confirmMatches(r, name) {
		writeError(w, http.StatusBadRequest, "confirmation required")
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, module, "delete", ns) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), module, ns, name)
	if err != nil {
		log.Printf("kube exists %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := deps.Kube.DeleteResource(r.Context(), module, ns, name); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube delete %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, module, "delete", ns, name, nil)
	w.WriteHeader(http.StatusOK)
}

func handleWorkloadScale(w http.ResponseWriter, r *http.Request, deps Deps, module string) {
	ns := r.PathValue("ns")
	name := r.PathValue("name")

	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	replicas, ok := parseScaleRequest(w, r)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, module, "scale", ns) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), module, ns, name)
	if err != nil {
		log.Printf("kube exists %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := deps.Kube.ScaleResource(r.Context(), module, ns, name, replicas); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube scale %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, module, "scale", ns, name, map[string]any{"replicas": replicas})
	w.WriteHeader(http.StatusOK)
}

func handleWorkloadRestart(w http.ResponseWriter, r *http.Request, deps Deps, module string) {
	ns := r.PathValue("ns")
	name := r.PathValue("name")

	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, module, "restart", ns) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), module, ns, name)
	if err != nil {
		log.Printf("kube exists %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := deps.Kube.RestartResource(r.Context(), module, ns, name); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube restart %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, module, "restart", ns, name, nil)
	w.WriteHeader(http.StatusOK)
}

func handleDeploymentRollback(w http.ResponseWriter, r *http.Request, deps Deps) {
	const module = "deployments"
	ns := r.PathValue("ns")
	name := r.PathValue("name")

	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	revision, ok := parseRollbackRequest(w, r)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, module, "rollback", ns) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), module, ns, name)
	if err != nil {
		log.Printf("kube exists %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := deps.Kube.RollbackDeployment(r.Context(), ns, name, revision); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube rollback deployment: ns=%s name=%s err=%v", ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, module, "rollback", ns, name, map[string]any{"revision": revision})
	w.WriteHeader(http.StatusOK)
}

func handleCronJobTrigger(w http.ResponseWriter, r *http.Request, deps Deps) {
	const module = "cronjobs"
	ns := r.PathValue("ns")
	name := r.PathValue("name")

	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, module, "trigger", ns) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), module, ns, name)
	if err != nil {
		log.Printf("kube exists %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	jobName, err := deps.Kube.TriggerCronJob(r.Context(), ns, name)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube trigger cronjob: ns=%s name=%s err=%v", ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, module, "trigger", ns, name, map[string]any{"job": jobName})
	w.WriteHeader(http.StatusOK)
}

func authenticateKubeMutation(w http.ResponseWriter, r *http.Request, deps Deps) (*store.User, bool) {
	u, err := authenticateRequest(r, deps.Auth)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return nil, false
	}
	return u, true
}

func kubeMutationAllowed(w http.ResponseWriter, r *http.Request, deps Deps, u *store.User, module, action, namespace string) bool {
	var ps *rbac.PermissionSet
	if u.Role != store.RoleOwner {
		var loadErr error
		ps, loadErr = permissionSetForRBAC(r.Context(), deps.Store, u.PermissionSetID)
		if loadErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return false
		}
	}
	if !rbac.Allow(rbac.Request{
		User:          *u,
		InstallNS:     deps.InstallNS,
		PermissionSet: ps,
		Module:        module,
		Action:        action,
		Namespace:     namespace,
	}) {
		w.WriteHeader(http.StatusForbidden)
		return false
	}
	return true
}

func confirmMatches(r *http.Request, expectedName string) bool {
	var req confirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return false
	}
	return req.Confirm == expectedName
}

func parseScaleRequest(w http.ResponseWriter, r *http.Request) (int32, bool) {
	var req scaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Replicas == nil {
		writeError(w, http.StatusBadRequest, "replicas required")
		return 0, false
	}
	if *req.Replicas < 0 {
		writeError(w, http.StatusBadRequest, "replicas must be >= 0")
		return 0, false
	}
	return *req.Replicas, true
}

func parseRollbackRequest(w http.ResponseWriter, r *http.Request) (int64, bool) {
	var req rollbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Revision == nil {
		writeError(w, http.StatusBadRequest, "revision required")
		return 0, false
	}
	if *req.Revision < 0 {
		writeError(w, http.StatusBadRequest, "revision must be >= 0")
		return 0, false
	}
	return *req.Revision, true
}

func writeKubeMutationAudit(r *http.Request, deps Deps, u *store.User, module, action, ns, name string, details map[string]any) {
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
		Action:     action,
		Result:     "success",
		HTTPStatus: http.StatusOK,
		Kind:       kube.KindForModule(module),
		Namespace:  ns,
		Name:       name,
		Path:       r.URL.Path,
		Method:     r.Method,
		Details:    details,
	})
}
