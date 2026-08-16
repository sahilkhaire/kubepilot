package store

import (
	"context"
	"strings"
	"sync"
	"time"
)

type memoryStore struct {
	mu sync.RWMutex

	ownerID         string
	users           map[string]*User
	usersByUsername map[string]string
	sessions        map[string]*Session
}

func NewMemory() Store {
	return &memoryStore{
		users:           make(map[string]*User),
		usersByUsername: make(map[string]string),
		sessions:        make(map[string]*Session),
	}
}

func (m *memoryStore) Owner(ctx context.Context) (*User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ownerID == "" {
		return nil, nil
	}
	return cloneUser(m.users[m.ownerID]), nil
}

func (m *memoryStore) CreateOwner(ctx context.Context, u User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	u.Username = strings.ToLower(u.Username)
	clone := cloneUser(&u)
	m.users[u.ID] = clone
	m.usersByUsername[u.Username] = u.ID
	m.ownerID = u.ID
	return nil
}

func (m *memoryStore) CreateMember(ctx context.Context, u User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	u.Username = strings.ToLower(u.Username)
	clone := cloneUser(&u)
	m.users[u.ID] = clone
	m.usersByUsername[u.Username] = u.ID
	return nil
}

func (m *memoryStore) UpdateOwnerPassword(ctx context.Context, userID, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	u, ok := m.users[userID]
	if !ok {
		return nil
	}
	u.PasswordHash = hash
	return nil
}

func (m *memoryStore) UpdatePassword(ctx context.Context, userID, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	u, ok := m.users[userID]
	if !ok {
		return nil
	}
	u.PasswordHash = hash
	u.MustChangePassword = false
	u.UpdatedAt = time.Now().UTC()
	return nil
}

func (m *memoryStore) UserByUsername(ctx context.Context, username string) (*User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	id, ok := m.usersByUsername[strings.ToLower(username)]
	if !ok {
		return nil, nil
	}
	return cloneUser(m.users[id]), nil
}

func (m *memoryStore) UserByID(ctx context.Context, id string) (*User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	u, ok := m.users[id]
	if !ok {
		return nil, nil
	}
	return cloneUser(u), nil
}

func (m *memoryStore) CreateSession(ctx context.Context, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[s.ID] = cloneSession(&s)
	return nil
}

func (m *memoryStore) Session(ctx context.Context, id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[id]
	if !ok {
		return nil, nil
	}
	return cloneSession(s), nil
}

func (m *memoryStore) TouchSession(ctx context.Context, id string, lastSeen, idleExpires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.sessions[id]
	if !ok {
		return nil
	}
	s.LastSeenAt = lastSeen
	s.IdleExpiresAt = idleExpires
	return nil
}

func (m *memoryStore) DeleteSession(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
	return nil
}

func (m *memoryStore) DeleteSessionsForUser(ctx context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		if s.UserID == userID {
			delete(m.sessions, id)
		}
	}
	return nil
}

func (m *memoryStore) Ping(ctx context.Context) error {
	return nil
}

func cloneUser(u *User) *User {
	if u == nil {
		return nil
	}
	clone := *u
	if u.Namespaces != nil {
		clone.Namespaces = append([]string(nil), u.Namespaces...)
	}
	return &clone
}

func cloneSession(s *Session) *Session {
	if s == nil {
		return nil
	}
	clone := *s
	return &clone
}
