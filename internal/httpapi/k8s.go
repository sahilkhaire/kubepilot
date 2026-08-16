package httpapi

import (
	"log"
	"net/http"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/sahilkhaire/kubepilot/internal/auth"
	"github.com/sahilkhaire/kubepilot/internal/kube"
	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
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
		handleGetNamespacedResource(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/{resource}", func(w http.ResponseWriter, r *http.Request) {
		handleListNamespacedResource(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/{resource}/{name}", func(w http.ResponseWriter, r *http.Request) {
		handleGetClusterResource(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/{resource}", func(w http.ResponseWriter, r *http.Request) {
		handleListClusterResource(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/workloads/overview", func(w http.ResponseWriter, r *http.Request) {
		handleWorkloadsOverview(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/cluster/overview", func(w http.ResponseWriter, r *http.Request) {
		handleClusterOverview(w, r, deps)
	})
	registerK8sClusterRoutes(mux, deps)
	registerK8sCustomResourceRoutes(mux, deps)
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

func handleListNamespacedResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	module := r.PathValue("resource")
	if !isNamespacedCatalogModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if ns == "_all" {
		handleListAllNamespacedResource(w, r, deps, module)
		return
	}
	reveal := false
	var revealUser *store.User
	if module == "secrets" && secretRevealRequested(r) {
		u, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "secrets", "reveal", ns, false)
		if !ok {
			return
		}
		reveal = true
		revealUser = u
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
	if module == "secrets" {
		items = sanitizeSecretList(items, reveal)
		if reveal && revealUser != nil {
			writeSecretRevealAudit(r, deps, revealUser, ns, "", map[string]any{
				"count": len(kube.ObjectNames(items)),
			})
		}
	}
	writeJSON(w, http.StatusOK, items)
}

func handleListAllNamespacedResource(w http.ResponseWriter, r *http.Request, deps Deps, module string) {
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
	allowed := map[string]bool{}
	for _, ns := range visible {
		if rbac.Allow(rbac.Request{
			User:          *u,
			InstallNS:     deps.InstallNS,
			PermissionSet: ps,
			Module:        module,
			Action:        "view",
			Namespace:     ns,
		}) {
			allowed[ns] = true
		}
	}
	if len(allowed) == 0 {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	items, err := deps.Kube.ListResource(r.Context(), module, "")
	if err != nil {
		log.Printf("kube list %s: all-namespaces err=%v", module, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	items = kube.FilterObjects(items, func(ns string) bool { return allowed[ns] })
	if module == "secrets" {
		items = sanitizeSecretList(items, false)
	}
	writeJSON(w, http.StatusOK, items)
}

func handleGetNamespacedResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	module := r.PathValue("resource")
	name := r.PathValue("name")
	if !isNamespacedCatalogModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	reveal := false
	var revealUser *store.User
	if module == "secrets" && secretRevealRequested(r) {
		u, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "secrets", "reveal", ns, false)
		if !ok {
			return
		}
		reveal = true
		revealUser = u
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
	if module == "secrets" {
		obj = sanitizeSecretGet(obj, reveal)
		if reveal && revealUser != nil {
			writeSecretRevealAudit(r, deps, revealUser, ns, name, nil)
		}
	}
	writeJSON(w, http.StatusOK, obj)
}

func handleListClusterResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	module := r.PathValue("resource")
	if !isClusterCatalogModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, module, "view", "", true); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	items, err := deps.Kube.ListResource(r.Context(), module, "")
	if err != nil {
		log.Printf("kube list %s: err=%v", module, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func handleGetClusterResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	module := r.PathValue("resource")
	name := r.PathValue("name")
	if !isClusterCatalogModule(module) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, module, "view", "", true); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	obj, err := deps.Kube.GetResource(r.Context(), module, "", name)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube get %s: name=%s err=%v", module, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, obj)
}

func handleResourceEvents(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	module := r.PathValue("resource")
	name := r.PathValue("name")
	if !kube.IsCatalogModule(module) || kube.ResourceClusterScoped(module) {
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
	if isAllNamespaces(ns) {
		handleWorkloadsOverviewAll(w, r, deps, u, ps)
		return
	}
	if !namespaceAccessible(*u, deps.InstallNS, ns) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if !rbac.Allow(rbac.Request{
		User:          *u,
		InstallNS:     deps.InstallNS,
		PermissionSet: ps,
		Module:        "workloads.overview",
		Action:        "view",
		Namespace:     ns,
	}) {
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

func handleWorkloadsOverviewAll(w http.ResponseWriter, r *http.Request, deps Deps, u *store.User, ps *rbac.PermissionSet) {
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
	allowed := false
	for _, ns := range visible {
		if rbac.Allow(rbac.Request{
			User:          *u,
			InstallNS:     deps.InstallNS,
			PermissionSet: ps,
			Module:        "workloads.overview",
			Action:        "view",
			Namespace:     ns,
		}) {
			allowed = true
			break
		}
	}
	if !allowed {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	counts := make(map[string]int)
	for _, module := range kube.WorkloadModules {
		total := 0
		moduleAllowed := false
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
			moduleAllowed = true
			n, err := deps.Kube.CountResource(r.Context(), module, ns)
			if err != nil {
				log.Printf("kube count %s: ns=%s err=%v", module, ns, err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			total += n
		}
		if moduleAllowed {
			counts[module] = total
		}
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
	if !rbac.Allow(rbac.Request{
		User:          *u,
		InstallNS:     deps.InstallNS,
		PermissionSet: ps,
		Module:        "cluster.overview",
		Action:        "view",
		ClusterScoped: true,
	}) {
		w.WriteHeader(http.StatusForbidden)
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

func isNamespacedCatalogModule(module string) bool {
	return kube.IsCatalogModule(module) && !kube.ResourceClusterScoped(module)
}

func isClusterCatalogModule(module string) bool {
	return kube.IsCatalogModule(module) && kube.ResourceClusterScoped(module)
}

func isAllNamespaces(ns string) bool {
	switch strings.TrimSpace(ns) {
	case "", "_all", "__all__":
		return true
	default:
		return false
	}
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
