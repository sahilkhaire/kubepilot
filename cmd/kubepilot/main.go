package main

import (
	"context"
	"log"
	"net/http"

	"github.com/sahilkhaire/k8s-apis/internal/audit"
	"github.com/sahilkhaire/k8s-apis/internal/auth"
	"github.com/sahilkhaire/k8s-apis/internal/bootstrap"
	"github.com/sahilkhaire/k8s-apis/internal/config"
	"github.com/sahilkhaire/k8s-apis/internal/helmctrl"
	"github.com/sahilkhaire/k8s-apis/internal/httpapi"
	"github.com/sahilkhaire/k8s-apis/internal/kube"
	"github.com/sahilkhaire/k8s-apis/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	st, err := store.OpenMongo(ctx, cfg.MongoURI)
	if err != nil {
		log.Fatal(err)
	}
	if err := bootstrap.SyncOwner(ctx, st, cfg.OwnerUsername, cfg.OwnerPassword, audit.New(st)); err != nil {
		log.Fatal(err)
	}

	kubeClient, err := kube.NewInCluster()
	if err != nil {
		log.Fatal(err)
	}

	authSvc := auth.New(st, cfg.SessionSecret)
	auditor := audit.New(st)
	var helmClient helmctrl.Client
	if kubeClient.Config != nil {
		helmClient = helmctrl.NewSDKClient(kubeClient.Config, func(ctx context.Context) ([]helmctrl.Repository, error) {
			settings, err := st.GetAppSettings(ctx)
			if err != nil {
				return nil, err
			}
			repos := make([]helmctrl.Repository, 0, len(settings.HelmRepositories))
			for _, r := range settings.HelmRepositories {
				repos = append(repos, helmctrl.Repository{Name: r.Name, URL: r.URL})
			}
			return repos, nil
		})
	}
	handler := httpapi.New(httpapi.Deps{
		Ready:      st.Ping,
		Auth:       authSvc,
		Store:      st,
		Audit:      auditor,
		InstallNS:  cfg.PodNamespace,
		TrustProxy:    cfg.TrustProxy,
		Kube:          kubeClient,
		PrometheusURL: cfg.PrometheusURL,
		Helm:          helmClient,
	})
	log.Fatal(http.ListenAndServe(cfg.ListenAddr, handler))
}
