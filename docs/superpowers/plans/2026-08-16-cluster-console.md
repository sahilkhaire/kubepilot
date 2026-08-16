# Cluster Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Cluster Console, an in-cluster Go + React Kubernetes dashboard with owner/member auth, permission sets, MongoDB audit, and Lens-parity cluster operations, shipped as a generic public image.

**Architecture:** One container: Go serves `/api/*` plus the React SPA. The browser never talks to kube-apiserver. Go checks session + permission set + namespaces, then calls Kubernetes, then writes audit. Owner password is always `OWNER_PASSWORD` at process start. Members never see `POD_NAMESPACE`.

**Tech Stack:** Go 1.24, stdlib `net/http`, official MongoDB Go driver, `golang.org/x/crypto/argon2`, `client-go`, Helm Go SDK, React 19 + TypeScript + Vite, Helm chart for install.

**Spec:** [docs/PRODUCT.md](../../PRODUCT.md), [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/AUTH-AND-PERMISSIONS.md](../../AUTH-AND-PERMISSIONS.md), [docs/AUDIT.md](../../AUDIT.md), [docs/DEPLOYMENT.md](../../DEPLOYMENT.md), [docs/ROADMAP.md](../../ROADMAP.md).

## How to follow this plan

1. Finish **one phase** and hit its **Done when** before starting the next.
2. Finish **one task** (all checkboxes, tests green, commit) before the next task.
3. Do not skip tests. Do not bake hostnames, Mongo URIs, or passwords into the image.
4. Port-forward is **out of scope**. Do not add it.

## Global Constraints

- Go module path: `github.com/zixflow/k8s` (change only if the git remote differs).
- Go 1.24, `go test ./...` and `go test -race ./...` must pass.
- Image is generic: zero install-specific values compiled in. Config is env only: `MONGODB_URI`, `SESSION_SECRET`, `OWNER_USERNAME`, `OWNER_PASSWORD`, `POD_NAMESPACE`, `LISTEN_ADDR`, `TRUST_PROXY`.
- Cookie name: `cluster_console_session`. HttpOnly, Secure, SameSite=Lax. Idle 8h, absolute 24h.
- Owner cannot `POST /api/auth/password`. Owner password syncs from env on every process start; if the hash changes, delete owner sessions.
- Members never see or mutate `POD_NAMESPACE` (403, audited), including when namespaces is `["*"]`.
- 403 for forbidden (not 404). 401 unauthenticated.
- Passwords: Argon2id. Never log or audit secret values or passwords.
- YAML apply: server-side apply, field manager `cluster-console`.
- Tests: table-driven with named subtests; integration tests use `//go:build integration`; unit tests use a fake store, not live Mongo.
- No `cluster-console` string as a required install namespace; detect via `POD_NAMESPACE`.

---

## File map (create as tasks require)

```
cmd/cluster-console/main.go
internal/config/config.go
internal/password/password.go
internal/store/store.go
internal/store/memory.go
internal/store/mongo.go
internal/bootstrap/bootstrap.go
internal/auth/auth.go
internal/auth/http.go
internal/rbac/rbac.go
internal/audit/audit.go
internal/httpapi/httpapi.go
internal/httpapi/middleware.go
internal/kube/kube.go
internal/kube/resources.go
internal/streams/logs.go
internal/streams/exec.go
internal/streams/metrics.go
internal/helmctrl/helmctrl.go
web/                          # Vite React SPA
deploy/charts/cluster-console/  # Helm chart
Dockerfile
.dockerignore
Makefile
go.mod
```

---

## Phase 1 — App shell, login, bootstrap

**Done when:** `go test ./...` passes; `OWNER_PASSWORD=secret` process allows `POST /api/auth/login` as `owner`; restarting with a new `OWNER_PASSWORD` rejects the old password; Helm chart templates contain no baked Mongo URI or password; Dockerfile copies only the binary and SPA.

### Task 1: Health endpoints

**Files:**
- Create: `go.mod`
- Create: `cmd/cluster-console/main.go`
- Create: `internal/httpapi/httpapi.go`
- Test: `internal/httpapi/httpapi_test.go`

**Interfaces:**
- Consumes: nothing
- Produces: `httpapi.New(deps Deps) http.Handler` where `Deps` starts with `Ready func(context.Context) error` (nil means ready). Routes: `GET /healthz` always 200 `ok\n`; `GET /readyz` 200 if `Ready` returns nil, else 503.

- [ ] **Step 1: Write the failing test**

```go
package httpapi_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zixflow/k8s/internal/httpapi"
)

func TestHealthzOK(t *testing.T) {
	t.Parallel()
	h := httpapi.New(httpapi.Deps{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if string(body) != "ok\n" {
		t.Fatalf("body=%q", body)
	}
}

func TestReadyz(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		err  error
		code int
	}{
		{name: "ready", err: nil, code: 200},
		{name: "not_ready", err: errNotReady{}, code: 503},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := httpapi.New(httpapi.Deps{Ready: func(context.Context) error { return tc.err }})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
			if rec.Code != tc.code {
				t.Fatalf("code=%d want %d", rec.Code, tc.code)
			}
		})
	}
}

type errNotReady struct{}

func (errNotReady) Error() string { return "mongo down" }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/httpapi/ -v`
Expected: FAIL (package or `New` undefined)

- [ ] **Step 3: Write minimal implementation**

`go.mod`:

```
module github.com/zixflow/k8s

go 1.24
```

`internal/httpapi/httpapi.go`: `New` returns `http.NewServeMux()` with `/healthz` and `/readyz`. If `Ready` is nil, treat as ready. `cmd/cluster-console/main.go` listens on `:8080` and uses `httpapi.New` with `Ready` returning `fmt.Errorf("not configured")` until later tasks.

- [ ] **Step 4: Run tests**

Run: `go test ./internal/httpapi/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go.mod cmd/cluster-console/main.go internal/httpapi/httpapi.go internal/httpapi/httpapi_test.go
git commit -m "feat: add healthz and readyz endpoints"
```

### Task 2: Config from environment

**Files:**
- Create: `internal/config/config.go`
- Test: `internal/config/config_test.go`
- Modify: `cmd/cluster-console/main.go` to load config at start

**Interfaces:**
- Consumes: process environment
- Produces:

```go
package config

type Config struct {
	ListenAddr     string // default ":8080"
	MongoURI       string
	SessionSecret  string
	OwnerUsername  string // default "owner"
	OwnerPassword  string
	PodNamespace   string
	TrustProxy     bool // default true; "false" disables
}

func Load() (Config, error) // error if MongoURI, SessionSecret, OwnerPassword, or PodNamespace empty
```

- [ ] **Step 1: Write the failing test**

```go
package config_test

func TestLoadRequiresSecrets(t *testing.T) {
	t.Run("missing_owner_password", func(t *testing.T) {
		t.Setenv("MONGODB_URI", "mongodb://localhost:27017/cluster_console")
		t.Setenv("SESSION_SECRET", "x")
		t.Setenv("OWNER_PASSWORD", "")
		t.Setenv("POD_NAMESPACE", "ns")
		_, err := config.Load()
		if err == nil {
			t.Fatal("expected error")
		}
	})
	t.Run("defaults", func(t *testing.T) {
		t.Setenv("MONGODB_URI", "mongodb://localhost:27017/cluster_console")
		t.Setenv("SESSION_SECRET", "x")
		t.Setenv("OWNER_PASSWORD", "p")
		t.Setenv("POD_NAMESPACE", "console")
		t.Setenv("LISTEN_ADDR", "")
		t.Setenv("OWNER_USERNAME", "")
		c, err := config.Load()
		if err != nil {
			t.Fatal(err)
		}
		if c.ListenAddr != ":8080" || c.OwnerUsername != "owner" || !c.TrustProxy {
			t.Fatalf("%+v", c)
		}
	})
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config/ -v`
Expected: FAIL

- [ ] **Step 3: Implement `Load` from env only.** Never read files for secrets. `TRUST_PROXY` parses as false only when value is `false` (case-insensitive).

- [ ] **Step 4: Run tests**

Run: `go test ./internal/config/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/config/
git commit -m "feat: load runtime config from environment"
```

### Task 3: Argon2id password hashing

**Files:**
- Create: `internal/password/password.go`
- Test: `internal/password/password_test.go`

**Interfaces:**
- Consumes: nothing
- Produces:

```go
package password

func Hash(plain string) (string, error)  // PHC-style encoded argon2id
func Verify(plain, encoded string) bool
```

- [ ] **Step 1: Write the failing test**

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/password/ -v`
Expected: FAIL

- [ ] **Step 3: Implement with `golang.org/x/crypto/argon2`.** Time=1, Memory=64*1024, Threads=4, KeyLen=32, random 16-byte salt. Encode `argon2id$v=19$m=65536,t=1,p=4$<b64salt>$<b64key>`.

- [ ] **Step 4: Run tests**

Run: `go test ./internal/password/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/password/ go.mod go.sum
git commit -m "feat: argon2id password hashing"
```

### Task 4: Store interface and memory implementation

**Files:**
- Create: `internal/store/store.go`
- Create: `internal/store/memory.go`
- Test: `internal/store/memory_test.go`

**Interfaces:**
- Consumes: `password` package only in callers, not in store
- Produces:

```go
package store

type Role string

const (
	RoleOwner  Role = "owner"
	RoleMember Role = "member"
)

type User struct {
	ID                  string
	Username            string
	DisplayName         string
	Role                Role
	PasswordHash        string
	MustChangePassword  bool
	Enabled             bool
	PermissionSetID     string
	Namespaces          []string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	CreatedBy           string
}

type Session struct {
	ID             string
	UserID         string
	Username       string
	CreatedAt      time.Time
	LastSeenAt     time.Time
	ExpiresAt      time.Time
	IdleExpiresAt  time.Time
	IP             string
	UserAgent      string
}

type Store interface {
	Owner(ctx context.Context) (*User, error) // nil, nil if none
	CreateOwner(ctx context.Context, u User) error
	UpdateOwnerPassword(ctx context.Context, userID, hash string) error
	UserByUsername(ctx context.Context, username string) (*User, error)
	UserByID(ctx context.Context, id string) (*User, error)
	CreateSession(ctx context.Context, s Session) error
	Session(ctx context.Context, id string) (*Session, error)
	TouchSession(ctx context.Context, id string, lastSeen, idleExpires time.Time) error
	DeleteSession(ctx context.Context, id string) error
	DeleteSessionsForUser(ctx context.Context, userID string) error
	Ping(ctx context.Context) error
}

func NewMemory() Store
```

Usernames stored lowercase. `UserByUsername` returns `(nil, nil)` if missing (not an error).

- [ ] **Step 1: Write failing tests** for create owner, get by username case-insensitive, missing user, session create/get/delete, delete all sessions for user.

- [ ] **Step 2: Run `go test ./internal/store/ -v`** — FAIL

- [ ] **Step 3: Implement `NewMemory` with mutex maps.** `Ping` returns nil.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat: add in-memory store for users and sessions`

### Task 5: Owner bootstrap on every start

**Files:**
- Create: `internal/bootstrap/bootstrap.go`
- Test: `internal/bootstrap/bootstrap_test.go`

**Interfaces:**
- Consumes: `store.Store`, `password.Hash`, `config.Config` fields OwnerUsername, OwnerPassword
- Produces:

```go
package bootstrap

func SyncOwner(ctx context.Context, st store.Store, ownerUsername, ownerPassword string) error
```

Behavior: if no owner, create with RoleOwner, Enabled true, MustChangePassword false, DisplayName "Owner", username lowercase. If owner exists, `password.Verify(ownerPassword, hash)` — if false, Hash new password, UpdateOwnerPassword, DeleteSessionsForUser.

- [ ] **Step 1: Write failing tests**

```go
func TestSyncOwnerCreatesThenUpdatesPassword(t *testing.T) {
	ctx := context.Background()
	st := store.NewMemory()
	if err := bootstrap.SyncOwner(ctx, st, "Owner", "first"); err != nil {
		t.Fatal(err)
	}
	u, err := st.Owner(ctx)
	if err != nil || u == nil || u.Username != "owner" {
		t.Fatalf("%v %+v", err, u)
	}
	if !password.Verify("first", u.PasswordHash) {
		t.Fatal("hash")
	}
	sid := "s1"
	_ = st.CreateSession(ctx, store.Session{ID: sid, UserID: u.ID})
	if err := bootstrap.SyncOwner(ctx, st, "ignored", "second"); err != nil {
		t.Fatal(err)
	}
	u2, _ := st.Owner(ctx)
	if u2.Username != "owner" {
		t.Fatal("username must not change")
	}
	if !password.Verify("second", u2.PasswordHash) {
		t.Fatal("new password")
	}
	s, _ := st.Session(ctx, sid)
	if s != nil {
		t.Fatal("owner sessions must be cleared")
	}
}
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement `SyncOwner`.** Empty `ownerPassword` returns error.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat: sync owner password from env on startup`

### Task 6: Auth service (login, session cookie, me, logout)

**Files:**
- Create: `internal/auth/auth.go`
- Test: `internal/auth/auth_test.go`

**Interfaces:**
- Consumes: `store.Store`, `password.Verify`, idle 8h, max 24h
- Produces:

```go
package auth

const CookieName = "cluster_console_session"

type Service struct { /* store, sessionSecret, now func */ }

func New(st store.Store, sessionSecret string) *Service

func (s *Service) Login(ctx context.Context, username, password, ip, ua string) (sessionID string, u store.User, err error)
func (s *Service) Logout(ctx context.Context, sessionID string) error
func (s *Service) Authenticate(ctx context.Context, sessionID string) (*store.User, *store.Session, error)
func (s *Service) SignCookie(sessionID string) string   // sessionID + HMAC-SHA256 hex
func (s *Service) ParseCookie(value string) (sessionID string, ok bool)
```

`Login` errors: generic `ErrInvalidCredentials` for missing user, bad password, disabled user (callers map to 401). Username lowercased. Session ID: 32 random bytes hex. `Authenticate` returns error if session missing, expired (`ExpiresAt` or `IdleExpiresAt` before now), or user disabled; on success TouchSession.

- [ ] **Step 1: Write failing tests:** good login; wrong password; disabled user; cookie round-trip; expired session rejected; ParseCookie rejects tampered HMAC.

- [ ] **Step 2: Run `go test ./internal/auth/ -v` — FAIL**

- [ ] **Step 3: Implement.** Cookie payload `sessionID + "." + hex(hmac-sha256(sessionSecret, sessionID))`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat: session login and signed cookie`

### Task 7: Auth HTTP routes

**Files:**
- Modify: `internal/httpapi/httpapi.go`
- Create: `internal/httpapi/auth.go`
- Test: `internal/httpapi/auth_test.go`

**Interfaces:**
- Consumes: `auth.Service`
- Produces: routes

```
POST /api/auth/login     JSON {username, password} → Set-Cookie, JSON {username, role, mustChangePassword}
POST /api/auth/logout    clears cookie, 204
GET  /api/auth/me        JSON user public fields or 401
POST /api/auth/password  JSON {currentPassword, newPassword} — members only; owner → 403
```

Cookie flags: HttpOnly, Secure, SameSite=Lax, Path=/, Name=`cluster_console_session`.

Login failure: 401 `{"error":"invalid credentials"}` (same body for all failures).

- [ ] **Step 1: Write httptest cases** with `store.NewMemory` + `bootstrap.SyncOwner` + `auth.New`: login owner; me; logout; login bad password; `POST /api/auth/password` as owner returns 403.

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Wire mux.** JSON helper that never includes `passwordHash`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat: HTTP login logout me and block owner password change`

### Task 8: Process wiring and SPA placeholder

**Files:**
- Modify: `cmd/cluster-console/main.go`
- Create: `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`
- Create: `internal/httpapi/spa.go` (dev: optional `WEB_DIST`; prod: embed)

**Interfaces:**
- Consumes: config, memory or mongo (mongo in Task 9), bootstrap, auth, httpapi
- Produces: `GET /` login form (username, password) that `POST /api/auth/login` then shows username/role. Logout button.

Vite `base: '/'`. Dev: `vite` proxy `/api` and `/healthz` to `:8080`. Production: `go:embed` of `web/dist` **only after** `npm run build`; until then serve a minimal login HTML string from Go so tests do not need Node. Prefer: `internal/httpapi` serves embedded FS if present, else a built-in login HTML.

- [ ] **Step 1: Add `TestLoginPageServed` that GET `/` returns 200 and contains a password input.**

- [ ] **Step 2: FAIL then implement stub HTML + React app that matches the same form fields `username` / `password`.**

- [ ] **Step 3: `npx --yes create-vite@6 web -- --template react-ts` is allowed only if you then delete demo CSS/assets and add the login screen. Do not commit `node_modules`.**

- [ ] **Step 4: Run `go test ./...` PASS. `npm --prefix web run build` succeeds.**

- [ ] **Step 5: Commit** `feat: login UI and process wiring`

### Task 9: Mongo store

**Files:**
- Create: `internal/store/mongo.go`
- Test: `internal/store/mongo_test.go` with `//go:build integration`

**Interfaces:**
- Consumes: `MONGODB_URI`
- Produces: `func OpenMongo(ctx context.Context, uri string) (Store, error)`

Database: URI path, or `cluster_console` if path empty. Collections `users`, `sessions`. Unique index `users.username`. `Ping` pings the client.

- [ ] **Step 1: Write integration test** skipped unless `MONGODB_URI` is set: OpenMongo, Ping, SyncOwner via bootstrap, UserByUsername.

- [ ] **Step 2: Implement using official `go.mongodb.org/mongo-driver/v2` (or v1 if v2 not available). Map `_id` as hex ObjectID string.**

- [ ] **Step 3: `main.go` uses OpenMongo; Ready = store.Ping after SyncOwner.** If kube config is not required until Phase 3, Ready does **not** wait on Kubernetes in Phase 1.

- [ ] **Step 4: Unit tests still use memory. `go test ./...` PASS. `go test -tags=integration ./internal/store/` PASS when Mongo is up.**

- [ ] **Step 5: Commit** `feat: MongoDB store for users and sessions`

### Task 10: Generic Dockerfile and Helm chart

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `Makefile`
- Create: `deploy/charts/cluster-console/Chart.yaml`
- Create: `deploy/charts/cluster-console/values.yaml`
- Create: `deploy/charts/cluster-console/templates/deployment.yaml`
- Create: `deploy/charts/cluster-console/templates/service.yaml`
- Create: `deploy/charts/cluster-console/templates/secret.yaml`
- Create: `deploy/charts/cluster-console/templates/ingress.yaml`
- Create: `deploy/charts/cluster-console/templates/serviceaccount.yaml`
- Create: `deploy/charts/cluster-console/templates/clusterrolebinding.yaml`
- Create: `deploy/charts/cluster-console/templates/_helpers.tpl`
- Create: `deploy/charts/cluster-console/templates/NOTES.txt`

**Interfaces:**
- Image: multi-stage Node build `web` → Go build → distroless or `gcr.io/distroless/static-debian12`. No `ENV MONGODB_URI=...` in Dockerfile.
- Chart `values.yaml`: `image.repository: ""`, `image.tag: ""`, `ingress.host: ""`, empty secret strings. Deployment envFrom secret; `POD_NAMESPACE` from `fieldRef: metadata.namespace`.

- [ ] **Step 1: Write `deploy/charts/cluster-console/templates/deployment.yaml` so a `helm template` test can grep.** Add script or test file `deploy/charts/cluster-console/tests/no-secrets.txtar` is optional; instead add `Makefile` target `chart-check`:

```makefile
chart-check:
	@helm template test deploy/charts/cluster-console \
	  --set image.repository=example/cluster-console --set image.tag=dev \
	  --set ingress.host=console.example.internal \
	  --set mongodbUri=mongodb://mongo:27017/cluster_console \
	  --set sessionSecret=testsecret --set ownerPassword=testpass \
	  | grep -q 'name: POD_NAMESPACE'
	@helm template test deploy/charts/cluster-console \
	  --set image.repository=example/cluster-console --set image.tag=dev \
	  --set ingress.host=console.example.internal \
	  --set mongodbUri=mongodb://mongo:27017/cluster_console \
	  --set sessionSecret=testsecret --set ownerPassword=testpass \
	  | grep -vE 'mongodb://mongo|testpass|testsecret' >/dev/null
```

The second grep is wrong if secrets are supposed to appear in the rendered Secret. Change the check to: **Dockerfile and Go sources** contain no `mongodb+srv`, no `OWNER_PASSWORD=`, no real hostnames.

```makefile
no-bake:
	@! grep -R --include='*.go' --include='Dockerfile' -E 'mongodb(\+srv)?:\/\/|OWNER_PASSWORD=' . | grep -v '_test.go' | grep -v 'os.Getenv' | grep .
```

- [ ] **Step 2: Implement Dockerfile:**

```dockerfile
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o /cluster-console ./cmd/cluster-console

FROM gcr.io/distroless/static-debian12
COPY --from=build /cluster-console /cluster-console
USER nonroot:nonroot
ENTRYPOINT ["/cluster-console"]
```

- [ ] **Step 3: Helm templates per [docs/DEPLOYMENT.md](../../DEPLOYMENT.md):** ClusterRoleBinding to `cluster-admin`, Secret keys `MONGODB_URI` `SESSION_SECRET` `OWNER_USERNAME` `OWNER_PASSWORD`, probes `/healthz` `/readyz`.

- [ ] **Step 4: Run `make no-bake` and `helm template` with required `--set`. Manual: docker build with build-args none for secrets.**

- [ ] **Step 5: Commit** `feat: generic image and helm chart`

**Phase 1 gate:** local run:

```bash
export MONGODB_URI=mongodb://127.0.0.1:27017/cluster_console
export SESSION_SECRET=devsecret
export OWNER_PASSWORD=devpass
export POD_NAMESPACE=cluster-console
go run ./cmd/cluster-console
# POST login as owner / devpass
```

---

## Phase 2 — Members, permission sets, audit, install-namespace hide

**Done when:** Viewer member cannot call `/api/settings/*` (403, audited). Member with `namespaces: ["*"]` still cannot list `POD_NAMESPACE`.

### Task 11: RBAC Allow

**Files:** Create `internal/rbac/rbac.go`, `internal/rbac/modules.go`, test `internal/rbac/rbac_test.go`

**Produces:**

```go
package rbac

type Request struct {
	User            store.User
	InstallNS       string
	PermissionSet   *PermissionSet // nil for owner
	Module          string
	Action          string
	Namespace       string // empty if cluster-scoped
	ClusterScoped   bool
}

type PermissionSet struct {
	ID          string
	Name        string
	Description string
	Grants      map[string][]string
}

func Allow(req Request) bool
```

Rules from [AUTH-AND-PERMISSIONS.md](../../AUTH-AND-PERMISSIONS.md): owner true except do not special-case password here. Member: false if !Enabled; false if install NS and !ClusterScoped; false if namespaced and not in list and list is not `*`; false if module missing or action not in grants; `view` required for any other action.

- [ ] Tests: owner allow pods delete in install NS; member `*` deny install NS; member `["dev"]` allow pods.view dev; deny prod; deny nodes without grant; deny scale without view.
- [ ] Commit `feat: rbac allow function`

### Task 12: Permission set store and templates

**Files:** Extend `internal/store/store.go` with PermissionSet CRUD. Create `internal/rbac/templates.go` returning Viewer, Operator, Admin clones as data (not stored until owner clones). HTTP ` /api/settings/permission-sets` owner-only.

**Produces:** store methods `CreatePermissionSet`, `UpdatePermissionSet`, `DeletePermissionSet`, `PermissionSet`, `ListPermissionSets`. Delete fails with `ErrInUse` if any member has that ID.

- [ ] Tests: template Viewer has `pods: ["view"]` and not `reveal`; Admin has `exec`; delete in-use fails.
- [ ] Commit `feat: permission sets and builtin templates`

### Task 13: Members HTTP

**Files:** `internal/httpapi/members.go`, `internal/password/generate.go`

**Produces:**

```go
func Generate(n int) string // n=24, alphabet unreserved alphanumeric plus - _ without O0Il1
```

Routes (owner only): `GET/POST /api/settings/members`, `PATCH /api/settings/members/{id}`, `DELETE ...`, `POST .../{id}/reset-password`. Create returns `{user, password}` once. Reject namespace list containing `InstallNS`. Reject empty namespaces. Username regex `[a-z0-9][a-z0-9._-]{1,31}`.

- [ ] Tests: create member; password not in GET; reset returns new password and deletes sessions; cannot grant install NS.
- [ ] Commit `feat: member invite reset disable delete`

### Task 14: mustChangePassword gate and member password change

**Files:** `internal/httpapi/middleware.go`

Members with `MustChangePassword`: only `GET /api/auth/me`, `POST /api/auth/password`, `POST /api/auth/logout`. Owner 403 on password change (already Task 7).

- [ ] Tests: member login then GET `/api/settings/members` 403 until password changed (also 403 because not owner — use a dummy `/api/k8s/pods` 401/403 later; for now block `/api/auth/me` is allowed and a test-only `/api/debug/ping` is **not** added. Use `GET /readyz` which stays public. Add `GET /api/auth/session-check` is unnecessary. Test via `POST /api/auth/password` success then `mustChangePassword` false on me.
- [ ] Commit `feat: force member password change on first login`

### Task 15: Audit writer and owner audit API

**Files:** `internal/audit/audit.go`, store `audit_logs`, `internal/httpapi/audit.go`

**Produces:**

```go
type Event struct {
	Timestamp  time.Time
	UserID     string
	Username   string
	Role       string
	IP         string
	UserAgent  string
	SessionID  string
	Module     string
	Action     string
	Result     string // success|denied|error
	HTTPStatus int
	APIVersion string
	Kind       string
	Namespace  string
	Name       string
	Path       string
	Method     string
	Details    map[string]any
	Error      string
}

func (a *Auditor) Write(ctx context.Context, e Event) error
```

Login, login_failed, logout, owner_password_sync (from bootstrap when hash changes), all settings mutations, all 403s. No passwords in Details. Owner `GET /api/settings/audit` filter query params; `DELETE` selected ids; `DELETE` with filter + confirm header `X-Confirm: delete`.

- [ ] Tests: failed login writes login_failed without password; 403 writes denied; redaction unit test strips keys named password.
- [ ] Commit `feat: audit log write query and delete`

### Task 16: `/api/auth/me` grants + namespace filter helper

**Files:** `internal/rbac/namespaces.go`

**Produces:**

```go
func VisibleNamespaces(user store.User, installNS string, clusterNamespaces []string) []string
```

Owner: all `clusterNamespaces`. Member `*`: all except installNS. Member list: intersection minus installNS.

- [ ] Tests as table.
- [ ] Commit `feat: visible namespace list excluding install namespace`

### Task 17: Owner settings UI (members, sets, audit)

**Files:** `web/src/pages/Login.tsx`, `web/src/pages/SettingsMembers.tsx`, `web/src/pages/SettingsSets.tsx`, `web/src/pages/SettingsAudit.tsx`, `web/src/App.tsx` router.

Owner after login: simple nav Settings. Members: no Settings link; hitting `/settings` redirects home.

- [ ] Manual: create Viewer set, invite user, log in as member, confirm no settings. Commit `feat: owner settings UI for members sets audit`

**Phase 2 gate:** member 403 on `/api/settings/members` is audited.

---

## Phase 3 — Workloads read + logs

**Done when:** Operator in `["dev"]` sees only `dev` pods and can stream logs; `prod` is 403.

### Task 18: Kubernetes client wrapper

**Files:** `internal/kube/kube.go`

**Produces:**

```go
package kube

func InCluster() (*kubernetes.Clientset, error)
func ForTest(c kubernetes.Interface) *Client

type Client struct { Inner kubernetes.Interface }

func (c *Client) Pods(ctx context.Context, ns string) ([]corev1.Pod, error)
```

Phase 3 tests use `k8s.io/client-go/kubernetes/fake`.

- [ ] Commit `feat: kubernetes client wrapper`

### Task 19: Authz middleware for kube routes

**Files:** `internal/httpapi/middleware.go`, `internal/httpapi/k8s.go`

Pattern: `GET /api/k8s/namespaces/{ns}/pods` → Allow Module=`pods` Action=`view` Namespace=ns ClusterScoped=false.

- [ ] Tests with fake kube + memory store: member denied prod; allowed dev empty list 200.
- [ ] Commit `feat: authorized pod list`

### Task 20: Workload list/detail

Register in `internal/kube/resources.go` modules: `pods`, `deployments`, `statefulsets`, `daemonsets`, `replicasets`, `jobs`, `cronjobs`. Each: list + get JSON (standard k8s object, no secret data).

Routes:

```
GET /api/k8s/namespaces/{ns}/{resource}
GET /api/k8s/namespaces/{ns}/{resource}/{name}
GET /api/k8s/workloads/overview?namespace=
GET /api/k8s/cluster/overview
```

Overview aggregates only modules the user can view. Events: include `status.conditions` and `GET .../{name}/events`.

- [ ] Tests: fake client with a pod in dev and prod; member `["dev"]` list prod 403.
- [ ] Commit `feat: workload list and detail`

### Task 21: Namespace switcher and search

`GET /api/k8s/namespaces` — owner all; member VisibleNamespaces (needs list from kube then filter). Search: `GET /api/k8s/search?q=&namespace=` only allowed types.

- [ ] Tests: install NS absent for member.
- [ ] Commit `feat: namespace switcher and search`

### Task 22: Pod logs stream

**Files:** `internal/streams/logs.go`

`GET /api/streams/logs?namespace=&pod=&container=&follow=1&tail=200&previous=0` — Upgrade optional: first version can be HTTP chunked stream. Require `logs` on `pods`. Audit start/stop. Never put log lines in audit.

- [ ] Test: Allow deny without `logs`; fake REST is hard — unit-test the Allow check with a stub `LogStreamer` interface:

```go
type LogStreamer interface {
	Stream(ctx context.Context, ns, pod, container string, opts LogOpts) (io.ReadCloser, error)
}
```

- [ ] Commit `feat: pod log stream`
- [ ] UI: `web/src/pages/Workloads.tsx`, `PodLogs.tsx`, Lens-like sidebar.

**Phase 3 gate:** logs work for granted ns only.

---

## Phase 4 — Mutations and YAML

**Done when:** granted restart works and is audited; missing `delete` cannot delete.

### Task 23: Delete, scale, restart, rollback, trigger

POST actions:

```
POST /api/k8s/namespaces/{ns}/pods/{name}/delete
POST /api/k8s/namespaces/{ns}/deployments/{name}/scale     {"replicas":n}
POST /api/k8s/namespaces/{ns}/deployments/{name}/restart
POST /api/k8s/namespaces/{ns}/deployments/{name}/rollback  {"revision":n}
POST /api/k8s/namespaces/{ns}/cronjobs/{name}/trigger
```

Same for statefulsets/daemonsets/replicasets scale/restart as in the auth matrix. Typed confirm: JSON `{"confirm":"<name>"}` required for delete.

- [ ] Tests: fake client reactor; 403 without action; audit success.
- [ ] Commit `feat: workload mutations`

### Task 24: YAML get and server-side apply

```
GET  /api/k8s/yaml?gvk=&namespace=&name=     requires view (not yaml_edit)
POST /api/k8s/yaml/apply                     requires yaml_edit on that module
```

Apply uses `metav1.ApplyOptions{FieldManager: "cluster-console", Force: false}`. Wrong module in YAML vs URL → 403.

- [ ] Tests: apply Deployment without `deployments.yaml_edit` 403; with grant, fake apply called.
- [ ] Commit `feat: yaml view and server-side apply`
- [ ] UI: confirm dialog, YAML editor (Monaco or textarea in v1 — textarea is enough).

---

## Phase 5 — Config, network, storage

**Done when:** secret values never appear without `reveal`; reveal is audited.

### Task 25: Resource modules batch

Add modules from [AUTH-AND-PERMISSIONS.md](../../AUTH-AND-PERMISSIONS.md) Config + Network + Storage tables. Same list/get/delete/apply routes as Task 20/23/24.

Secrets: list/get **strip** `data` and `stringData` unless action `reveal` query `?reveal=1` and Allow `secrets`/`reveal`. Audit `reveal`.

Endpoints: view + yaml_edit only.

- [ ] Tests: secret get without reveal has no data keys; with reveal audited.
- [ ] Commit `feat: config network storage resources`
- [ ] UI pages per group.

---

## Phase 6 — Nodes, events, access control, namespaces

**Done when:** member without `nodes` sees no Nodes in sidebar or API.

### Task 26: Cluster-scoped routes

```
GET /api/k8s/nodes
GET /api/k8s/nodes/{name}
POST /api/k8s/nodes/{name}/cordon
POST /api/k8s/nodes/{name}/drain
POST /api/k8s/nodes/{name}/uncordon   // Allow action cordon
GET /api/k8s/events
GET /api/k8s/namespaces                 // already exists; add create/edit/delete
```

Access control: serviceaccounts, roles, rolebindings, clusterroles, clusterrolebindings.

Member `namespaces.delete` cannot delete `POD_NAMESPACE`.

- [ ] Tests: no nodes module → GET /api/k8s/nodes 403; drain requires drain action.
- [ ] Commit `feat: nodes events namespaces and k8s rbac objects`
- [ ] UI: Nodes, Events, Access Control.

---

## Phase 7 — Exec and metrics

**Done when:** `exec` denied is audited and terminal does not open; metrics hide if unavailable.

### Task 27: Pod exec

**Files:** `internal/streams/exec.go`

WebSocket `/api/streams/exec?namespace=&pod=&container=` → SPDY/WebSocket exec. Require `exec`. Audit start/stop, not transcript. Cookie auth on upgrade.

- [ ] Unit test: Allow false → 403 no hijack.
- [ ] Commit `feat: pod exec websocket`
- [ ] UI: xterm.js

### Task 28: Metrics

**Files:** `internal/streams/metrics.go`

`metricsSource=auto`: prometheusURL if set; else try Services `prometheus`, `prometheus-operated`, `kube-prometheus-stack-prometheus` in `monitoring`, `observability`, `prometheus`; else metrics-server `metrics.k8s.io`. Hide charts on failure. Require `metrics.view`.

- [ ] Tests: fake discovery; no source → 200 `{available:false}`.
- [ ] Commit `feat: cpu memory metrics`
- [ ] UI: charts on overview, node, pod.

---

## Phase 8 — CRDs and Helm

**Done when:** Helm uninstall in an ungranted namespace is 403.

### Task 29: CRDs and CR instances

Dynamic client. `crds` cluster-scoped. `custom_resources` uses namespace list for namespaced CRs. Single module for all CRs (product decision).

- [ ] Tests: namespaced CR in other ns 403.
- [ ] Commit `feat: custom resources`

### Task 30: Helm

**Files:** `internal/helmctrl/helmctrl.go`

List/install/upgrade/rollback/uninstall via Helm SDK. Namespace filtered. Owner `settings.app` stores `helmRepositories`. No default public repos.

- [ ] Tests: uninstall denied ns 403 (mock Helm interface).
- [ ] Commit `feat: helm releases`
- [ ] UI: Helm page + owner repo settings.

---

## Phase 9 — Polish

### Task 31: Replica affinity, PDB, UX, tests

- Helm: `sessionAffinity: ClientIP`, optional PDB.
- Empty states, delete confirm copy.
- `go test -race ./...`
- Document install in README at repo root (generic image, required values).
- Do not add port-forward.
- Optional follow-up (not required): replace `cluster-admin` with a custom ClusterRole.

- [ ] Commit `chore: polish probes pdb and ux`

**Product complete when** [docs/PRODUCT.md](../../PRODUCT.md) success criteria hold.

---

## Spec coverage

| Spec requirement | Tasks |
| --- | --- |
| Health, generic image, Helm, env config | 1, 2, 10 |
| Owner password every boot, no UI change | 5, 7 |
| Login session cookie | 6, 7, 8 |
| Members, sets, templates, invite once | 12, 13, 17 |
| Force member password change | 14 |
| RBAC module+action+ns, hide install NS | 11, 16 |
| Audit + owner delete | 15 |
| Workloads read, logs, search | 18–22 |
| Mutations, YAML SSA | 23–24 |
| Config/network/storage, secret reveal | 25 |
| Nodes, events, K8s RBAC, namespaces | 26 |
| Exec, metrics | 27–28 |
| CRDs, Helm | 29–30 |
| No port-forward | constraint + Task 31 |

## Out of this plan

Multi-cluster, email invites, in-app IP allowlist, port-forward, ownership transfer, Lens extensions.
