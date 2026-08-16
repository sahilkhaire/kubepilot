package helmctrl

import (
	"context"
	"testing"

	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/repo"
)

func TestSDKClientConfiguredRepositories(t *testing.T) {
	t.Parallel()

	c := &SDKClient{
		getRepos: func(ctx context.Context) ([]Repository, error) {
			return []Repository{
				{Name: "private", URL: "https://charts.example.com"},
				{Name: "internal", URL: "https://helm.internal.example/charts"},
			}, nil
		},
	}
	settings, cleanup, err := c.helmEnvSettings(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()

	if settings.RepositoryConfig == "" {
		t.Fatal("expected repository config path")
	}
	rf, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		t.Fatal(err)
	}
	if len(rf.Repositories) != 2 {
		t.Fatalf("repos=%d want 2", len(rf.Repositories))
	}
	if rf.Get("private").URL != "https://charts.example.com" {
		t.Fatalf("private repo=%+v", rf.Get("private"))
	}
	if rf.Get("internal").URL != "https://helm.internal.example/charts" {
		t.Fatalf("internal repo=%+v", rf.Get("internal"))
	}
}

func TestSDKClientEmptyRepositoriesUsesDefaultSettings(t *testing.T) {
	t.Parallel()

	defaultConfig := cli.New().RepositoryConfig
	c := &SDKClient{
		getRepos: func(ctx context.Context) ([]Repository, error) {
			return nil, nil
		},
	}
	settings, cleanup, err := c.helmEnvSettings(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()

	if settings.RepositoryConfig != defaultConfig {
		t.Fatalf("repository config=%q want default %q", settings.RepositoryConfig, defaultConfig)
	}
}
