package httpapi_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zixflow/k8s/internal/httpapi"
)

func TestHealthzOK(t *testing.T) {
	t.Parallel()
	h := httpapi.New(httpapi.Deps{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if string(body) != "ok\n" {
		t.Fatalf("body=%q", body)
	}
}

func TestReadyz(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		err  error
		code int
	}{
		{name: "ready", err: nil, code: 200},
		{name: "not_ready", err: errNotReady{}, code: 503},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := httpapi.New(httpapi.Deps{Ready: func(context.Context) error { return tc.err }})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
			if rec.Code != tc.code {
				t.Fatalf("code=%d want %d", rec.Code, tc.code)
			}
		})
	}
}

type errNotReady struct{}

func (errNotReady) Error() string { return "mongo down" }
