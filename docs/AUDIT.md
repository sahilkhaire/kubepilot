# KubePilot — audit logs

Owner can see who logged in, from which IP, and what they did. Owner can delete logs at their convenience. Members cannot see this module.

## What is recorded

### Always

| Category | Actions |
| --- | --- |
| Auth | `login`, `logout`, `login_failed`, `password_change` (members only) |
| Owner member ops | `member_create`, `member_edit`, `member_disable`, `member_enable`, `member_delete`, `member_password_reset` |
| Owner boot | `owner_password_sync` when the boot password changes the stored hash |
| Permission sets | `permission_set_create`, `permission_set_edit`, `permission_set_delete` |
| App settings | `settings_edit` |
| Denials | Any 403 on `/api/*` or stream upgrade (`result=denied`) |
| Mutations | create, edit, delete, yaml apply, scale, restart, rollback, trigger, cordon, drain, Helm install/upgrade/rollback/uninstall, namespace create/delete |
| Privileged reads | `logs`, `exec`, `secrets.reveal` |

### Not recorded in v1

- Ordinary list/get of resources (pod list, deployment get, YAML **view** of non-secret objects).
- Metrics polls.
- Health checks.

If we later add “log all reads”, it will be an owner setting defaulting off.

## Redaction

Never stored in `details`:

- Passwords, password hashes, session cookie values
- Secret data / decoded secret values (record only secret name, namespace, keys **names** if needed)
- Exec command **output** (record pod, container, that a session started/stopped; not the shell transcript)
- Log line contents
- `MONGODB_URI`, `SESSION_SECRET`, owner bootstrap password

Failed login stores the **username attempted**, not the password.

## Document schema

Collection: `audit_logs`.

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | ObjectId | |
| `timestamp` | date | UTC |
| `userId` | string | Actor id; empty if login failed for unknown user |
| `username` | string | Snapshot at event time |
| `role` | string | `owner` \| `member` \| `anonymous` |
| `ip` | string | `CF-Connecting-IP` if present, else `X-Forwarded-For` first hop, else socket IP |
| `userAgent` | string | Truncated to 256 chars |
| `sessionId` | string | If a session existed |
| `module` | string | Module id from [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md), or `auth` |
| `action` | string | Canonical verb or auth action above |
| `result` | string | `success` \| `denied` \| `error` |
| `httpStatus` | int | When applicable |
| `apiVersion` | string | Kubernetes apiVersion when a K8s object is involved |
| `kind` | string | e.g. `Pod` |
| `namespace` | string | Empty for cluster-scoped |
| `name` | string | Object name |
| `path` | string | Request path, no query secrets |
| `method` | string | HTTP method |
| `details` | object | Short, redacted JSON (e.g. `{ "replicas": 3 }`, `{ "reason": "disabled" }`) |
| `error` | string | Error message to owner, truncated 500 chars, no secret values |

Indexes: `timestamp`, `username`, `action`, `result`, compound `{ username: 1, timestamp: -1 }`.

## Owner UI

- Filter: time range, username, module, action, result, namespace, kind, free-text on name/path.
- Default sort: newest first.
- Pagination (cursor by `_id`/`timestamp`).
- Delete selected rows.
- Delete by current filter (second confirmation: type `delete`).
- No automatic expiry in v1. A retention-days setting may be added later in `settings.app`; until then logs live until the owner deletes them.

Export (CSV/JSON) is **not** in v1. Owner can delete; they cannot bulk-export from the product yet.

## When to write the log

- **Mutations:** after Kubernetes/Helm returns, with `success` or `error`.
- **Denials:** as soon as `rbac` denies, before any kube call.
- **Streams:** one event on start (`success` or `denied`), one on stop (`success`) with duration in `details`. Do not log every frame.
- **Login:** after credential check.

Audit write failure must **not** fail a successful Kubernetes mutation (log the audit error to stdout). For login, still allow login if audit insert fails, but emit a process log at error level. Owner settings mutations should fail if audit cannot be written (settings are Mongo-only; we can transaction-ish: write audit first or same failure domain).

Practical v1 rule:

- K8s/Helm success + audit fail: return success, error-log locally.
- Owner Mongo mutations: require audit insert in the same code path; if audit fails, return 503.

## Related docs

- Who can delete: owner only — [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md)
- IP source: Cloudflare — [DEPLOYMENT.md](DEPLOYMENT.md)
