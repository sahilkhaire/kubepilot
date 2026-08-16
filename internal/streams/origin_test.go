package streams

import (
	"net/http/httptest"
	"testing"
)

func TestSameOrigin(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		host       string
		origin     string
		forwarded  string
		trustProxy bool
		want       bool
	}{
		{name: "empty origin allowed", host: "app.example.com", want: true},
		{name: "matching host", host: "app.example.com", origin: "https://app.example.com", want: true},
		{name: "matching host with port", host: "localhost:8080", origin: "http://localhost:8080", want: true},
		{name: "foreign origin rejected", host: "app.example.com", origin: "https://evil.example.com", want: false},
		{name: "invalid origin rejected", host: "app.example.com", origin: "://bad", want: false},
		{name: "forwarded host match", host: "internal:8080", origin: "https://app.example.com", forwarded: "app.example.com", trustProxy: true, want: true},
		{name: "forwarded host mismatch", host: "internal:8080", origin: "https://evil.example.com", forwarded: "app.example.com", trustProxy: true, want: false},
		{name: "ignore forwarded host without trust proxy", host: "internal:8080", origin: "https://evil.example.com", forwarded: "app.example.com", trustProxy: false, want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "http://"+tc.host+"/api/streams/exec", nil)
			req.Host = tc.host
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.forwarded != "" {
				req.Header.Set("X-Forwarded-Host", tc.forwarded)
			}
			if got := sameOrigin(req, tc.trustProxy); got != tc.want {
				t.Fatalf("sameOrigin=%v want %v", got, tc.want)
			}
		})
	}
}
