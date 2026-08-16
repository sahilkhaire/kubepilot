package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/sahilkhaire/kubepilot/internal/kube"
)

type podEnvRequest struct {
	Containers []kube.PodEnvContainer `json:"containers"`
}

func handleUpdatePodEnv(w http.ResponseWriter, r *http.Request, deps Deps) {
	handleUpdateWorkloadEnv(w, r, deps, "pods")
}

func handleUpdateDeploymentEnv(w http.ResponseWriter, r *http.Request, deps Deps) {
	handleUpdateWorkloadEnv(w, r, deps, "deployments")
}

func handleUpdateWorkloadEnv(w http.ResponseWriter, r *http.Request, deps Deps, module string) {
	ns := r.PathValue("ns")
	name := r.PathValue("name")

	u, ok := authenticateKubeMutation(w, r, deps)
	if !ok {
		return
	}
	if !kubeMutationAllowed(w, r, deps, u, module, "yaml_edit", ns, false) {
		return
	}
	if deps.Kube == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	var req podEnvRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	var owner kube.PodEnvOwner
	var err error
	switch module {
	case "pods":
		owner, err = deps.Kube.UpdatePodEnv(r.Context(), ns, name, req.Containers)
	case "deployments":
		owner, err = deps.Kube.UpdateDeploymentEnv(r.Context(), ns, name, req.Containers)
	default:
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if err != nil {
		writePodEnvError(w, err)
		return
	}

	names := make([]string, 0, len(req.Containers))
	for _, c := range req.Containers {
		if c.Name != "" {
			names = append(names, c.Name)
		}
	}
	writeKubeMutationAudit(r, deps, u, module, "yaml_edit", ns, name, map[string]any{
		"ownerKind":  owner.Kind,
		"ownerName":  owner.Name,
		"containers": names,
	})
	writeJSON(w, http.StatusOK, owner)
}

func writePodEnvError(w http.ResponseWriter, err error) {
	if apierrors.IsNotFound(err) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if errors.Is(err, kube.ErrPodEnvImmutable) || errors.Is(err, kube.ErrPodEnvNoMatch) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var ve *kube.PodEnvValidationError
	if errors.As(err, &ve) {
		writeError(w, http.StatusBadRequest, ve.Error())
		return
	}
	writeKubeClientError(w, err, "kube update env")
}
