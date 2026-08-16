package audit

import (
	"context"
	"strings"
	"time"

	"github.com/zixflow/k8s/internal/store"
)

type Event struct {
	Timestamp  time.Time
	UserID     string
	Username   string
	Role       string
	IP         string
	UserAgent  string
	SessionID  string
	Module     string
	Action     string
	Result     string // success|denied|error
	HTTPStatus int
	APIVersion string
	Kind       string
	Namespace  string
	Name       string
	Path       string
	Method     string
	Details    map[string]any
	Error      string
}

type Auditor struct {
	st store.Store
}

func New(st store.Store) *Auditor {
	return &Auditor{st: st}
}

func (a *Auditor) Write(ctx context.Context, e Event) error {
	if a == nil || a.st == nil {
		return nil
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
	if len(e.UserAgent) > 256 {
		e.UserAgent = e.UserAgent[:256]
	}
	if len(e.Error) > 500 {
		e.Error = e.Error[:500]
	}
	_, err := a.st.InsertAudit(ctx, store.AuditLog{
		Timestamp:  e.Timestamp,
		UserID:     e.UserID,
		Username:   e.Username,
		Role:       e.Role,
		IP:         e.IP,
		UserAgent:  e.UserAgent,
		SessionID:  e.SessionID,
		Module:     e.Module,
		Action:     e.Action,
		Result:     e.Result,
		HTTPStatus: e.HTTPStatus,
		APIVersion: e.APIVersion,
		Kind:       e.Kind,
		Namespace:  e.Namespace,
		Name:       e.Name,
		Path:       e.Path,
		Method:     e.Method,
		Details:    RedactDetails(e.Details),
		Error:      e.Error,
	})
	return err
}

var sensitiveDetailKeys = map[string]struct{}{
	"password":        {},
	"passwordHash":    {},
	"currentPassword": {},
	"newPassword":     {},
}

func isSensitiveKey(key string) bool {
	_, ok := sensitiveDetailKeys[key]
	return ok
}

func RedactDetails(details map[string]any) map[string]any {
	if details == nil {
		return nil
	}
	out := make(map[string]any, len(details))
	for k, v := range details {
		if isSensitiveKey(k) {
			continue
		}
		if nested, ok := v.(map[string]any); ok {
			out[k] = RedactDetails(nested)
			continue
		}
		out[k] = v
	}
	if len(out) == 0 {
		return map[string]any{}
	}
	return out
}

func TruncateUserAgent(ua string) string {
	if len(ua) > 256 {
		return ua[:256]
	}
	return ua
}

func ModuleForPath(path string) string {
	switch {
	case strings.HasPrefix(path, "/api/auth"):
		return "auth"
	case strings.HasPrefix(path, "/api/settings/members"):
		return "settings.members"
	case strings.HasPrefix(path, "/api/settings/permission-sets"):
		return "settings.permission_sets"
	case strings.HasPrefix(path, "/api/settings/audit"):
		return "settings.audit"
	case path == "/api/k8s/workloads/overview":
		return "workloads.overview"
	case path == "/api/k8s/cluster/overview":
		return "cluster.overview"
	case strings.HasPrefix(path, "/api/streams/logs"):
		return "pods"
	case strings.HasPrefix(path, "/api/k8s/namespaces/"):
		return moduleForK8sNamespacePath(path)
	default:
		return ""
	}
}

func moduleForK8sNamespacePath(path string) string {
	rest := strings.TrimPrefix(path, "/api/k8s/namespaces/")
	parts := strings.Split(rest, "/")
	if len(parts) < 2 {
		return ""
	}
	module := parts[1]
	switch module {
	case "pods", "deployments", "statefulsets", "daemonsets", "replicasets", "jobs", "cronjobs":
		return module
	default:
		return ""
	}
}
