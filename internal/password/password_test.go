package password_test

import (
	"testing"

	"github.com/zixflow/k8s/internal/password"
)

func TestVerifyRejectsMalformedEncodings(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		encoded string
	}{
		{name: "garbage", encoded: "not-a-valid-hash"},
		{name: "empty", encoded: ""},
		{name: "wrong algorithm", encoded: "bcrypt$v=10$abc$def"},
		{name: "m=0", encoded: "argon2id$v=19$m=0,t=1,p=4$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "t=0", encoded: "argon2id$v=19$m=65536,t=0,p=4$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "p=0", encoded: "argon2id$v=19$m=65536,t=1,p=0$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "p>255", encoded: "argon2id$v=19$m=65536,t=1,p=256$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "invalid base64 salt", encoded: "argon2id$v=19$m=65536,t=1,p=4$!!!$c2FsdHNhbHRzYWx0"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if password.Verify("password", tc.encoded) {
				t.Fatal("expected false for malformed encoding")
			}
		})
	}
}

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
