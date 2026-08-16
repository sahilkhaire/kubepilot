package httpapi

import (
	"log"
	"net/http"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/rbac"
	"github.com/zixflow/k8s/internal/store"
)

type searchHit struct {
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

func registerK8sRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/k8s/namespaces", func(w http.ResponseWriter, r *http.Request) {
		handleListNamespaces(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/search", func(w http.ResponseWriter, r *http.Request) {
		handleSearch(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/{resource}/{name}/events", func(w http.ResponseWriter, r *http.Request) {
		handleResourceEvents(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/{resource}/{name}", func(w http.ResponseWriter, r *http.Request) {
		handleGetResource(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/{resource}", func(w http.ResponseWriter, r *http.Request) {
		handleListResource(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/workloads/overview", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadsOverview(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/cluster/overview", func(w http.ResponseWriter, r *http.Request) {
		handleClusterOverview(w, r, deps)
	})
	registerK8sMutationRoutes(mux, deps)
	registerK8sYAMLRoutes(mux, deps)
}

func handleListNamespaces(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, _, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
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
	visible := rbac.VisibleNamespaces(*u, deps.InstallNS, clusterNS)
	writeJSON(w, http.StatusOK, visible)
}

func handleSearch(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ps, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	nsFilter := strings.TrimSpace(r.URL.Query().Get("namespace"))
	var searchNS []string
	if nsFilter != "" {
		if !namespaceAccessible(*u, deps.InstallNS, nsFilter) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		searchNS = []string{nsFilter}
	} else {
		clusterNS, err := deps.Kube.ClusterNamespaces(r.Context())
		if err != nil {
			log.Printf("kube list namespaces: err=%v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		searchNS = rbac.VisibleNamespaces(*u, deps.InstallNS, clusterNS)
	}

	qLower := strings.ToLower(q)
	hits := make([]searchHit, 0)
	for _, module := range kube.WorkloadModules {
		kind, ok := kube.ResourceKind(module)
		if !ok {
			continue
		}
		for _, ns := range searchNS {
			if !rbac.Allow(rbac.Request{
				User:          *u,
				InstallNS:     deps.InstallNS,
				PermissionSet: ps,
				Module:        module,
				Action:        "view",
				Namespace:     ns,
			}) {
				continue
			}
			items, err := deps.Kube.ListResource(r.Context(), module, ns)
			if err != nil {
				log.Printf("kube list %s: ns=%s err=%v", module, ns, err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			for _, name := range kube.ObjectNames(items) {
				if strings.Contains(strings.ToLower(name), qLower) {
					hits = append(hits, searchHit{Kind: kind, Namespace: ns, Name: name})
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, hits)
}

func handleListResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	module := r.PathValue("resource")
	if !isWorkloadModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, module, "view", ns, false); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	items, err := deps.Kube.ListResource(r.Context(), module, ns)
	if err != nil {
		log.Printf("kube list %s: ns=%s err=%v", module, ns, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func handleGetResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	module := r.PathValue("resource")
	name := r.PathValue("name")
	if !isWorkloadModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, module, "view", ns, false); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	obj, err := deps.Kube.GetResource(r.Context(), module, ns, name)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube get %s: ns=%s name=%s err=%v", module, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, obj)
}

func handleResourceEvents(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	module := r.PathValue("resource")
	name := r.PathValue("name")
	if !isWorkloadModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, module, "view", ns, false); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	kind, ok := kube.ResourceKind(module)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	events, err := deps.Kube.EventsForObject(r.Context(), ns, kind, name)
	if err != nil {
		log.Printf("kube events: ns=%s kind=%s name=%s err=%v", ns, kind, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if events == nil {
		events = []corev1.Event{}
	}
	writeJSON(w, http.StatusOK, events)
}

func handleWorkloadsOverview(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ps, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	if ns == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if !namespaceAccessible(*u, deps.InstallNS, ns) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	counts := make(map[string]int)
	for _, module := range kube.WorkloadModules {
		if !rbac.Allow(rbac.Request{
			User:          *u,
			InstallNS:     deps.InstallNS,
			PermissionSet: ps,
			Module:        module,
			Action:        "view",
			Namespace:     ns,
		}) {
			continue
		}
		n, err := deps.Kube.CountResource(r.Context(), module, ns)
		if err != nil {
			log.Printf("kube count %s: ns=%s err=%v", module, ns, err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		counts[module] = n
	}
	writeJSON(w, http.StatusOK, counts)
}

func handleClusterOverview(w http.ResponseWriter, r *http.Request, deps Deps) {
	u, ps, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
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
	visible := rbac.VisibleNamespaces(*u, deps.InstallNS, clusterNS)

	counts := make(map[string]int)
	for _, module := range kube.WorkloadModules {
		total := 0
		allowed := false
		for _, ns := range visible {
			if !rbac.Allow(rbac.Request{
				User:          *u,
				InstallNS:     deps.InstallNS,
				PermissionSet: ps,
				Module:        module,
				Action:        "view",
				Namespace:     ns,
			}) {
				continue
			}
			allowed = true
			n, err := deps.Kube.CountResource(r.Context(), module, ns)
			if err != nil {
				log.Printf("kube count %s: ns=%s err=%v", module, ns, err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			total += n
		}
		if allowed {
			counts[module] = total
		}
	}
	writeJSON(w, http.StatusOK, counts)
}

func isWorkloadModule(module string) bool {
	for _, m := range kube.WorkloadModules {
		if m == module {
			return true
		}
	}
	return false
}

func namespaceAccessible(u store.User, installNS, namespace string) bool {
	if u.Role == store.RoleOwner {
		return true
	}
	if installNS != "" && namespace == installNS {
		return false
	}
	for _, n := range u.Namespaces {
		if n == "*" || n == namespace {
			return true
		}
	}
	return false
}

func authenticateForKube(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store) (*store.User, *rbac.PermissionSet, bool) {
	u, err := authenticateRequest(r, authSvc)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return nil, nil, false
	}

	var ps *rbac.PermissionSet
	if u.Role != store.RoleOwner {
		var loadErr error
		ps, loadErr = permissionSetForRBAC(r.Context(), st, u.PermissionSetID)
		if loadErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return nil, nil, false
		}
	}
	return u, ps, true
}
