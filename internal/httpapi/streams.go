package httpapi

import (
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/rbac"
	"github.com/zixflow/k8s/internal/streams"
	"github.com/zixflow/k8s/internal/store"
)

func registerStreamRoutes(mux *http.ServeMux, deps Deps) {
	mux.HandleFunc("GET /api/streams/logs", func(w http.ResponseWriter, r *http.Request) {
		handlePodLogs(w, r, deps)
	})
	mux.HandleFunc("GET /api/streams/exec", func(w http.ResponseWriter, r *http.Request) {
		handlePodExec(w, r, deps)
	})
}

func handlePodLogs(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	pod := strings.TrimSpace(r.URL.Query().Get("pod"))

	u, err := authenticateRequest(r, deps.Auth)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if ns == "" || pod == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
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
		Module:        "pods",
		Action:        "logs",
		Namespace:     ns,
		ClusterScoped: false,
	}) {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	streamer := logStreamerFor(deps)
	if streamer == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	container := strings.TrimSpace(r.URL.Query().Get("container"))
	opts := streams.LogOpts{
		Follow:    queryTruthy(r.URL.Query().Get("follow")),
		Previous:  queryTruthy(r.URL.Query().Get("previous")),
		TailLines: parseTailLines(r.URL.Query().Get("tail")),
	}

	rc, err := streamer.Stream(r.Context(), ns, pod, container, opts)
	if err != nil {
		log.Printf("pod logs stream: ns=%s pod=%s err=%v", ns, pod, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rc.Close()

	writePodLogsAudit(r, deps, u, ns, pod, "start", http.StatusOK)

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	flusher, _ := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := rc.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				break
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				log.Printf("pod logs copy: ns=%s pod=%s err=%v", ns, pod, readErr)
			}
			break
		}
	}

	writePodLogsAudit(r, deps, u, ns, pod, "stop", http.StatusOK)
}

func logStreamerFor(deps Deps) streams.LogStreamer {
	if deps.LogStreamer != nil {
		return deps.LogStreamer
	}
	if deps.Kube != nil {
		return streams.NewKubeLogStreamer(deps.Kube)
	}
	return nil
}

func queryTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}

func parseTailLines(v string) int64 {
	v = strings.TrimSpace(v)
	if v == "" {
		return 200
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n < 0 {
		return 200
	}
	return n
}

func handlePodExec(w http.ResponseWriter, r *http.Request, deps Deps) {
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	pod := strings.TrimSpace(r.URL.Query().Get("pod"))

	u, err := authenticateRequest(r, deps.Auth)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if ns == "" || pod == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
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
		Module:        "pods",
		Action:        "exec",
		Namespace:     ns,
		ClusterScoped: false,
	}) {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	upgrader := execUpgraderFor(deps)
	if upgrader == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	container := strings.TrimSpace(r.URL.Query().Get("container"))
	execStarted := false
	defer func() {
		if execStarted {
			writePodExecAudit(r, deps, u, ns, pod, "stop", http.StatusOK)
		}
	}()
	if err := upgrader.Handle(w, r, ns, pod, container, func() {
		writePodExecAudit(r, deps, u, ns, pod, "start", http.StatusSwitchingProtocols)
		execStarted = true
	}); err != nil {
		log.Printf("pod exec: ns=%s pod=%s err=%v", ns, pod, err)
		return
	}
}

func execUpgraderFor(deps Deps) streams.ExecUpgrader {
	if deps.ExecUpgrader != nil {
		return deps.ExecUpgrader
	}
	if deps.Kube != nil {
		return streams.NewKubeExecUpgrader(deps.Kube, deps.TrustProxy)
	}
	return nil
}

func writePodExecAudit(r *http.Request, deps Deps, u *store.User, ns, pod, phase string, status int) {
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
		Module:     "pods",
		Action:     "exec",
		Result:     "success",
		HTTPStatus: status,
		Kind:       "Pod",
		Namespace:  ns,
		Name:       pod,
		Path:       r.URL.Path,
		Method:     r.Method,
		Details:    map[string]any{"phase": phase},
	})
}

func writePodLogsAudit(r *http.Request, deps Deps, u *store.User, ns, pod, phase string, status int) {
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
		Module:     "pods",
		Action:     "logs",
		Result:     "success",
		HTTPStatus: status,
		Kind:       "Pod",
		Namespace:  ns,
		Name:       pod,
		Path:       r.URL.Path,
		Method:     r.Method,
		Details:    map[string]any{"phase": phase},
	})
}
