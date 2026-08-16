package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/sahilkhaire/k8s-apis/internal/store"
)

func TestCreateOwnerAndOwner(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()

	now := time.Now().UTC().Truncate(time.Second)
	owner := store.User{
		ID:           "user-1",
		Username:     "Admin",
		DisplayName:  "Owner",
		Role:         store.RoleOwner,
		PasswordHash: "hash",
		Enabled:      true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := st.CreateOwner(ctx, owner); err != nil {
		t.Fatal(err)
	}

	got, err := st.Owner(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected owner")
	}
	if got.Username != "admin" {
		t.Fatalf("username=%q want admin", got.Username)
	}
	if got.ID != "user-1" {
		t.Fatalf("id=%q", got.ID)
	}
}

func TestUserByUsernameCaseInsensitive(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()
	if err := st.CreateOwner(ctx, store.User{
		ID:           "user-1",
		Username:     "alice",
		DisplayName:  "Alice",
		Role:         store.RoleOwner,
		PasswordHash: "hash",
		Enabled:      true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatal(err)
	}

	got, err := st.UserByUsername(ctx, "ALICE")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Username != "alice" {
		t.Fatalf("got=%+v", got)
	}
}

func TestUserByUsernameMissing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()

	got, err := st.UserByUsername(ctx, "nobody")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("expected nil user, got %+v", got)
	}
}

func TestSessionCreateGetDelete(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC().Truncate(time.Second)

	sess := store.Session{
		ID:            "sess-1",
		UserID:        "user-1",
		Username:      "alice",
		CreatedAt:     now,
		LastSeenAt:    now,
		ExpiresAt:     now.Add(24 * time.Hour),
		IdleExpiresAt: now.Add(time.Hour),
		IP:            "127.0.0.1",
		UserAgent:     "test",
	}
	if err := st.CreateSession(ctx, sess); err != nil {
		t.Fatal(err)
	}

	got, err := st.Session(ctx, "sess-1")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.ID != "sess-1" || got.UserID != "user-1" {
		t.Fatalf("got=%+v", got)
	}

	if err := st.DeleteSession(ctx, "sess-1"); err != nil {
		t.Fatal(err)
	}
	got, err = st.Session(ctx, "sess-1")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("expected nil session after delete, got %+v", got)
	}
}

func TestDeleteSessionsForUser(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()

	for _, id := range []string{"s1", "s2", "s3"} {
		if err := st.CreateSession(ctx, store.Session{
			ID:            id,
			UserID:        "user-1",
			Username:      "alice",
			CreatedAt:     now,
			LastSeenAt:    now,
			ExpiresAt:     now.Add(time.Hour),
			IdleExpiresAt: now.Add(time.Hour),
		}); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.CreateSession(ctx, store.Session{
		ID:            "other",
		UserID:        "user-2",
		Username:      "bob",
		CreatedAt:     now,
		LastSeenAt:    now,
		ExpiresAt:     now.Add(time.Hour),
		IdleExpiresAt: now.Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}

	if err := st.DeleteSessionsForUser(ctx, "user-1"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"s1", "s2", "s3"} {
		got, err := st.Session(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if got != nil {
			t.Fatalf("session %s should be deleted, got %+v", id, got)
		}
	}
	other, err := st.Session(ctx, "other")
	if err != nil {
		t.Fatal(err)
	}
	if other == nil || other.UserID != "user-2" {
		t.Fatalf("other session should remain, got %+v", other)
	}
}

func TestPing(t *testing.T) {
	t.Parallel()
	if err := store.NewMemory().Ping(context.Background()); err != nil {
		t.Fatal(err)
	}
}
