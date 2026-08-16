package httpapi_test

import (
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"

	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/streams"
	"github.com/zixflow/k8s/internal/store"
)

type stubLogStreamer struct {
	called bool
	body   string
}

func (s *stubLogStreamer) Stream(_ context.Context, _, _, _ string, _ streams.LogOpts) (io.ReadCloser, error) {
	s.called = true
	return io.NopCloser(strings.NewReader(s.body)), nil
}

func newLogsHandler(t *testing.T, st store.Store, streamer streams.LogStreamer) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{
		InstallNS:   testInstallNS,
		LogStreamer: streamer,
	})
}

func TestPodLogsUnauthenticated(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	streamer := &stubLogStreamer{body: "log line\n"}
	h := newLogsHandler(t, st, streamer)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/logs?namespace=dev&pod=pod-dev", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
	if streamer.called {
		t.Fatal("streamer should not be called")
	}
}

func TestPodLogsDeniedWithoutLogsGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	streamer := &stubLogStreamer{body: "log line\n"}
	h := newLogsHandler(t, st, streamer)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/logs?namespace=dev&pod=pod-dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusForbidden)
	}
	if streamer.called {
		t.Fatal("streamer should not be called without logs grant")
	}
}

func TestPodLogsAllowedWithLogsGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "logs"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	streamer := &stubLogStreamer{body: "hello from pod\n"}
	h := newLogsHandler(t, st, streamer)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/logs?namespace=dev&pod=pod-dev&follow=1", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusOK)
	}
	if !streamer.called {
		t.Fatal("streamer should be called")
	}
	if rec.Body.String() != "hello from pod\n" {
		t.Fatalf("body=%q want log content", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/plain") {
		t.Fatalf("content-type=%q want text/plain", ct)
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{Module: "pods", Action: "logs"})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 2 {
		t.Fatalf("audit logs=%d want start+stop", len(logs))
	}
	phases := map[string]bool{}
	for _, entry := range logs {
		if entry.Kind != "Pod" || entry.Namespace != "dev" || entry.Name != "pod-dev" {
			t.Fatalf("audit entry=%+v unexpected resource", entry)
		}
		phase, _ := entry.Details["phase"].(string)
		phases[phase] = true
		for _, v := range entry.Details {
			if s, ok := v.(string); ok && strings.Contains(s, "hello from pod") {
				t.Fatal("log line text must not appear in audit details")
			}
		}
		if entry.Error != "" && strings.Contains(entry.Error, "hello from pod") {
			t.Fatal("log line text must not appear in audit error")
		}
	}
	if !phases["start"] || !phases["stop"] {
		t.Fatalf("audit phases=%v want start and stop", phases)
	}
}

func TestPodLogsMissingNamespaceOrPod(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "logs"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	streamer := &stubLogStreamer{body: "x"}
	h := newLogsHandler(t, st, streamer)
	session := login(t, h, "member", "pass")

	tests := []struct {
		name string
		path string
	}{
		{name: "missing namespace", path: "/api/streams/logs?pod=pod-dev"},
		{name: "missing pod", path: "/api/streams/logs?namespace=dev"},
		{name: "blank namespace", path: "/api/streams/logs?namespace=%20&pod=pod-dev"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.AddCookie(session)
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("code=%d want %d", rec.Code, http.StatusBadRequest)
			}
		})
	}
}

func TestPodLogsDeniedWrongNamespace(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "logs"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	streamer := &stubLogStreamer{body: "x"}
	h := newLogsHandler(t, st, streamer)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/logs?namespace=prod&pod=pod-prod", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
	if streamer.called {
		t.Fatal("streamer should not be called for denied namespace")
	}
}

type stubExecUpgrader struct {
	called int
	err    error
}

func (s *stubExecUpgrader) Handle(w http.ResponseWriter, _ *http.Request, _, _, _ string, onUpgraded func()) error {
	s.called++
	if onUpgraded != nil {
		onUpgraded()
	}
	if s.err != nil {
		return s.err
	}
	w.WriteHeader(http.StatusOK)
	return nil
}

func newExecHandler(t *testing.T, st store.Store, upgrader streams.ExecUpgrader) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{
		InstallNS:    testInstallNS,
		ExecUpgrader: upgrader,
	})
}

func TestPodExecUnauthenticated(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	upgrader := &stubExecUpgrader{}
	h := newExecHandler(t, st, upgrader)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/exec?namespace=dev&pod=pod-dev", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusUnauthorized)
	}
	if upgrader.called != 0 {
		t.Fatal("upgrader should not be called")
	}
}

func TestPodExecDeniedWithoutExecGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "logs"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	upgrader := &stubExecUpgrader{}
	h := newExecHandler(t, st, upgrader)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/exec?namespace=dev&pod=pod-dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s want %d", rec.Code, rec.Body.String(), http.StatusForbidden)
	}
	if upgrader.called != 0 {
		t.Fatal("upgrader should not be called without exec grant")
	}
}

func TestPodExecDeniedInstallNS(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "exec"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"*"})
	upgrader := &stubExecUpgrader{}
	h := newExecHandler(t, st, upgrader)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/exec?namespace="+testInstallNS+"&pod=pod-install", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}
	if upgrader.called != 0 {
		t.Fatal("upgrader should not be called for install namespace")
	}
}

func TestPodExecAllowedWithExecGrant(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "exec"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	upgrader := &stubExecUpgrader{}
	h := newExecHandler(t, st, upgrader)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/exec?namespace=dev&pod=pod-dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusOK)
	}
	if upgrader.called != 1 {
		t.Fatalf("upgrader called=%d want 1", upgrader.called)
	}

	entries, err := st.QueryAudit(context.Background(), store.AuditFilter{Module: "pods", Action: "exec"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("audit logs=%d want start+stop", len(entries))
	}
	phases := map[string]bool{}
	for _, entry := range entries {
		if entry.Kind != "Pod" || entry.Namespace != "dev" || entry.Name != "pod-dev" {
			t.Fatalf("audit entry=%+v unexpected resource", entry)
		}
		phase, _ := entry.Details["phase"].(string)
		phases[phase] = true
	}
	if !phases["start"] || !phases["stop"] {
		t.Fatalf("audit phases=%v want start and stop", phases)
	}
}

func TestPodExecStopAuditOnHandleError(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "exec"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	upgrader := &stubExecUpgrader{err: io.EOF}
	h := newExecHandler(t, st, upgrader)
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/exec?namespace=dev&pod=pod-dev", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if upgrader.called != 1 {
		t.Fatalf("upgrader called=%d want 1", upgrader.called)
	}

	entries, err := st.QueryAudit(context.Background(), store.AuditFilter{Module: "pods", Action: "exec"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("audit logs=%d want start+stop after handle error", len(entries))
	}
	phases := map[string]bool{}
	for _, entry := range entries {
		phase, _ := entry.Details["phase"].(string)
		phases[phase] = true
	}
	if !phases["start"] || !phases["stop"] {
		t.Fatalf("audit phases=%v want start and stop", phases)
	}
}

func TestPodExecRejectsCrossOrigin(t *testing.T) {
	t.Parallel()

	st := store.NewMemory()
	createPermissionSetWithGrants(t, st, "ps1", map[string][]string{"pods": {"view", "exec"}})
	createK8sMember(t, st, "member", "pass", "ps1", []string{"dev"})
	kc := &kube.Client{
		Inner:  fake.NewSimpleClientset(),
		Config: &rest.Config{Host: "http://localhost"},
	}
	h := newAuthHandlerWithOptions(t, st, httpapi.Deps{
		InstallNS:    testInstallNS,
		ExecUpgrader: streams.NewKubeExecUpgrader(kc, false),
	})
	session := login(t, h, "member", "pass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/streams/exec?namespace=dev&pod=pod-dev", nil)
	req.Host = "app.example.com"
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want %d", rec.Code, http.StatusForbidden)
	}

	entries, err := st.QueryAudit(context.Background(), store.AuditFilter{Module: "pods", Action: "exec"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("audit logs=%d want none for rejected origin", len(entries))
	}
}
