package store_test

import (
	"context"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/store"
)

func TestAppSettingsRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	st := store.NewMemory()

	got, err := st.GetAppSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || len(got.HelmRepositories) != 0 {
		t.Fatalf("default settings=%+v want empty helmRepositories", got)
	}

	settings := store.AppSettings{
		HelmRepositories: []store.HelmRepository{
			{Name: "stable", URL: "https://example.com/charts"},
		},
	}
	if err := st.PutAppSettings(ctx, settings); err != nil {
		t.Fatal(err)
	}

	got, err = st.GetAppSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.HelmRepositories) != 1 {
		t.Fatalf("repos=%+v", got.HelmRepositories)
	}
	if got.HelmRepositories[0].Name != "stable" || got.HelmRepositories[0].URL != "https://example.com/charts" {
		t.Fatalf("repo=%+v", got.HelmRepositories[0])
	}
}
