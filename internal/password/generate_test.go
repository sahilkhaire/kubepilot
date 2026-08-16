package password_test

import (
	"strings"
	"testing"

	"github.com/sahilkhaire/k8s-apis/internal/password"
)

func TestGenerateLength(t *testing.T) {
	t.Parallel()
	p := password.Generate(24)
	if len(p) != 24 {
		t.Fatalf("len=%d want 24", len(p))
	}
}

func TestGenerateAlphabet(t *testing.T) {
	t.Parallel()
	const forbidden = "O0Il1"
	for i := 0; i < 50; i++ {
		p := password.Generate(24)
		for _, c := range forbidden {
			if strings.ContainsRune(p, c) {
				t.Fatalf("password %q contains forbidden %q", p, string(c))
			}
		}
	}
}
