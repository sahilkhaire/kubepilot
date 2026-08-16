package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/zixflow/k8s/internal/rbac"
	"github.com/zixflow/k8s/internal/store"
)

type namespaceCreateRequest struct {
	Name        string            `json:"name"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

type namespaceEditRequest struct {
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

func registerK8sClusterRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/k8s/events", func(w http.ResponseWriter, r *http.Request) {
		handleListEvents(w, r, deps)
	})
	mux.HandleFunc("POST /api/k8s/namespaces", func(w http.ResponseWriter, r *http.Request) {
		handleCreateNamespace(w, r, deps)
	})
	mux.HandleFunc("PATCH /api/k8s/namespaces/{name}", func(w http.ResponseWriter, r *http.Request) {
		handleEditNamespace(w, r, deps)
	})
	mux.HandleFunc("POST /api/k8s/namespaces/{name}/delete", func(w http.ResponseWriter, r *http.Request) {
		handleDeleteNamespace(w, r, deps)
	})
	mux.HandleFunc("POST /api/k8s/nodes/{name}/cordon", func(w http.ResponseWriter, r *http.Request) {
		handleNodeCordon(w, r, deps, true, "cordon")
	})
	mux.HandleFunc("POST /api/k8s/nodes/{name}/uncordon", func(w http.ResponseWriter, r *http.Request) {
		handleNodeCordon(w, r, deps, false, "uncordon")
	})
	mux.HandleFunc("POST /api/k8s/nodes/{name}/drain", func(w http.ResponseWriter, r *http.Request) {
		handleNodeDrain(w, r, deps)
	})
}

func handleListEvents(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "events", "view", "", true)
	if !ok {
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
	searchNS := rbac.VisibleNamespaces(*u, deps.InstallNS, clusterNS)
	if u.Role == store.RoleOwner {
		searchNS = clusterNS
	}

	visibleSet := make(map[string]bool, len(searchNS))
	for _, ns := range searchNS {
		visibleSet[ns] = true
	}

	out := make([]corev1.Event, 0)
	for _, ns := range searchNS {
		events, err := deps.Kube.ListEventsInNamespace(r.Context(), ns)
		if err != nil {
			log.Printf("kube list events: ns=%s err=%v", ns, err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		for _, ev := range events {
			if eventVisibleToUser(*u, deps.InstallNS, ev, visibleSet) {
				out = append(out, ev)
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func eventVisibleToUser(u store.User, installNS string, ev corev1.Event, visibleSet map[string]bool) bool {
	if u.Role == store.RoleOwner {
		return true
	}
	evNS := strings.TrimSpace(ev.Namespace)
	if evNS == "" {
		return false
	}
	if evNS == installNS {
		return false
	}
	return visibleSet[evNS]
}

func handleCreateNamespace(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, "namespaces", "create", "", true) {
		return
	}

	var req namespaceCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	if deps.InstallNS != "" && name == deps.InstallNS {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	created, err := deps.Kube.CreateNamespace(r.Context(), name, req.Labels)
	if err != nil {
		if apierrors.IsAlreadyExists(err) {
			w.WriteHeader(http.StatusConflict)
			return
		}
		log.Printf("kube create namespace: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if len(req.Annotations) > 0 {
		created, err = deps.Kube.UpdateNamespaceMetadata(r.Context(), name, nil, req.Annotations)
		if err != nil {
			log.Printf("kube update namespace annotations: name=%s err=%v", name, err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	writeKubeMutationAudit(r, deps, u, "namespaces", "create", "", name, nil)
	writeJSON(w, http.StatusCreated, created)
}

func handleEditNamespace(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := r.PathValue("name")
	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, "namespaces", "edit", name, true) {
		return
	}

	var req namespaceEditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Labels == nil && req.Annotations == nil {
		writeError(w, http.StatusBadRequest, "labels or annotations required")
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	updated, err := deps.Kube.UpdateNamespaceMetadata(r.Context(), name, req.Labels, req.Annotations)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube edit namespace: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, "namespaces", "edit", "", name, nil)
	writeJSON(w, http.StatusOK, updated)
}

func handleDeleteNamespace(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := r.PathValue("name")
	if _, ok := authenticateKubeMutation(w, r, deps); !ok {
		return
	}
	if deps.InstallNS != "" && name == deps.InstallNS {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	handleResourceDelete(w, r, deps, "namespaces", "", name, true)
}

func handleNodeCordon(w http.ResponseWriter, r *http.Request, deps Deps, unschedulable bool, auditDetail string) {
	name := r.PathValue("name")
	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, "nodes", "cordon", "", true) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), "nodes", "", name)
	if err != nil {
		log.Printf("kube exists nodes: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := deps.Kube.CordonNode(r.Context(), name, unschedulable); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube cordon node: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	details := map[string]any{"action": auditDetail}
	writeKubeMutationAudit(r, deps, u, "nodes", "cordon", "", name, details)
	w.WriteHeader(http.StatusOK)
}

func handleNodeDrain(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := r.PathValue("name")
	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, "nodes", "drain", "", true) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	exists, err := deps.Kube.ObjectExists(r.Context(), "nodes", "", name)
	if err != nil {
		log.Printf("kube exists nodes: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err := deps.Kube.DrainNode(r.Context(), name); err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube drain node: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	writeKubeMutationAudit(r, deps, u, "nodes", "drain", "", name, nil)
	w.WriteHeader(http.StatusOK)
}
