package httpapi_test

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/auth"
	"github.com/sahilkhaire/kubepilot/internal/audit"
	"github.com/sahilkhaire/kubepilot/internal/bootstrap"
	"github.com/sahilkhaire/kubepilot/internal/httpapi"
	"github.com/sahilkhaire/kubepilot/internal/password"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

const testSessionSecret = "test-session-secret"

func newAuthHandler(t *testing.T) http.Handler {
	t.Helper()
	return newAuthHandlerWithStore(t, store.NewMemory())
}

func newAuthHandlerWithStore(t *testing.T, st store.Store) http.Handler {
	t.Helper()
	return newAuthHandlerWithOptions(t, st, httpapi.Deps{})
}

func newAuthHandlerWithOptions(t *testing.T, st store.Store, opts httpapi.Deps) http.Handler {
	t.Helper()
	ctx := context.Background()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret", nil); err != nil {
		t.Fatal(err)
	}
	opts.Auth = auth.New(st, testSessionSecret)
	opts.Store = st
	if opts.Audit == nil {
		opts.Audit = audit.New(st)
	}
	return httpapi.New(opts)
}

func createMember(t *testing.T, st store.Store, username, plainPassword string) {
	t.Helper()
	hash, err := password.Hash(plainPassword)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := st.CreateMember(context.Background(), store.User{
		ID:                 "member-1",
		Username:           username,
		DisplayName:        "Member",
		Role:               store.RoleMember,
		PasswordHash:       hash,
		MustChangePassword: true,
		Enabled:            true,
		CreatedAt:          now,
		UpdatedAt:          now,
	}); err != nil {
		t.Fatal(err)
	}
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
	if !session.HttpOnly || session.Secure || session.Path != "/" || session.SameSite != http.SameSiteLaxMode {
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

func TestCookieSecure(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		trustProxy bool
		setup      func(*http.Request)
		wantSecure bool
	}{
		{
			name:       "plain_http",
			wantSecure: false,
		},
		{
			name: "tls",
			setup: func(r *http.Request) {
				r.TLS = &tls.ConnectionState{}
			},
			wantSecure: true,
		},
		{
			name:       "forwarded_https_with_trust_proxy",
			trustProxy: true,
			setup: func(r *http.Request) {
				r.Header.Set("X-Forwarded-Proto", "https")
			},
			wantSecure: true,
		},
		{
			name: "forwarded_https_without_trust_proxy",
			setup: func(r *http.Request) {
				r.Header.Set("X-Forwarded-Proto", "https")
			},
			wantSecure: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := newAuthHandlerWithOptions(t, store.NewMemory(), httpapi.Deps{TrustProxy: tc.trustProxy})

			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"owner","password":"secret"}`))
			if tc.setup != nil {
				tc.setup(req)
			}
			h.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("login code=%d body=%s", rec.Code, rec.Body.String())
			}

			var session *http.Cookie
			for _, c := range rec.Result().Cookies() {
				if c.Name == auth.CookieName {
					session = c
					break
				}
			}
			if session == nil {
				t.Fatal("session cookie missing")
			}
			if session.Secure != tc.wantSecure {
				t.Fatalf("Secure=%v want %v", session.Secure, tc.wantSecure)
			}
		})
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

func TestPasswordChangeMember(t *testing.T) {
	t.Parallel()
	st := store.NewMemory()
	createMember(t, st, "member", "oldpass")
	h := newAuthHandlerWithStore(t, st)
	session := login(t, h, "member", "oldpass")

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"currentPassword":"oldpass","newPassword":"newpass1"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/password", body)
	req.AddCookie(session)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("password change code=%d body=%s", rec.Code, rec.Body.String())
	}

	shortRec := httptest.NewRecorder()
	shortBody := strings.NewReader(`{"currentPassword":"newpass1","newPassword":"short"}`)
	shortReq := httptest.NewRequest(http.MethodPost, "/api/auth/password", shortBody)
	shortReq.AddCookie(session)
	h.ServeHTTP(shortRec, shortReq)
	if shortRec.Code != http.StatusBadRequest {
		t.Fatalf("short password code=%d want 400", shortRec.Code)
	}

	meRec := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(session)
	h.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("me code=%d body=%s", meRec.Code, meRec.Body.String())
	}
	var me map[string]any
	if err := json.Unmarshal(meRec.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	if me["mustChangePassword"] != false {
		t.Fatalf("mustChangePassword=%v want false", me["mustChangePassword"])
	}

	loginRec := httptest.NewRecorder()
	loginBody := strings.NewReader(`{"username":"member","password":"newpass1"}`)
	h.ServeHTTP(loginRec, httptest.NewRequest(http.MethodPost, "/api/auth/login", loginBody))
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login with new password code=%d body=%s", loginRec.Code, loginRec.Body.String())
	}
}
