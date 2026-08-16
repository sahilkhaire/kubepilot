package streams

import (
	"net/http"
	"net/url"
	"strings"
)

func requestHost(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if h := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); h != "" {
			h = strings.TrimSpace(strings.Split(h, ",")[0])
			return strings.ToLower(h)
		}
	}
	return strings.ToLower(r.Host)
}

func requestScheme(r *http.Request, trustProxy bool) string {
	if r.TLS != nil {
		return "https"
	}
	if trustProxy {
		if proto := strings.TrimSpace(strings.ToLower(r.Header.Get("X-Forwarded-Proto"))); proto != "" {
			proto = strings.TrimSpace(strings.Split(proto, ",")[0])
			if proto == "https" || proto == "http" {
				return proto
			}
		}
	}
	return "http"
}

func sameOrigin(r *http.Request, trustProxy bool) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.Scheme == "" {
		return false
	}
	return strings.ToLower(u.Scheme) == requestScheme(r, trustProxy) &&
		strings.ToLower(u.Host) == requestHost(r, trustProxy)
}
