package main

import (
	"context"
	"log"
	"net/http"

	"github.com/zixflow/k8s/internal/audit"
	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/bootstrap"
	"github.com/zixflow/k8s/internal/config"
	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/kube"
	"github.com/zixflow/k8s/internal/store"
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
	handler := httpapi.New(httpapi.Deps{
		Ready:      st.Ping,
		Auth:       authSvc,
		Store:      st,
		Audit:      auditor,
		InstallNS:  cfg.PodNamespace,
		TrustProxy: cfg.TrustProxy,
		Kube:       kubeClient,
	})
	log.Fatal(http.ListenAndServe(cfg.ListenAddr, handler))
}
