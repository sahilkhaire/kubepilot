package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	time      = 1
	memory    = 64 * 1024
	threads   = 4
	keyLen    = 32
	saltLen   = 16
	MinLength = 8
	MaxLength = 128
)

var ErrInvalid = errors.New("password must be 8–128 characters")

func Validate(plain string) error {
	n := len(plain)
	if n < MinLength || n > MaxLength {
		return ErrInvalid
	}
	return nil
}

func Hash(plain string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(plain), salt, time, memory, threads, keyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf("argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", memory, time, threads, b64Salt, b64Hash)
	return encoded, nil
}

func Verify(plain, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 || parts[0] != "argon2id" {
		return false
	}

	var version int
	if _, err := fmt.Sscanf(parts[1], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}

	var m, t, p uint32
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	if m != memory || t != time || p != threads {
		return false
	}

	if parts[3] == "" || parts[4] == "" {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(salt) == 0 {
		return false
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(expectedHash) != keyLen {
		return false
	}

	computedHash := argon2.IDKey([]byte(plain), salt, time, memory, threads, keyLen)
	return subtle.ConstantTimeCompare(computedHash, expectedHash) == 1
}
