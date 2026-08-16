package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/zixflow/k8s/internal/config"
	"github.com/zixflow/k8s/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	handler := httpapi.New(httpapi.Deps{
		Ready: func(context.Context) error {
			return fmt.Errorf("not configured")
		},
	})
	log.Fatal(http.ListenAndServe(cfg.ListenAddr, handler))
}
