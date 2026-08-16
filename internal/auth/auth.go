package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/sahilkhaire/kubepilot/internal/password"
	"github.com/sahilkhaire/kubepilot/internal/store"
)

const CookieName = "kubepilot_session"

const (
	idleDuration = 8 * time.Hour
	maxDuration  = 24 * time.Hour
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrSessionInvalid     = errors.New("session invalid")
)

type Service struct {
	store         store.Store
	sessionSecret string
	now           func() time.Time
}

func New(st store.Store, sessionSecret string) *Service {
	return &Service{
		store:         st,
		sessionSecret: sessionSecret,
		now:           time.Now,
	}
}

func (s *Service) Login(ctx context.Context, username, plainPassword, ip, ua string) (string, store.User, error) {
	u, err := s.store.UserByUsername(ctx, strings.ToLower(username))
	if err != nil {
		return "", store.User{}, err
	}
	if u == nil || !u.Enabled || !password.Verify(plainPassword, u.PasswordHash) {
		return "", store.User{}, ErrInvalidCredentials
	}

	sessionID, err := newSessionID()
	if err != nil {
		return "", store.User{}, err
	}

	now := s.now().UTC()
	sess := store.Session{
		ID:            sessionID,
		UserID:        u.ID,
		Username:      u.Username,
		CreatedAt:     now,
		LastSeenAt:    now,
		ExpiresAt:     now.Add(maxDuration),
		IdleExpiresAt: now.Add(idleDuration),
		IP:            ip,
		UserAgent:     ua,
	}
	if err := s.store.CreateSession(ctx, sess); err != nil {
		return "", store.User{}, err
	}

	return sessionID, *u, nil
}

func (s *Service) Logout(ctx context.Context, sessionID string) error {
	return s.store.DeleteSession(ctx, sessionID)
}

func (s *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	u, err := s.store.UserByID(ctx, userID)
	if err != nil {
		return err
	}
	if u == nil || !password.Verify(currentPassword, u.PasswordHash) {
		return ErrInvalidCredentials
	}
	if err := password.Validate(newPassword); err != nil {
		return err
	}

	hash, err := password.Hash(newPassword)
	if err != nil {
		return err
	}
	return s.store.UpdatePassword(ctx, userID, hash)
}

func (s *Service) Authenticate(ctx context.Context, sessionID string) (*store.User, *store.Session, error) {
	sess, err := s.store.Session(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}
	if sess == nil {
		return nil, nil, ErrSessionInvalid
	}

	now := s.now().UTC()
	if now.After(sess.ExpiresAt) || now.After(sess.IdleExpiresAt) {
		return nil, nil, ErrSessionInvalid
	}

	u, err := s.store.UserByID(ctx, sess.UserID)
	if err != nil {
		return nil, nil, err
	}
	if u == nil || !u.Enabled {
		return nil, nil, ErrSessionInvalid
	}

	idleExpires := now.Add(idleDuration)
	if err := s.store.TouchSession(ctx, sessionID, now, idleExpires); err != nil {
		return nil, nil, err
	}
	sess.LastSeenAt = now
	sess.IdleExpiresAt = idleExpires

	return u, sess, nil
}

func (s *Service) SignCookie(sessionID string) string {
	return sessionID + "." + s.sign(sessionID)
}

func (s *Service) ParseCookie(value string) (string, bool) {
	parts := strings.SplitN(value, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", false
	}
	sessionID, sig := parts[0], parts[1]
	expected := s.sign(sessionID)
	if len(sig) != len(expected) || subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return "", false
	}
	return sessionID, true
}

func (s *Service) sign(sessionID string) string {
	mac := hmac.New(sha256.New, []byte(s.sessionSecret))
	_, _ = mac.Write([]byte(sessionID))
	return hex.EncodeToString(mac.Sum(nil))
}

func newSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
