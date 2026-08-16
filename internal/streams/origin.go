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

func sameOrigin(r *http.Request, trustProxy bool) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return strings.ToLower(u.Host) == requestHost(r, trustProxy)
}
