package httpapi

import (
	"errors"
	"net/http"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

// writeKubeError maps a Kubernetes API error to an HTTP status and passes the
// API server's message through, so the UI can explain what went wrong.
// Errors that did not come from the API server become a generic 500.
func writeKubeError(w http.ResponseWriter, err error) {
	var status apierrors.APIStatus
	if !errors.As(err, &status) {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	msg := status.Status().Message
	switch {
	case apierrors.IsNotFound(err):
		writeError(w, http.StatusNotFound, msg)
	case apierrors.IsAlreadyExists(err), apierrors.IsConflict(err):
		writeError(w, http.StatusConflict, msg)
	case apierrors.IsInvalid(err), apierrors.IsBadRequest(err):
		writeError(w, http.StatusBadRequest, msg)
	case apierrors.IsForbidden(err):
		writeError(w, http.StatusForbidden, msg)
	default:
		writeError(w, http.StatusInternalServerError, msg)
	}
}
