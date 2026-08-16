//go:build integration

package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/zixflow/k8s/internal/bootstrap"
	"github.com/zixflow/k8s/internal/store"
)

func TestOpenMongoIntegration(t *testing.T) {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		t.Skip("MONGODB_URI not set")
	}

	ctx := context.Background()
	st, err := store.OpenMongo(ctx, uri)
	if err != nil {
		t.Fatal(err)
	}

	if err := st.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	if err := bootstrap.SyncOwner(ctx, st, "owner", "integration-secret"); err != nil {
		t.Fatal(err)
	}

	u, err := st.UserByUsername(ctx, "owner")
	if err != nil {
		t.Fatal(err)
	}
	if u == nil {
		t.Fatal("expected owner user")
	}
	if u.Username != "owner" || u.Role != store.RoleOwner || !u.Enabled {
		t.Fatalf("user=%+v", u)
	}
}
