package bootstrap

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/audit"
	"github.com/sahilkhaire/kubepilot/internal/password"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

func SyncOwner(ctx context.Context, st store.Store, ownerUsername, ownerPassword string, auditor *audit.Auditor) error {
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
	if err := st.DeleteSessionsForUser(ctx, owner.ID); err != nil {
		return err
	}
	if auditor != nil {
		_ = auditor.Write(ctx, audit.Event{
			UserID:     owner.ID,
			Username:   owner.Username,
			Role:       string(owner.Role),
			Module:     "auth",
			Action:     "owner_password_sync",
			Result:     "success",
			HTTPStatus: http.StatusOK,
		})
	}
	return nil
}

func newUserID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate user id: %w", err)
	}
	return "user-" + hex.EncodeToString(b), nil
}
