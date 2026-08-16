package httpapi_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/httpapi"
)

func TestLoginPageServed(t *testing.T) {
	t.Parallel()
	h := httpapi.New(httpapi.Deps{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if !strings.Contains(string(body), "password") {
		t.Fatalf("body missing password input: %q", body)
	}
}

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
