package bootstrap

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/zixflow/k8s/internal/password"
	"github.com/zixflow/k8s/internal/store"
)

func SyncOwner(ctx context.Context, st store.Store, ownerUsername, ownerPassword string) error {
	if ownerPassword == "" {
		return errors.New("owner password is required")
	}

	owner, err := st.Owner(ctx)
	if err != nil {
		return err
	}

	if owner == nil {
		hash, err := password.Hash(ownerPassword)
		if err != nil {
			return err
		}

		id, err := newUserID()
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		return st.CreateOwner(ctx, store.User{
			ID:                 id,
			Username:           strings.ToLower(ownerUsername),
			DisplayName:        "Owner",
			Role:               store.RoleOwner,
			PasswordHash:       hash,
			MustChangePassword: false,
			Enabled:            true,
			CreatedAt:          now,
			UpdatedAt:          now,
		})
	}

	if password.Verify(ownerPassword, owner.PasswordHash) {
		return nil
	}

	hash, err := password.Hash(ownerPassword)
	if err != nil {
		return err
	}
	if err := st.UpdateOwnerPassword(ctx, owner.ID, hash); err != nil {
		return err
	}
	return st.DeleteSessionsForUser(ctx, owner.ID)
}

func newUserID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate user id: %w", err)
	}
	return "user-" + hex.EncodeToString(b), nil
}
