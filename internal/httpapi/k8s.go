package httpapi

import (
	"log"
	"net/http"

	corev1 "k8s.io/api/core/v1"
)

func registerK8sRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/pods", func(w http.ResponseWriter, r *http.Request) {
		handleListPods(w, r, deps)
	})
}

func handleListPods(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := r.PathValue("ns")
	if _, ok := requireKubeAllow(w, r, deps.Auth, deps.Store, deps.InstallNS, "pods", "view", ns, false); !ok {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	pods, err := deps.Kube.Pods(r.Context(), ns)
	if err != nil {
		log.Printf("kube list pods: ns=%s err=%v", ns, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if pods == nil {
		pods = []corev1.Pod{}
	}
	writeJSON(w, http.StatusOK, pods)
}
