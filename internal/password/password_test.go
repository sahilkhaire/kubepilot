package password_test

import (
	"testing"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/password"
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
		{name: "empty salt", encoded: "argon2id$v=19$m=65536,t=1,p=4$$c2FsdHNhbHRzYWx0"},
		{name: "empty hash", encoded: "argon2id$v=19$m=65536,t=1,p=4$c2FsdHNhbHRzYWx0$"},
		{name: "empty base64 salt", encoded: "argon2id$v=19$m=65536,t=1,p=4$$dGVzdA"},
		{name: "huge m", encoded: "argon2id$v=19$m=4294967295,t=1,p=4$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "wrong t", encoded: "argon2id$v=19$m=65536,t=99,p=4$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "wrong p", encoded: "argon2id$v=19$m=65536,t=1,p=8$c2FsdHNhbHRzYWx0$c2FsdHNhbHRzYWx0"},
		{name: "wrong key length", encoded: "argon2id$v=19$m=65536,t=1,p=4$c2FsdHNhbHRzYWx0$dGVzdA"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			start := time.Now()
			if password.Verify("password", tc.encoded) {
				t.Fatal("expected false for malformed encoding")
			}
			if tc.name == "huge m" && time.Since(start) > 100*time.Millisecond {
				t.Fatalf("huge m should reject quickly, took %v", time.Since(start))
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
