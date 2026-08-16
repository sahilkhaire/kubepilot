package password_test

import (
	"testing"

	"github.com/zixflow/k8s/internal/password"
)

func TestHashVerify(t *testing.T) {
	t.Parallel()
	h, err := password.Hash("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !password.Verify("correct horse", h) {
		t.Fatal("should verify")
	}
	if password.Verify("wrong", h) {
		t.Fatal("should reject")
	}
}
