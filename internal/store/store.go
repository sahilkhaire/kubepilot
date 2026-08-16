package store

import (
	"context"
	"errors"
	"time"
)

var ErrInUse = errors.New("permission set in use")

type Role string

const (
	RoleOwner  Role = "owner"
	RoleMember Role = "member"
)

type User struct {
	ID                 string
	Username           string
	DisplayName        string
	Role               Role
	PasswordHash       string
	MustChangePassword bool
	Enabled            bool
	PermissionSetID    string
	Namespaces         []string
	CreatedAt          time.Time
	UpdatedAt          time.Time
	CreatedBy          string
}

type PermissionSet struct {
	ID              string
	Name            string
	Description     string
	BuiltinTemplate string // viewer|operator|admin|empty for custom
	Grants          map[string][]string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Session struct {
	ID            string
	UserID        string
	Username      string
	CreatedAt     time.Time
	LastSeenAt    time.Time
	ExpiresAt     time.Time
	IdleExpiresAt time.Time
	IP            string
	UserAgent     string
}

type Store interface {
	Owner(ctx context.Context) (*User, error) // nil, nil if none
	CreateOwner(ctx context.Context, u User) error
	CreateMember(ctx context.Context, u User) error
	ListMembers(ctx context.Context) ([]User, error)
	UpdateMember(ctx context.Context, u User) error
	DeleteMember(ctx context.Context, id string) error
	ResetMemberPassword(ctx context.Context, userID, hash string) error
	UpdateOwnerPassword(ctx context.Context, userID, hash string) error
	UpdatePassword(ctx context.Context, userID, hash string) error
	UserByUsername(ctx context.Context, username string) (*User, error)
	UserByID(ctx context.Context, id string) (*User, error)
	CreateSession(ctx context.Context, s Session) error
	Session(ctx context.Context, id string) (*Session, error)
	TouchSession(ctx context.Context, id string, lastSeen, idleExpires time.Time) error
	DeleteSession(ctx context.Context, id string) error
	DeleteSessionsForUser(ctx context.Context, userID string) error
	Ping(ctx context.Context) error
	CreatePermissionSet(ctx context.Context, ps PermissionSet) error
	UpdatePermissionSet(ctx context.Context, ps PermissionSet) error
	DeletePermissionSet(ctx context.Context, id string) error
	PermissionSet(ctx context.Context, id string) (*PermissionSet, error)
	ListPermissionSets(ctx context.Context) ([]PermissionSet, error)
	MembersByPermissionSetID(ctx context.Context, permissionSetID string) ([]User, error)
}
