package httpapi_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sahilkhaire/kubepilot/internal/httpapi"
)

func TestWebDistServesAssetsAndSPAFallback(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!DOCTYPE html><html><body>vite-app</body></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	assetsDir := filepath.Join(root, "assets")
	if err := os.Mkdir(assetsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "app.js"), []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := httpapi.New(httpapi.Deps{WebDist: root})

	t.Run("root", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("code=%d", rec.Code)
		}
		body, _ := io.ReadAll(rec.Body)
		if !strings.Contains(string(body), "vite-app") {
			t.Fatalf("body=%q", body)
		}
	})

	t.Run("assets", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("code=%d", rec.Code)
		}
		body, _ := io.ReadAll(rec.Body)
		if string(body) != "console.log('ok')" {
			t.Fatalf("body=%q", body)
		}
	})

	t.Run("spa_fallback", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/dashboard/pods", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("code=%d", rec.Code)
		}
		body, _ := io.ReadAll(rec.Body)
		if !strings.Contains(string(body), "vite-app") {
			t.Fatalf("body=%q", body)
		}
	})

	t.Run("api_not_hijacked", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/auth/me", nil))
		body, _ := io.ReadAll(rec.Body)
		if strings.Contains(string(body), "vite-app") {
			t.Fatalf("SPA index served for API path: code=%d body=%q", rec.Code, body)
		}
	})

	t.Run("healthz_not_hijacked", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("code=%d", rec.Code)
		}
	})

	t.Run("readyz_not_hijacked", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("code=%d", rec.Code)
		}
	})
}
