package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/bootstrap"
	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/store"
)

const testSessionSecret = "test-session-secret"

func newAuthHandler(t *testing.T) http.Handler {
	t.Helper()
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret"); err != nil {
		t.Fatal(err)
	}
	return httpapi.New(httpapi.Deps{
		Auth: auth.New(st, testSessionSecret),
	})
}

func login(t *testing.T, h http.Handler, username, password string) *http.Cookie {
	t.Helper()
	body := bytes.NewBufferString(`{"username":"` + username + `","password":"` + password + `"}`)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("login code=%d body=%s", rec.Code, rec.Body.String())
	}
	c := rec.Result().Cookies()
	for _, ck := range c {
		if ck.Name == auth.CookieName {
			return ck
		}
	}
	t.Fatal("session cookie not set")
	return nil
}

func TestLoginOwner(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"username":"owner","password":"secret"}`)
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", body))

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["username"] != "owner" || resp["role"] != "owner" || resp["mustChangePassword"] != false {
		t.Fatalf("body=%v", resp)
	}
	if _, ok := resp["passwordHash"]; ok {
		t.Fatal("passwordHash must not appear in JSON")
	}

	cookies := rec.Result().Cookies()
	var session *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.CookieName {
			session = c
			break
		}
	}
	if session == nil {
		t.Fatal("session cookie missing")
	}
	if !session.HttpOnly || !session.Secure || session.Path != "/" || session.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie flags: %+v", session)
	}
	if session.Value == "" {
		t.Fatal("empty cookie value")
	}
}

func TestMe(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
	raw, _ := io.ReadAll(rec.Body)
	if strings.Contains(string(raw), "passwordHash") {
		t.Fatalf("passwordHash leaked: %s", raw)
	}
	var resp map[string]any
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatal(err)
	}
	if resp["username"] != "owner" || resp["role"] != "owner" {
		t.Fatalf("body=%v", resp)
	}
}

func TestLogout(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("code=%d", rec.Code)
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == auth.CookieName && c.MaxAge != -1 && c.Value != "" {
			t.Fatalf("cookie not cleared: %+v", c)
		}
	}

	meRec := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(session)
	h.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusUnauthorized {
		t.Fatalf("me after logout code=%d", meRec.Code)
	}
}

func TestLoginBadPassword(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"username":"owner","password":"wrong"}`)
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", body))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["error"] != "invalid credentials" {
		t.Fatalf("body=%v", resp)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Fatal("should not set cookie on failed login")
	}
}

func TestPasswordChangeOwnerForbidden(t *testing.T) {
	t.Parallel()
	h := newAuthHandler(t)
	session := login(t, h, "owner", "secret")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"currentPassword":"secret","newPassword":"newsecret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/password", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}
