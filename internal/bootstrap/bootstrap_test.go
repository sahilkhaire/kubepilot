package bootstrap_test

import (
	"context"
	"testing"

	"github.com/zixflow/k8s/internal/bootstrap"
	"github.com/zixflow/k8s/internal/password"
	"github.com/zixflow/k8s/internal/store"
)

func TestSyncOwnerCreatesThenUpdatesPassword(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "Owner", "first", nil); err != nil {
		t.Fatal(err)
	}
	u, err := st.Owner(ctx)
	if err != nil || u == nil || u.Username != "owner" {
		t.Fatalf("%v %+v", err, u)
	}
	if !password.Verify("first", u.PasswordHash) {
		t.Fatal("hash")
	}
	sid := "s1"
	_ = st.CreateSession(ctx, store.Session{ID: sid, UserID: u.ID})
	if err := bootstrap.SyncOwner(ctx, st, "ignored", "second", nil); err != nil {
		t.Fatal(err)
	}
	u2, _ := st.Owner(ctx)
	if u2.Username != "owner" {
		t.Fatal("username must not change")
	}
	if !password.Verify("second", u2.PasswordHash) {
		t.Fatal("new password")
	}
	s, _ := st.Session(ctx, sid)
	if s != nil {
		t.Fatal("owner sessions must be cleared")
	}
}
