package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/store"
)

const auditConfirmHeader = "delete"

type auditLogResponse struct {
	ID         string         `json:"id"`
	Timestamp  string         `json:"timestamp"`
	UserID     string         `json:"userId,omitempty"`
	Username   string         `json:"username,omitempty"`
	Role       string         `json:"role,omitempty"`
	IP         string         `json:"ip,omitempty"`
	UserAgent  string         `json:"userAgent,omitempty"`
	SessionID  string         `json:"sessionId,omitempty"`
	Module     string         `json:"module,omitempty"`
	Action     string         `json:"action,omitempty"`
	Result     string         `json:"result,omitempty"`
	HTTPStatus int            `json:"httpStatus,omitempty"`
	APIVersion string         `json:"apiVersion,omitempty"`
	Kind       string         `json:"kind,omitempty"`
	Namespace  string         `json:"namespace,omitempty"`
	Name       string         `json:"name,omitempty"`
	Path       string         `json:"path,omitempty"`
	Method     string         `json:"method,omitempty"`
	Details    map[string]any `json:"details,omitempty"`
	Error      string         `json:"error,omitempty"`
}

type deleteAuditRequest struct {
	IDs []string `json:"ids"`
}

func registerAuditRoutes(mux *http.ServeMux, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	mux.HandleFunc("GET /api/settings/audit", func(w http.ResponseWriter, r *http.Request) {
		handleQueryAudit(w, r, authSvc, st)
	})
	mux.HandleFunc("DELETE /api/settings/audit", func(w http.ResponseWriter, r *http.Request) {
		handleDeleteAudit(w, r, authSvc, st, auditor, trustProxy)
	})
}

func handleQueryAudit(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store) {
	if _, ok := requireOwner(w, r, authSvc); !ok {
		return
	}
	filter, err := auditFilterFromRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid time range")
		return
	}
	logs, err := st.QueryAudit(r.Context(), filter)
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	out := make([]auditLogResponse, 0, len(logs))
	for _, log := range logs {
		out = append(out, auditLogPublic(&log))
	}
	writeJSON(w, http.StatusOK, out)
}

func handleDeleteAudit(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, st store.Store, auditor *audit.Auditor, trustProxy bool) {
	owner, ok := requireOwner(w, r, authSvc)
	if !ok {
		return
	}

	if r.URL.Query().Get("filter") == "1" {
		if r.Header.Get("X-Confirm") != auditConfirmHeader {
			writeError(w, http.StatusBadRequest, "confirmation required")
			return
		}
		filter, err := auditFilterFromRequest(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid time range")
			return
		}
		n, err := st.DeleteAuditFilter(r.Context(), filter)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		writeAuditOrLog(r.Context(), auditor, audit.Event{
			UserID:     owner.ID,
			Username:   owner.Username,
			Role:       string(owner.Role),
			IP:         clientIP(r, trustProxy),
			UserAgent:  audit.TruncateUserAgent(r.UserAgent()),
			SessionID:  actorSessionID(r, authSvc),
			Module:     "settings.audit",
			Action:     "audit_delete_filter",
			Result:     "success",
			HTTPStatus: http.StatusNoContent,
			Path:       r.URL.Path,
			Method:     r.Method,
			Details:    map[string]any{"deleted": n},
		})
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var req deleteAuditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "ids required")
		return
	}
	n, err := st.DeleteAuditIDs(r.Context(), req.IDs)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeAuditOrLog(r.Context(), auditor, audit.Event{
		UserID:     owner.ID,
		Username:   owner.Username,
		Role:       string(owner.Role),
		IP:         clientIP(r, trustProxy),
		UserAgent:  audit.TruncateUserAgent(r.UserAgent()),
		SessionID:  actorSessionID(r, authSvc),
		Module:     "settings.audit",
		Action:     "audit_delete_ids",
		Result:     "success",
		HTTPStatus: http.StatusNoContent,
		Path:       r.URL.Path,
		Method:     r.Method,
		Details:    map[string]any{"deleted": n, "ids": req.IDs},
	})
	w.WriteHeader(http.StatusNoContent)
}

func auditFilterFromRequest(r *http.Request) (store.AuditFilter, error) {
	q := r.URL.Query()
	filter := store.AuditFilter{
		Username:  q.Get("username"),
		Module:    q.Get("module"),
		Action:    q.Get("action"),
		Result:    q.Get("result"),
		Namespace: q.Get("namespace"),
		Kind:      q.Get("kind"),
	}
	if from := strings.TrimSpace(q.Get("from")); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			return filter, err
		}
		filter.From = &t
	}
	if to := strings.TrimSpace(q.Get("to")); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			return filter, err
		}
		filter.To = &t
	}
	return filter, nil
}

func auditLogPublic(log *store.AuditLog) auditLogResponse {
	resp := auditLogResponse{
		ID:         log.ID,
		UserID:     log.UserID,
		Username:   log.Username,
		Role:       log.Role,
		IP:         log.IP,
		UserAgent:  log.UserAgent,
		SessionID:  log.SessionID,
		Module:     log.Module,
		Action:     log.Action,
		Result:     log.Result,
		HTTPStatus: log.HTTPStatus,
		APIVersion: log.APIVersion,
		Kind:       log.Kind,
		Namespace:  log.Namespace,
		Name:       log.Name,
		Path:       log.Path,
		Method:     log.Method,
		Details:    log.Details,
		Error:      log.Error,
	}
	if !log.Timestamp.IsZero() {
		resp.Timestamp = log.Timestamp.UTC().Format(time.RFC3339)
	}
	return resp
}

func writeAuditOrLog(ctx context.Context, auditor *audit.Auditor, e audit.Event) {
	if auditor == nil {
		return
	}
	if err := auditor.Write(ctx, e); err != nil {
		log.Printf("audit write failed: module=%s action=%s err=%v", e.Module, e.Action, err)
	}
}

func writeSettingsAudit(r *http.Request, auditor *audit.Auditor, authSvc *auth.Service, trustProxy bool, owner *store.User, e audit.Event) {
	if auditor == nil {
		return
	}
	e.UserID = owner.ID
	e.Username = owner.Username
	e.Role = string(owner.Role)
	e.IP = clientIP(r, trustProxy)
	e.UserAgent = audit.TruncateUserAgent(r.UserAgent())
	e.SessionID = actorSessionID(r, authSvc)
	if e.Path == "" {
		e.Path = r.URL.Path
	}
	if e.Method == "" {
		e.Method = r.Method
	}
	if e.Result == "" {
		e.Result = "success"
	}
	writeAuditOrLog(r.Context(), auditor, e)
}

func actorSessionID(r *http.Request, authSvc *auth.Service) string {
	if authSvc == nil {
		return ""
	}
	id, ok := sessionFromRequest(r, authSvc)
	if !ok {
		return ""
	}
	return id
}

func writeAuthAudit(r *http.Request, auditor *audit.Auditor, trustProxy bool, e audit.Event) {
	if auditor == nil {
		return
	}
	if e.IP == "" {
		e.IP = clientIP(r, trustProxy)
	}
	if e.UserAgent == "" {
		e.UserAgent = audit.TruncateUserAgent(r.UserAgent())
	}
	if e.Path == "" {
		e.Path = r.URL.Path
	}
	if e.Method == "" {
		e.Method = r.Method
	}
	_ = auditor.Write(r.Context(), e)
}

func auditDeniedMiddleware(auditor *audit.Auditor, authSvc *auth.Service, trustProxy bool, next http.Handler) http.Handler {
	if auditor == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if rec.status != http.StatusForbidden || !strings.HasPrefix(r.URL.Path, "/api/") {
			return
		}
		userID, username, role, sessionID := actorFromRequest(r, authSvc)
		writeAuthAudit(r, auditor, trustProxy, audit.Event{
			UserID:     userID,
			Username:   username,
			Role:       role,
			SessionID:  sessionID,
			Module:     audit.ModuleForPath(r.URL.Path),
			Action:     "access",
			Result:     "denied",
			HTTPStatus: http.StatusForbidden,
			Path:       r.URL.Path,
			Method:     r.Method,
		})
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

var (
	_ http.Hijacker = (*statusRecorder)(nil)
	_ http.Flusher  = (*statusRecorder)(nil)
)

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hj, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("http.Hijacker not supported by underlying ResponseWriter")
	}
	return hj.Hijack()
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func actorFromRequest(r *http.Request, authSvc *auth.Service) (userID, username, role, sessionID string) {
	if authSvc == nil {
		return "", "", "anonymous", ""
	}
	sessionID, ok := sessionFromRequest(r, authSvc)
	if !ok {
		return "", "", "anonymous", ""
	}
	u, _, err := authSvc.Authenticate(r.Context(), sessionID)
	if err != nil {
		return "", "", "anonymous", sessionID
	}
	return u.ID, u.Username, string(u.Role), sessionID
}
