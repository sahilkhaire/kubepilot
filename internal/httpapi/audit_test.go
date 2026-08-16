package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zixflow/k8s/internal/store"
)

func TestFailedLoginWritesLoginFailedWithoutPassword(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newAuthHandlerWithStore(t, st)

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"username":"owner","password":"wrong-secret"}`)
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", body))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d", rec.Code)
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{Action: "login_failed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("logs=%d want 1", len(logs))
	}
	log := logs[0]
	if log.Action != "login_failed" || log.Result != "denied" {
		t.Fatalf("log=%+v", log)
	}
	if log.Details["username"] != "owner" {
		t.Fatalf("details=%v", log.Details)
	}
	for _, key := range []string{"password", "passwordHash", "currentPassword", "newPassword"} {
		if _, ok := log.Details[key]; ok {
			t.Fatalf("password field %q must not be stored", key)
		}
	}
}

func TestForbiddenWritesDeniedAudit(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createMember(t, st, "member", "temppass")
	h := newAuthHandlerWithStore(t, st)
	session := login(t, h, "member", "temppass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/members", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d want 403", rec.Code)
	}

	logs, err := st.QueryAudit(context.Background(), store.AuditFilter{
		Result: "denied",
		Module: "settings.members",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("logs=%d want 1", len(logs))
	}
	if logs[0].Action != "access" || logs[0].HTTPStatus != http.StatusForbidden {
		t.Fatalf("log=%+v", logs[0])
	}
}

func TestQueryAuditOwnerOnly(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	h := newAuthHandlerWithStore(t, st)
	ownerSession := login(t, h, "owner", "secret")
	createMember(t, st, "member", "temppass")
	memberSession := login(t, h, "member", "temppass")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/audit", nil)
	req.AddCookie(memberSession)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("member code=%d want 403", rec.Code)
	}

	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/api/settings/audit", nil)
	req2.AddCookie(ownerSession)
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("owner code=%d body=%s", rec2.Code, rec2.Body.String())
	}
	var rows []map[string]any
	if err := json.Unmarshal(rec2.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("expected audit rows")
	}
}
