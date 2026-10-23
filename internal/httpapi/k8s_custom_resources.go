package httpapi

import (
	"log"
	"net/http"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

func registerK8sCustomResourceRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/k8s/crds", func(w http.ResponseWriter, r *http.Request) {
		handleListCRDs(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/crds/{name}", func(w http.ResponseWriter, r *http.Request) {
		handleGetCRD(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/custom-resources", func(w http.ResponseWriter, r *http.Request) {
		handleListCustomResources(w, r, deps)
	})
	mux.HandleFunc("GET /api/k8s/custom-resources/{name}", func(w http.ResponseWriter, r *http.Request) {
		handleGetCustomResource(w, r, deps)
	})
}

func handleListCRDs(w http.ResponseWriter, r *http.Request, deps Deps) {
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "crds", "view", "", true); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	items, err := deps.Kube.ListCRDs(r.Context())
	if err != nil {
		log.Printf("kube list crds: err=%v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func handleGetCRD(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := r.PathValue("name")
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "crds", "view", "", true); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	obj, err := deps.Kube.GetCRD(r.Context(), name)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube get crd: name=%s err=%v", name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, obj)
}

func handleListCustomResources(w http.ResponseWriter, r *http.Request, deps Deps) {
	group := strings.TrimSpace(r.URL.Query().Get("group"))
	version := strings.TrimSpace(r.URL.Query().Get("version"))
	resource := strings.TrimSpace(r.URL.Query().Get("resource"))
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	if isAllNamespaces(ns) {
		ns = ""
	}
	if group == "" || version == "" || resource == "" {
		writeError(w, http.StatusBadRequest, "group, version, and resource required")
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	namespaced, err := deps.Kube.CustomResourceNamespaced(r.Context(), group, resource)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube crd scope: group=%s resource=%s err=%v", group, resource, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if namespaced {
		if ns != "" {
			if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "custom_resources", "view", ns, false); !ok {
				return
			}
			items, err := deps.Kube.ListCustomResources(r.Context(), group, version, resource, ns, true)
			if err != nil {
				log.Printf("kube list custom resources: group=%s resource=%s ns=%s err=%v", group, resource, ns, err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, items)
			return
		}

		u, ps, ok := authenticateForKube(w, r, deps.Auth, deps.Store)
		if !ok {
			return
		}
		clusterNS, err := deps.Kube.ClusterNamespaces(r.Context())
		if err != nil {
			log.Printf("kube list namespaces: err=%v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		searchNS := rbac.VisibleNamespaces(*u, ps, deps.InstallNS, clusterNS)
		if u.Role == store.RoleOwner {
			searchNS = clusterNS
		}
		if len(searchNS) == 0 {
			writeJSON(w, http.StatusOK, []any{})
			return
		}

		allowed := make(map[string]bool, len(searchNS))
		for _, namespace := range searchNS {
			if rbac.Allow(rbac.Request{
				User:          *u,
				InstallNS:     deps.InstallNS,
				PermissionSet: ps,
				Module:        "custom_resources",
				Action:        "view",
				Namespace:     namespace,
			}) {
				allowed[namespace] = true
			}
		}
		// One cluster-wide list, filtered to the namespaces this user may view.
		items, err := deps.Kube.ListCustomResources(r.Context(), group, version, resource, "", false)
		if err != nil {
			log.Printf("kube list custom resources: group=%s resource=%s all namespaces err=%v", group, resource, err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		// Plain maps: an Unstructured stored in an interface value would encode as {"Object": ...}.
		out := make([]map[string]any, 0, len(items))
		for _, item := range items {
			if allowed[item.GetNamespace()] {
				out = append(out, item.Object)
			}
		}
		writeJSON(w, http.StatusOK, out)
		return
	}

	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "custom_resources", "view", "", true); !ok {
		return
	}
	items, err := deps.Kube.ListCustomResources(r.Context(), group, version, resource, "", false)
	if err != nil {
		log.Printf("kube list custom resources: group=%s resource=%s err=%v", group, resource, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func handleGetCustomResource(w http.ResponseWriter, r *http.Request, deps Deps) {
	name := r.PathValue("name")
	group := strings.TrimSpace(r.URL.Query().Get("group"))
	version := strings.TrimSpace(r.URL.Query().Get("version"))
	resource := strings.TrimSpace(r.URL.Query().Get("resource"))
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	if group == "" || version == "" || resource == "" {
		writeError(w, http.StatusBadRequest, "group, version, and resource required")
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	namespaced, err := deps.Kube.CustomResourceNamespaced(r.Context(), group, resource)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube crd scope: group=%s resource=%s err=%v", group, resource, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if namespaced {
		if ns == "" {
			writeError(w, http.StatusBadRequest, "namespace required")
			return
		}
		if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "custom_resources", "view", ns, false); !ok {
			return
		}
	} else {
		if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "custom_resources", "view", "", true); !ok {
			return
		}
	}

	obj, err := deps.Kube.GetCustomResource(r.Context(), group, version, resource, ns, name, namespaced)
	if err != nil {
		if apierrors.IsNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		log.Printf("kube get custom resource: group=%s resource=%s ns=%s name=%s err=%v", group, resource, ns, name, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, obj)
}
