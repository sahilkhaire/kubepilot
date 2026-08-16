package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	ListenAddr     string // default ":8080"
	MongoURI       string
	SessionSecret  string
	OwnerUsername  string // default "owner"
	OwnerPassword  string
	PodNamespace   string
	TrustProxy     bool // default true; "false" disables
	PrometheusURL  string // optional; PROMETHEUS_URL env
}

func Load() (Config, error) {
	c := Config{
		ListenAddr:    envOrDefault("LISTEN_ADDR", ":8080"),
		MongoURI:      os.Getenv("MONGODB_URI"),
		SessionSecret: os.Getenv("SESSION_SECRET"),
		OwnerUsername: envOrDefault("OWNER_USERNAME", "owner"),
		OwnerPassword: os.Getenv("OWNER_PASSWORD"),
		PodNamespace:  os.Getenv("POD_NAMESPACE"),
		TrustProxy:    trustProxyFromEnv(),
		PrometheusURL: os.Getenv("PROMETHEUS_URL"),
	}

	if c.MongoURI == "" {
		return Config{}, fmt.Errorf("MONGODB_URI is required")
	}
	if c.SessionSecret == "" {
		return Config{}, fmt.Errorf("SESSION_SECRET is required")
	}
	if c.OwnerPassword == "" {
		return Config{}, fmt.Errorf("OWNER_PASSWORD is required")
	}
	if c.PodNamespace == "" {
		return Config{}, fmt.Errorf("POD_NAMESPACE is required")
	}

	return c, nil
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func trustProxyFromEnv() bool {
	v := os.Getenv("TRUST_PROXY")
	if strings.EqualFold(v, "false") {
		return false
	}
	return true
}
