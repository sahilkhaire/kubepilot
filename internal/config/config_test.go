package config_test

import (
	"testing"

	"github.com/sahilkhaire/k8s-apis/internal/config"
)

func TestLoadRequiresSecrets(t *testing.T) {
	t.Run("missing_owner_password", func(t *testing.T) {
		t.Setenv("MONGODB_URI", "mongodb://localhost:27017/cluster_console")
		t.Setenv("SESSION_SECRET", "x")
		t.Setenv("OWNER_PASSWORD", "")
		t.Setenv("POD_NAMESPACE", "ns")
		_, err := config.Load()
		if err == nil {
			t.Fatal("expected error")
		}
	})
	t.Run("defaults", func(t *testing.T) {
		t.Setenv("MONGODB_URI", "mongodb://localhost:27017/cluster_console")
		t.Setenv("SESSION_SECRET", "x")
		t.Setenv("OWNER_PASSWORD", "p")
		t.Setenv("POD_NAMESPACE", "console")
		t.Setenv("LISTEN_ADDR", "")
		t.Setenv("OWNER_USERNAME", "")
		c, err := config.Load()
		if err != nil {
			t.Fatal(err)
		}
		if c.ListenAddr != ":8080" || c.OwnerUsername != "owner" || !c.TrustProxy {
			t.Fatalf("%+v", c)
		}
	})
}
