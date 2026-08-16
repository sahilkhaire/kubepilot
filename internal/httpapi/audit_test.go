package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/audit"
	"github.com/sahilkhaire/kubepilot/internal/httpapi"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

type auditInsertFailStore struct {
	store.Store
}

func (s *auditInsertFailStore) InsertAudit(ctx context.Context, log store.AuditLog) (string, error) {
	return "", errors.New("audit insert failed")
}

type auditInsertFailNextStore struct {
	store.Store
	failNext bool
}

func (s *auditInsertFailNextStore) InsertAudit(ctx context.Context, log store.AuditLog) (string, error) {
	if s.failNext {
		s.failNext = false
		return "", errors.New("audit insert failed")
	}
	return s.Store.InsertAudit(ctx, log)
}

type auditQueryFailStore struct {
	store.Store
}

func (s *auditQueryFailStore) QueryAudit(ctx context.Context, filter store.AuditFilter) ([]store.AuditLog, error) {
	return nil, errors.New("audit query failed")
}

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

func TestQueryAuditStoreFailureReturns503(t *testing.T) {
	t.Parallel()
	st := &auditQueryFailStore{Store: store.NewMemory()}
	h := newAuthHandlerWithStore(t, st)
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/audit", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code=%d want 503", rec.Code)
	}
}

func TestCreateMemberSucceedsWhenAuditWriteFails(t *testing.T) {
	t.Parallel()
	st := &auditInsertFailStore{Store: store.NewMemory()}
	createPermissionSet(t, st, "ps1")
	h := newAuthHandlerWithOptions(t, st, httpapi.Deps{InstallNS: testInstallNS, Audit: audit.New(st)})
	session := login(t, h, "owner", "secret")

	body := bytes.NewBufferString(`{"username":"alice","displayName":"Alice","permissionSetId":"ps1","namespaces":["dev"]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/settings/members", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, ok := resp["password"].(string); !ok {
		t.Fatalf("password missing: %v", resp)
	}
}

func TestDeleteAuditSucceedsWhenAuditWriteFails(t *testing.T) {
	t.Parallel()
	st := &auditInsertFailNextStore{Store: store.NewMemory()}
	h := newAuthHandlerWithStore(t, st)
	session := login(t, h, "owner", "secret")

	id, err := st.InsertAudit(context.Background(), store.AuditLog{
		Module: "test",
		Action: "test",
		Result: "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	st.failNext = true

	body := strings.NewReader(`{"ids":["` + id + `"]}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/settings/audit", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}
