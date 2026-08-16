package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/zixflow/k8s/internal/store"
)

func TestDeletePermissionSetInUse(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()

	ps := store.PermissionSet{
		ID:          "ps-1",
		Name:        "Viewer Clone",
		Description: "test",
		Grants:      map[string][]string{"pods": {"view"}},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}

	if err := st.CreateMember(ctx, store.User{
		ID:              "member-1",
		Username:        "member",
		DisplayName:     "Member",
		Role:            store.RoleMember,
		PasswordHash:    "hash",
		Enabled:         true,
		PermissionSetID: "ps-1",
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatal(err)
	}

	err := st.DeletePermissionSet(ctx, "ps-1")
	if err != store.ErrInUse {
		t.Fatalf("DeletePermissionSet() err=%v want ErrInUse", err)
	}

	got, err := st.PermissionSet(ctx, "ps-1")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("permission set should still exist")
	}
}

func TestDeletePermissionSetNotInUse(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()

	ps := store.PermissionSet{
		ID:          "ps-2",
		Name:        "Unused",
		Description: "test",
		Grants:      map[string][]string{"pods": {"view"}},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}

	if err := st.DeletePermissionSet(ctx, "ps-2"); err != nil {
		t.Fatal(err)
	}

	got, err := st.PermissionSet(ctx, "ps-2")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("expected nil permission set, got %+v", got)
	}
}
