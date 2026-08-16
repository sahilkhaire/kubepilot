# KubePilot — architecture

## Summary

One Deployment, one container. Go serves the React SPA and all APIs. The pod uses an in-cluster ServiceAccount with `cluster-admin`. The browser never talks to the Kubernetes API. MongoDB stores app state (users, permission sets, sessions, settings, audit). Kubernetes remains the source of truth for cluster objects.

```
Browser
  → Cloudflare Access
    → Ingress (TLS)
      → Service
        → Go (SPA + /api + streams)
             → MongoDB (MONGODB_URI)
             → Kubernetes API (in-cluster config)
```

## Components

### React SPA (TypeScript)

**Does:** login screen, Lens-style sidebar, resource lists/details, YAML editor, log viewer, xterm exec, charts, owner settings.

**Uses:** HTTPS JSON to `/api/*`, WebSocket (or HTTP/2 stream) to `/api/streams/*` for logs, exec, live metrics.

**Depends on:** Go API. It never holds a kubeconfig or a Kubernetes token.

**Rule:** the UI hides modules and actions the current user cannot perform. Hiding is not security; the API is.

### Go API

**Does:** session auth, permission enforcement, Kubernetes proxy (typed clients + unstructured for CRDs), Helm SDK, audit writer, static SPA hosting.

**Uses:** `client-go` with `rest.InClusterConfig()`, MongoDB driver, Helm Go SDK.

**Depends on:** MongoDB URI, `SESSION_SECRET`, in-cluster ServiceAccount, optional Prometheus / metrics-server.

Logical units inside Go (each with a clear job):

| Unit | Job | Depends on |
| --- | --- | --- |
| `httpapi` | Routes, cookies, JSON errors, SPA fallback | all below |
| `auth` | Login, logout, session cookie, password hash, force-change | `store` |
| `rbac` | Load permission set + namespaces; allow/deny | `store` |
| `kube` | Typed and dynamic Kubernetes calls | in-cluster config |
| `streams` | Logs, exec, metrics subscribe | `kube`, `rbac` |
| `helmctrl` | Helm list/install/upgrade/rollback/uninstall | cluster REST, `rbac` |
| `audit` | Write and query/delete audit documents | `store` |
| `store` | MongoDB collections | `MONGODB_URI` |
| `bootstrap` | Create owner if missing; always sync owner password from `OWNER_PASSWORD` | `store`, env |

You should be able to change `kube` internals without changing how `rbac` answers allow/deny.

### MongoDB

**Does:** persist users, permission sets, sessions, app settings, audit logs.

**Does not:** store pods, YAML snapshots as source of truth, or metrics history (v1). Cluster state is always live from Kubernetes.

**Depends on:** a reachable URI. Atlas or in-cluster Mongo are both fine.

### Kubernetes API

**Does:** all cluster reads and writes.

**Depends on:** the dashboard ServiceAccount (`cluster-admin` in v1). Narrowing that SA later is an ops hardening step, not a substitute for app RBAC.

### Cloudflare Access

**Does:** edge identity / device / IP policy before traffic hits Ingress.

**Does not:** replace app login. The app still needs to know which member is acting.

## Request flow

Every cluster action follows the same path.

```
authenticate session
  → if missing/expired: 401, audit if a token was presented and failed
  → load user (deny if disabled)
  → if owner: skip permission set (still audit)
  → else load permission set + namespace list
  → allow or 403 (audit denial)
  → call Kubernetes / Helm
  → audit success or error
  → return JSON or stream
```

Namespace filter: for namespaced resources, requested namespace must be in the member’s list (or the member has “all namespaces”), and must not be the install namespace (`POD_NAMESPACE`). List calls are constrained to those namespaces. Cluster-scoped resources require the module’s cluster-scoped grant; namespace list does not imply node access.

## HTTP surface (logical)

Exact paths can be refined at implementation; this is the contract.

| Area | Examples |
| --- | --- |
| Health | `GET /healthz`, `GET /readyz` (ready = Mongo ping + in-cluster config loaded) |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` |
| Owner: members | `/api/settings/members` |
| Owner: permission sets | `/api/settings/permission-sets` |
| Owner: audit | `/api/settings/audit` |
| Owner: settings | `/api/settings/app` |
| Cluster | `/api/k8s/...` typed routes per resource |
| Streams | `/api/streams/logs`, `/api/streams/exec`, `/api/streams/metrics` |

SPA: any non-API path serves `index.html`.

Errors:

- `401` unauthenticated
- `403` authenticated but not allowed (do not use 404 to hide K8s objects the user is forbidden to see; 403 is explicit and auditable)
- `404` Kubernetes object missing in a namespace they **are** allowed to see
- `409` / `422` apply conflicts and validation
- `503` Kubernetes or Mongo unavailable

## Live streams

All streams authenticate the session (cookie on the WebSocket upgrade or a short-lived stream ticket issued after an HTTP check). Same `rbac` checks as HTTP.

| Stream | Kubernetes mechanism | Notes |
| --- | --- | --- |
| Logs | Pod log stream | Follow, previous, container, tail. `logs` on Pods. |
| Exec | Pod exec (SPDY/WebSocket) | Interactive PTY to xterm. `exec` on Pods. |
| Metrics | Prometheus query or metrics-server | Poll or watch; `metrics.view`. |

If the permission check fails, the stream is not opened and a denial audit record is written.

## Data: what lives where

| Data | Store |
| --- | --- |
| Owner, members, password hashes | MongoDB `users` |
| Permission sets | MongoDB `permission_sets` |
| Sessions | MongoDB `sessions` (so logout and disable take effect on all replicas) |
| App settings | MongoDB `settings` |
| Audit logs | MongoDB `audit_logs` |
| Pods, Deployments, Helm releases, etc. | Kubernetes API |
| Metrics | Prometheus or metrics-server (not copied into Mongo in v1) |

### MongoDB collections (logical schema)

**users**

- `_id`, `username` (unique, lowercase), `displayName`, `role` (`owner` \| `member`), `passwordHash`, `mustChangePassword`, `enabled`, `permissionSetId` (members), `namespaces` (string list; `["*"]` means all), `createdAt`, `updatedAt`, `createdBy`

**permission_sets**

- `_id`, `name`, `description`, `builtinTemplate` (`viewer` \| `operator` \| `admin` \| null if custom), `grants` (map of module id → actions[]), `createdAt`, `updatedAt`

**sessions**

- `_id`, `userId`, `username`, `createdAt`, `lastSeenAt`, `expiresAt`, `idleExpiresAt`, `ip`, `userAgent`

**settings** (single document)

- `sessionIdleHours` (default 8), `sessionMaxHours` (default 24), `metricsSource` (`auto` \| `prometheus` \| `metrics-server`), `prometheusURL` (optional override), `helmRepositories` (owner-configured)

**audit_logs**

See [AUDIT.md](AUDIT.md).

Indexes: `users.username` unique; `sessions.expiresAt` TTL optional in addition to app expiry; `audit_logs.timestamp`, `audit_logs.username`, `audit_logs.action`.

## Secrets and config

The container image is **generic**. It must not contain cluster hostnames, Ingress URLs, Mongo URIs, owner credentials, Cloudflare settings, or any other install-specific value. Anyone can pull the public image and run it with their own Helm values / Secret.

Injected as env from a Kubernetes Secret plus the Downward API (see [DEPLOYMENT.md](DEPLOYMENT.md)):

| Name | Purpose |
| --- | --- |
| `MONGODB_URI` | Mongo connection string (installer-supplied) |
| `SESSION_SECRET` | Cookie signing / encryption key (installer-supplied) |
| `OWNER_USERNAME` | Used when creating the owner if none exists. Default `owner`. |
| `OWNER_PASSWORD` | Required always. On every start, this is the owner login password. |
| `POD_NAMESPACE` | Install namespace (Downward API). Owner-only in the UI. |
| `LISTEN_ADDR` | Optional. Default `:8080`. |
| `TRUST_PROXY` | Optional. Default `true`. |

On every start: create the owner if missing, then set the owner password hash from `OWNER_PASSWORD`. Rotating the Secret and restarting pods is how the owner password changes. There is no in-app owner password change.

## Kubernetes access

- Config: `rest.InClusterConfig()`.
- ServiceAccount: bound to `cluster-admin` so the app can perform Lens-parity operations.
- Members are **not** mapped to Kubernetes Users/ServiceAccounts in v1. App RBAC is the only member control plane.
- YAML apply: **server-side apply** with field manager `kubepilot`.

This means a compromised dashboard pod is cluster-admin. Mitigations: Cloudflare Access, app auth, NetworkPolicy to the API server as usual, no extra Ingress except this app, audit everything. Narrowing the SA is a later hardening option and will block some catalog features until grants are re-tuned.

## Metrics source

Order when `metricsSource=auto`:

1. If `prometheusURL` is set, use it.
2. Else try in-cluster Prometheus (`prometheus-operated` / common Service names in `monitoring` and `prometheus` namespaces; HTTPS/HTTP). First success wins.
3. Else metrics-server (`metrics.k8s.io`).
4. Else hide charts and show “metrics unavailable”.

Owner can pin `prometheus` or `metrics-server` in settings.

## Scaling and replicas

The Deployment may run more than one replica. Sessions live in MongoDB. Exec sessions are sticky to a pod (Ingress session affinity on the stream path, or a single replica until stream routing is added). v1 recommendation: **2 replicas** for the HTTP API, with a note that an in-progress exec dies if that pod is killed.

## Testing (when code exists)

Not implemented in this docs phase. When we build:

- `rbac` unit tests: every module/action × namespace allow/deny table.
- API tests: member cannot hit owner routes; 403 is audited.
- `kube` tests against envtest or a kind cluster for a slice of resources.
- Member cannot list or mutate `POD_NAMESPACE`.
- No real cluster credentials in CI. Image build contains no install secrets.

## Related docs

- Product catalog: [PRODUCT.md](PRODUCT.md)
- Permission matrix: [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md)
- Deploy: [DEPLOYMENT.md](DEPLOYMENT.md)
