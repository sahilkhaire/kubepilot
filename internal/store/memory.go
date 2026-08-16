package store

import (
	"context"
	"fmt"
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
	permissionSets  map[string]*PermissionSet
	auditLogs       map[string]*AuditLog
	appSettings     *AppSettings
	nextAuditID     int
}

func NewMemory() Store {
	return &memoryStore{
		users:           make(map[string]*User),
		usersByUsername: make(map[string]string),
		sessions:        make(map[string]*Session),
		permissionSets:  make(map[string]*PermissionSet),
		auditLogs:       make(map[string]*AuditLog),
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

func (m *memoryStore) ListMembers(ctx context.Context) ([]User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []User
	for _, u := range m.users {
		if u.Role == RoleMember {
			out = append(out, *cloneUser(u))
		}
	}
	return out, nil
}

func (m *memoryStore) UpdateMember(ctx context.Context, u User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, ok := m.users[u.ID]
	if !ok || existing.Role != RoleMember {
		return nil
	}
	clone := cloneUser(&u)
	clone.Username = existing.Username
	clone.Role = RoleMember
	clone.PasswordHash = existing.PasswordHash
	clone.MustChangePassword = existing.MustChangePassword
	clone.CreatedAt = existing.CreatedAt
	clone.CreatedBy = existing.CreatedBy
	m.users[u.ID] = clone
	return nil
}

func (m *memoryStore) DeleteMember(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	u, ok := m.users[id]
	if !ok || u.Role != RoleMember {
		return nil
	}
	delete(m.usersByUsername, u.Username)
	delete(m.users, id)
	for sid, s := range m.sessions {
		if s.UserID == id {
			delete(m.sessions, sid)
		}
	}
	return nil
}

func (m *memoryStore) ResetMemberPassword(ctx context.Context, userID, hash string, mustChange bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	u, ok := m.users[userID]
	if !ok || u.Role != RoleMember {
		return nil
	}
	u.PasswordHash = hash
	u.MustChangePassword = mustChange
	u.UpdatedAt = time.Now().UTC()
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

func (m *memoryStore) CreatePermissionSet(ctx context.Context, ps PermissionSet) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	clone := clonePermissionSet(&ps)
	m.permissionSets[ps.ID] = clone
	return nil
}

func (m *memoryStore) UpdatePermissionSet(ctx context.Context, ps PermissionSet) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.permissionSets[ps.ID]; !ok {
		return nil
	}
	m.permissionSets[ps.ID] = clonePermissionSet(&ps)
	return nil
}

func (m *memoryStore) DeletePermissionSet(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.permissionSets[id]; !ok {
		return nil
	}
	for _, u := range m.users {
		if u.Role == RoleMember && u.PermissionSetID == id {
			return ErrInUse
		}
	}
	delete(m.permissionSets, id)
	return nil
}

func (m *memoryStore) PermissionSet(ctx context.Context, id string) (*PermissionSet, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ps, ok := m.permissionSets[id]
	if !ok {
		return nil, nil
	}
	return clonePermissionSet(ps), nil
}

func (m *memoryStore) ListPermissionSets(ctx context.Context) ([]PermissionSet, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]PermissionSet, 0, len(m.permissionSets))
	for _, ps := range m.permissionSets {
		out = append(out, *clonePermissionSet(ps))
	}
	return out, nil
}

func (m *memoryStore) MembersByPermissionSetID(ctx context.Context, permissionSetID string) ([]User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []User
	for _, u := range m.users {
		if u.Role == RoleMember && u.PermissionSetID == permissionSetID {
			out = append(out, *cloneUser(u))
		}
	}
	return out, nil
}

func (m *memoryStore) InsertAudit(ctx context.Context, log AuditLog) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextAuditID++
	id := formatAuditID(m.nextAuditID)
	clone := cloneAuditLog(&log)
	clone.ID = id
	m.auditLogs[id] = clone
	return id, nil
}

func (m *memoryStore) QueryAudit(ctx context.Context, filter AuditFilter) ([]AuditLog, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []AuditLog
	for _, log := range m.auditLogs {
		if !auditMatchesFilter(log, filter) {
			continue
		}
		out = append(out, *cloneAuditLog(log))
	}
	sortAuditLogs(out)
	return out, nil
}

func (m *memoryStore) DeleteAuditIDs(ctx context.Context, ids []string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, id := range ids {
		if _, ok := m.auditLogs[id]; ok {
			delete(m.auditLogs, id)
			n++
		}
	}
	return n, nil
}

func (m *memoryStore) GetAppSettings(ctx context.Context) (*AppSettings, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.appSettings == nil {
		return &AppSettings{HelmRepositories: []HelmRepository{}}, nil
	}
	return cloneAppSettings(m.appSettings), nil
}

func (m *memoryStore) PutAppSettings(ctx context.Context, settings AppSettings) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.appSettings = cloneAppSettings(&settings)
	return nil
}

func (m *memoryStore) DeleteAuditFilter(ctx context.Context, filter AuditFilter) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for id, log := range m.auditLogs {
		if !auditMatchesFilter(log, filter) {
			continue
		}
		delete(m.auditLogs, id)
		n++
	}
	return n, nil
}

func formatAuditID(n int) string {
	return fmt.Sprintf("audit-%d", n)
}

func auditMatchesFilter(log *AuditLog, filter AuditFilter) bool {
	if filter.From != nil && log.Timestamp.Before(*filter.From) {
		return false
	}
	if filter.To != nil && log.Timestamp.After(*filter.To) {
		return false
	}
	if filter.Username != "" && log.Username != filter.Username {
		return false
	}
	if filter.Module != "" && log.Module != filter.Module {
		return false
	}
	if filter.Action != "" && log.Action != filter.Action {
		return false
	}
	if filter.Result != "" && log.Result != filter.Result {
		return false
	}
	if filter.Namespace != "" && log.Namespace != filter.Namespace {
		return false
	}
	if filter.Kind != "" && log.Kind != filter.Kind {
		return false
	}
	return true
}

func sortAuditLogs(logs []AuditLog) {
	for i := 0; i < len(logs); i++ {
		for j := i + 1; j < len(logs); j++ {
			if logs[j].Timestamp.After(logs[i].Timestamp) {
				logs[i], logs[j] = logs[j], logs[i]
			}
		}
	}
}

func cloneAuditLog(log *AuditLog) *AuditLog {
	if log == nil {
		return nil
	}
	clone := *log
	if log.Details != nil {
		clone.Details = make(map[string]any, len(log.Details))
		for k, v := range log.Details {
			clone.Details[k] = v
		}
	}
	return &clone
}

func clonePermissionSet(ps *PermissionSet) *PermissionSet {
	if ps == nil {
		return nil
	}
	clone := *ps
	if ps.Grants != nil {
		clone.Grants = make(map[string][]string, len(ps.Grants))
		for k, v := range ps.Grants {
			clone.Grants[k] = append([]string(nil), v...)
		}
	}
	if ps.Namespaces != nil {
		clone.Namespaces = append([]string(nil), ps.Namespaces...)
	}
	if ps.NamespaceRegex != nil {
		clone.NamespaceRegex = append([]string(nil), ps.NamespaceRegex...)
	}
	return &clone
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

func cloneAppSettings(s *AppSettings) *AppSettings {
	if s == nil {
		return nil
	}
	clone := *s
	if s.HelmRepositories != nil {
		clone.HelmRepositories = make([]HelmRepository, len(s.HelmRepositories))
		copy(clone.HelmRepositories, s.HelmRepositories)
	} else {
		clone.HelmRepositories = []HelmRepository{}
	}
	return &clone
}
