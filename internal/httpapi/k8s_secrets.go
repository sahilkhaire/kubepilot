package httpapi

import (
	"net/http"
	"strings"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/rbac"
	"github.com/zixflow/k8s/internal/store"
)

func secretRevealRequested(r *http.Request) bool {
	return strings.TrimSpace(r.URL.Query().Get("reveal")) == "1"
}

func sanitizeSecretList(items any, reveal bool) any {
	return kube.SanitizeSecrets(items, reveal)
}

func sanitizeSecretGet(obj any, reveal bool) any {
	return kube.SanitizeSecret(obj, reveal)
}

func writeSecretRevealAudit(r *http.Request, deps Deps, u *store.User, ns, name string) {
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
		Module:     "secrets",
		Action:     "reveal",
		Result:     "success",
		HTTPStatus: http.StatusOK,
		Kind:       "Secret",
		Namespace:  ns,
		Name:       name,
		Path:       r.URL.Path,
		Method:     r.Method,
	})
}

func moduleAllowsDelete(module string) bool {
	for _, action := range rbac.ModuleActions(module) {
		if action == "delete" {
			return true
		}
	}
	return false
}
