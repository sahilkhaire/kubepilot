package auth_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/bootstrap"
	"github.com/zixflow/k8s/internal/password"
	"github.com/zixflow/k8s/internal/store"
)

const sessionSecret = "test-session-secret"

func newService(st store.Store) *auth.Service {
	return auth.New(st, sessionSecret)
}

func TestLoginSuccess(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret", nil); err != nil {
		t.Fatal(err)
	}
	svc := newService(st)

	sessionID, u, err := svc.Login(ctx, "Owner", "secret", "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if sessionID == "" || len(sessionID) != 64 {
		t.Fatalf("session id: %q", sessionID)
	}
	if u.Username != "owner" || u.Role != store.RoleOwner || !u.Enabled {
		t.Fatalf("user: %+v", u)
	}

	sess, err := st.Session(ctx, sessionID)
	if err != nil || sess == nil {
		t.Fatalf("session: %v %+v", err, sess)
	}
	if sess.UserID != u.ID || sess.Username != "owner" || sess.IP != "127.0.0.1" || sess.UserAgent != "test-agent" {
		t.Fatalf("session fields: %+v", sess)
	}
	now := time.Now().UTC()
	if sess.ExpiresAt.Before(now.Add(23*time.Hour)) || sess.ExpiresAt.After(now.Add(25*time.Hour)) {
		t.Fatalf("expires at: %v", sess.ExpiresAt)
	}
	if sess.IdleExpiresAt.Before(now.Add(7*time.Hour)) || sess.IdleExpiresAt.After(now.Add(9*time.Hour)) {
		t.Fatalf("idle expires at: %v", sess.IdleExpiresAt)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret", nil); err != nil {
		t.Fatal(err)
	}
	svc := newService(st)

	_, _, err := svc.Login(ctx, "owner", "wrong", "127.0.0.1", "ua")
	if err != auth.ErrInvalidCredentials {
		t.Fatalf("got %v want ErrInvalidCredentials", err)
	}
}

func TestLoginDisabledUser(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	hash, err := password.Hash("secret")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := st.CreateOwner(ctx, store.User{
		ID:           "user-disabled",
		Username:     "disabled",
		DisplayName:  "Disabled",
		Role:         store.RoleOwner,
		PasswordHash: hash,
		Enabled:      false,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatal(err)
	}
	svc := newService(st)

	_, _, err = svc.Login(ctx, "disabled", "secret", "127.0.0.1", "ua")
	if err != auth.ErrInvalidCredentials {
		t.Fatalf("got %v want ErrInvalidCredentials", err)
	}
}

func TestCookieRoundTrip(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret", nil); err != nil {
		t.Fatal(err)
	}
	svc := newService(st)

	sessionID, _, err := svc.Login(ctx, "owner", "secret", "127.0.0.1", "ua")
	if err != nil {
		t.Fatal(err)
	}

	cookie := svc.SignCookie(sessionID)
	parsed, ok := svc.ParseCookie(cookie)
	if !ok {
		t.Fatal("parse cookie failed")
	}
	if parsed != sessionID {
		t.Fatalf("got %q want %q", parsed, sessionID)
	}
}

func TestAuthenticateRejectsExpiredSession(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret", nil); err != nil {
		t.Fatal(err)
	}
	u, _ := st.Owner(ctx)
	now := time.Now().UTC()
	sessionID := "expired-session"
	if err := st.CreateSession(ctx, store.Session{
		ID:            sessionID,
		UserID:        u.ID,
		Username:      u.Username,
		CreatedAt:     now.Add(-25 * time.Hour),
		LastSeenAt:    now.Add(-25 * time.Hour),
		ExpiresAt:     now.Add(-time.Hour),
		IdleExpiresAt: now.Add(8 * time.Hour),
		IP:            "127.0.0.1",
		UserAgent:     "ua",
	}); err != nil {
		t.Fatal(err)
	}
	svc := newService(st)

	_, _, err := svc.Authenticate(ctx, sessionID)
	if err == nil {
		t.Fatal("expected error for expired session")
	}
}

func TestParseCookieRejectsTamperedHMAC(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "owner", "secret", nil); err != nil {
		t.Fatal(err)
	}
	svc := newService(st)

	sessionID, _, err := svc.Login(ctx, "owner", "secret", "127.0.0.1", "ua")
	if err != nil {
		t.Fatal(err)
	}

	cookie := svc.SignCookie(sessionID)
	parts := strings.Split(cookie, ".")
	if len(parts) != 2 {
		t.Fatal("unexpected cookie format")
	}
	tampered := parts[0] + ".deadbeef"

	_, ok := svc.ParseCookie(tampered)
	if ok {
		t.Fatal("expected tampered cookie to be rejected")
	}
}
