# KubePilot — open questions

These do not block the product spec. Defaults below are **in effect** until we change a doc on purpose.

## Defaults already chosen (not open)

| Topic | Decision | Where |
| --- | --- | --- |
| Display name | KubePilot | [PRODUCT.md](PRODUCT.md) |
| Chart/image name | `kubepilot` | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Cluster scope | In-cluster only | [PRODUCT.md](PRODUCT.md) |
| Stack | Go + React (TypeScript), one container | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Perimeter | Cloudflare Access; no in-app IP list | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Mongo | URI from Secret | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Session | 8h idle, 24h max, HttpOnly Secure cookie | [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md) |
| Owner password | From `OWNER_PASSWORD` on every boot; cannot change in UI | [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md) |
| Member passwords | Argon2id; invite shown once; owner reset | [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md) |
| Image | Generic public image; all install config via values/Secret | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Install namespace | `POD_NAMESPACE`; owner-only in the UI | [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md) |
| Metrics | auto Prometheus then metrics-server | [ARCHITECTURE.md](ARCHITECTURE.md) |
| YAML | Server-side apply, field manager `kubepilot` | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Dashboard SA | `cluster-admin` in v1 | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Audit reads | Privileged only, not every GET | [AUDIT.md](AUDIT.md) |
| Replicas | 2, with ClientIP affinity for exec streams | [DEPLOYMENT.md](DEPLOYMENT.md) |

## Still optional to decide later

These can wait until the phase that needs them. If unspecified at implementation time, use the fallback.

### 1. Exact Prometheus service discovery

**Fallback:** try Services named `prometheus`, `prometheus-operated`, `kube-prometheus-stack-prometheus` in namespaces `monitoring`, `observability`, `prometheus`. Owner can set `prometheusURL`.

### 2. Cookie name

**Fallback:** `kubepilot_session`.

### 3. Password generator alphabet (members)

**Fallback:** 24 characters from unreserved alphanumeric plus `-` `_`, no ambiguous `O0Il1`.

### 4. Audit export

**Fallback:** not in v1 ([AUDIT.md](AUDIT.md)). Add only if owner asks after using delete/filter.

### 5. Mapping members onto Kubernetes RBAC

**Fallback:** never in v1. App RBAC only. Revisit if we drop `cluster-admin` on the SA.

## Not questions

Do not re-open without a product change:

- Multi-cluster
- Desktop app
- Email delivery of invites
- Members seeing audit logs
- Storing secret values in Mongo
- Browser talking directly to kube-apiserver
- Port-forward in the browser
- Owner changing password in the UI
- Members seeing the install namespace
