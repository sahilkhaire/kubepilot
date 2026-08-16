package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/zixflow/k8s/internal/httpapi"
)

func main() {
	handler := httpapi.New(httpapi.Deps{
		Ready: func(context.Context) error {
			return fmt.Errorf("not configured")
		},
	})
	log.Fatal(http.ListenAndServe(":8080", handler))
}
