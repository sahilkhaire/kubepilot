package bootstrap_test

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/bootstrap"
	"github.com/sahilkhaire/kubepilot/internal/rbac"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

func TestMigrateNamespaceGrantsSplitsSets(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()
	ps := store.PermissionSet{
		ID:          "aaaaaaaaaaaaaaaaaaaaaaaa",
		Name:        "Operator",
		Description: "ops",
		Grants:      map[string][]string{"pods": {"view"}},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}
	createMigratingMember(t, st, "alice", ps.ID, []string{"dev"})
	createMigratingMember(t, st, "bob", ps.ID, []string{"prod"})

	if err := bootstrap.MigrateNamespaceGrants(ctx, st, "kubepilot"); err != nil {
		t.Fatal(err)
	}

	alice, err := st.UserByUsername(ctx, "alice")
	if err != nil || alice == nil {
		t.Fatalf("alice: %v", err)
	}
	bob, err := st.UserByUsername(ctx, "bob")
	if err != nil || bob == nil {
		t.Fatalf("bob: %v", err)
	}
	if alice.PermissionSetID == bob.PermissionSetID {
		t.Fatal("expected split permission sets")
	}
	if len(alice.Namespaces) != 0 || len(bob.Namespaces) != 0 {
		t.Fatalf("member namespaces should be cleared: alice=%v bob=%v", alice.Namespaces, bob.Namespaces)
	}

	alicePS, err := st.PermissionSet(ctx, alice.PermissionSetID)
	if err != nil {
		t.Fatal(err)
	}
	bobPS, err := st.PermissionSet(ctx, bob.PermissionSetID)
	if err != nil {
		t.Fatal(err)
	}
	assertSelectedNames(t, alicePS, []string{"dev"})
	assertSelectedNames(t, bobPS, []string{"prod"})

	sets, err := st.ListPermissionSets(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(sets) != 2 {
		t.Fatalf("sets=%d want 2", len(sets))
	}
}

func TestMigrateNamespaceGrantsStarBecomesAll(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()
	ps := store.PermissionSet{
		ID:        "bbbbbbbbbbbbbbbbbbbbbbbb",
		Name:      "Viewer",
		Grants:    map[string][]string{"pods": {"view"}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}
	createMigratingMember(t, st, "cara", ps.ID, []string{"*"})

	if err := bootstrap.MigrateNamespaceGrants(ctx, st, "kubepilot"); err != nil {
		t.Fatal(err)
	}

	got, err := st.PermissionSet(ctx, ps.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.NamespaceScope != rbac.NamespaceScopeAll {
		t.Fatalf("scope=%q want all", got.NamespaceScope)
	}
	cara, err := st.UserByUsername(ctx, "cara")
	if err != nil {
		t.Fatal(err)
	}
	if cara.PermissionSetID != ps.ID {
		t.Fatalf("permissionSetId=%s want original", cara.PermissionSetID)
	}
	if len(cara.Namespaces) != 0 {
		t.Fatalf("namespaces=%v want empty", cara.Namespaces)
	}
}

func TestMigrateNamespaceGrantsUnusedSetDefaultsAll(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()
	ps := store.PermissionSet{
		ID:        "cccccccccccccccccccccccc",
		Name:      "Empty",
		Grants:    map[string][]string{"pods": {"view"}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}
	if err := bootstrap.MigrateNamespaceGrants(ctx, st, "kubepilot"); err != nil {
		t.Fatal(err)
	}
	got, err := st.PermissionSet(ctx, ps.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.NamespaceScope != rbac.NamespaceScopeAll {
		t.Fatalf("scope=%q want all", got.NamespaceScope)
	}
}

func TestMigrateNamespaceGrantsIdempotent(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()
	ps := store.PermissionSet{
		ID:        "dddddddddddddddddddddddd",
		Name:      "Once",
		Grants:    map[string][]string{"pods": {"view"}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}
	createMigratingMember(t, st, "dana", ps.ID, []string{"dev"})
	if err := bootstrap.MigrateNamespaceGrants(ctx, st, "kubepilot"); err != nil {
		t.Fatal(err)
	}
	if err := bootstrap.MigrateNamespaceGrants(ctx, st, "kubepilot"); err != nil {
		t.Fatal(err)
	}
	sets, err := st.ListPermissionSets(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(sets) != 1 {
		t.Fatalf("sets=%d want 1", len(sets))
	}
	dana, err := st.UserByUsername(ctx, "dana")
	if err != nil {
		t.Fatal(err)
	}
	if dana.PermissionSetID != ps.ID {
		t.Fatalf("permissionSetId=%s want %s", dana.PermissionSetID, ps.ID)
	}
}

func TestMigrateNamespaceGrantsSkipsScopedSets(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()
	now := time.Now().UTC()
	ps := store.PermissionSet{
		ID:             "eeeeeeeeeeeeeeeeeeeeeeee",
		Name:           "Scoped",
		Grants:         map[string][]string{"pods": {"view"}},
		NamespaceScope: rbac.NamespaceScopeSelected,
		Namespaces:     []string{"dev"},
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := st.CreatePermissionSet(ctx, ps); err != nil {
		t.Fatal(err)
	}
	createMigratingMember(t, st, "erin", ps.ID, []string{"prod"})
	if err := bootstrap.MigrateNamespaceGrants(ctx, st, "kubepilot"); err != nil {
		t.Fatal(err)
	}
	sets, err := st.ListPermissionSets(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(sets) != 1 {
		t.Fatalf("sets=%d want 1", len(sets))
	}
	got, err := st.PermissionSet(ctx, ps.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertSelectedNames(t, got, []string{"dev"})
	erin, err := st.UserByUsername(ctx, "erin")
	if err != nil {
		t.Fatal(err)
	}
	if len(erin.Namespaces) != 0 {
		t.Fatalf("namespaces=%v want empty", erin.Namespaces)
	}
}

func createMigratingMember(t *testing.T, st store.Store, username, permissionSetID string, namespaces []string) {
	t.Helper()
	now := time.Now().UTC()
	if err := st.CreateMember(context.Background(), store.User{
		ID:              "member-" + username,
		Username:        username,
		DisplayName:     username,
		Role:            store.RoleMember,
		PasswordHash:    "hash",
		Enabled:         true,
		PermissionSetID: permissionSetID,
		Namespaces:      namespaces,
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatal(err)
	}
}

func assertSelectedNames(t *testing.T, ps *store.PermissionSet, want []string) {
	t.Helper()
	if ps == nil {
		t.Fatal("permission set is nil")
	}
	if ps.NamespaceScope != rbac.NamespaceScopeSelected {
		t.Fatalf("scope=%q want selected", ps.NamespaceScope)
	}
	if !slices.Equal(ps.Namespaces, want) {
		t.Fatalf("namespaces=%v want %v", ps.Namespaces, want)
	}
}
