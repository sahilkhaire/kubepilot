package main

import (
	"context"
	"log"
	"net/http"

	"github.com/zixflow/k8s/internal/auth"
	"github.com/zixflow/k8s/internal/bootstrap"
	"github.com/zixflow/k8s/internal/config"
	"github.com/zixflow/k8s/internal/httpapi"
	"github.com/zixflow/k8s/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, cfg.OwnerUsername, cfg.OwnerPassword); err != nil {
		log.Fatal(err)
	}

	authSvc := auth.New(st, cfg.SessionSecret)
	handler := httpapi.New(httpapi.Deps{
		Ready: st.Ping,
		Auth:  authSvc,
	})
	log.Fatal(http.ListenAndServe(cfg.ListenAddr, handler))
}
