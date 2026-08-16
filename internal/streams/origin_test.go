package streams

import (
	"crypto/tls"
	"net/http/httptest"
	"testing"
)

func TestSameOrigin(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		host           string
		origin         string
		forwarded      string
		forwardedProto string
		tls            bool
		trustProxy     bool
		want           bool
	}{
		{name: "empty origin allowed", host: "app.example.com", want: true},
		{name: "matching host http", host: "app.example.com", origin: "http://app.example.com", want: true},
		{name: "matching host https via tls", host: "app.example.com", origin: "https://app.example.com", tls: true, want: true},
		{name: "matching host with port", host: "localhost:8080", origin: "http://localhost:8080", want: true},
		{name: "foreign origin rejected", host: "app.example.com", origin: "http://evil.example.com", want: false},
		{name: "scheme mismatch http origin on https request", host: "app.example.com", origin: "http://app.example.com", tls: true, want: false},
		{name: "scheme mismatch https origin on http request", host: "app.example.com", origin: "https://app.example.com", want: false},
		{name: "invalid origin rejected", host: "app.example.com", origin: "://bad", want: false},
		{name: "forwarded host and proto match", host: "internal:8080", origin: "https://app.example.com", forwarded: "app.example.com", forwardedProto: "https", trustProxy: true, want: true},
		{name: "forwarded host match scheme mismatch", host: "internal:8080", origin: "http://app.example.com", forwarded: "app.example.com", forwardedProto: "https", trustProxy: true, want: false},
		{name: "forwarded host mismatch", host: "internal:8080", origin: "https://evil.example.com", forwarded: "app.example.com", forwardedProto: "https", trustProxy: true, want: false},
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
			if tc.forwardedProto != "" {
				req.Header.Set("X-Forwarded-Proto", tc.forwardedProto)
			}
			if tc.tls {
				req.TLS = &tls.ConnectionState{}
			}
			if got := sameOrigin(req, tc.trustProxy); got != tc.want {
				t.Fatalf("sameOrigin=%v want %v", got, tc.want)
			}
		})
	}
}
