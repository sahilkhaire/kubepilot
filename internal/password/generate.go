package password

import (
	"crypto/rand"
	"math/big"
)

// Alphabet: unreserved URL-safe chars minus ambiguous O0Il1.
const generateAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789-_"

func Generate(n int) string {
	if n <= 0 {
		return ""
	}
	max := big.NewInt(int64(len(generateAlphabet)))
	out := make([]byte, n)
	for i := range out {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			// Fallback: should not happen in practice.
			out[i] = generateAlphabet[0]
			continue
		}
		out[i] = generateAlphabet[idx.Int64()]
	}
	return string(out)
}
