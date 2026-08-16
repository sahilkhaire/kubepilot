# Cluster Console — design decision log

Date: 2026-08-16  
Status: Approved in design review; product docs written. Implementation waits on user sign-off of `docs/`.

This file is the **decision log**, not a second spec. Canonical product text lives in:

- [../../README.md](../../README.md)
- [../../PRODUCT.md](../../PRODUCT.md)
- [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
- [../../AUTH-AND-PERMISSIONS.md](../../AUTH-AND-PERMISSIONS.md)
- [../../AUDIT.md](../../AUDIT.md)
- [../../DEPLOYMENT.md](../../DEPLOYMENT.md)
- [../../ROADMAP.md](../../ROADMAP.md)
- [../../OPEN-QUESTIONS.md](../../OPEN-QUESTIONS.md)

## Problem

We need a Lens-like Kubernetes UI that we deploy into our own cluster, with an owner who invites members, strict module/action/namespace permissions, and MongoDB audit of logins and operations. Cloudflare Access protects the hostname. Members must not get a kubeconfig.

## Approaches considered

1. **Custom Go API + React SPA** (chosen) — full control of permission sets, audit, and UX. More work; phased delivery.
2. **Extend Headlamp** — faster resource screens; grafting custom app RBAC and Mongo audit onto every action fights Headlamp’s kube-RBAC/OIDC model.
3. **Wrap official Kubernetes Dashboard** — fastest lists; weakest Lens UX; same grafting problem.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Scope | Single cluster, in-cluster only |
| Client | Web app, not desktop |
| Stack | Go + React (TypeScript), one container |
| Edge | Cloudflare Access; no in-app IP whitelist |
| Identity | Username/password in-app; owner shares generated credentials |
| Authorization | Permission sets (module + action) + per-member namespaces; owner bypass |
| Data | MongoDB URI for app/audit; Kubernetes for cluster objects |
| Kube access | In-cluster SA with cluster-admin; Go is PEP and audit writer |
| Catalog | Full Lens-parity in the product docs; code by [ROADMAP.md](../../ROADMAP.md) phases |
| YAML | Server-side apply |
| Metrics | Prometheus auto, else metrics-server |
| Session | 8h idle / 24h max |
| Owner password | Always `OWNER_PASSWORD` at boot; no in-UI change |
| Image | Generic; no install config baked in |
| Install namespace | Owner-only (`POD_NAMESPACE`) |

## Architecture (one picture)

```
Browser → Cloudflare Access → Ingress → Go (SPA + API + streams)
                                           ├─ MongoDB (users, sets, sessions, audit)
                                           └─ Kubernetes API (in-cluster)
```

Every cluster action: authenticate → load grants → allow or 403 → kube/Helm → audit (including denials).

## Testing (when we implement)

- RBAC table tests per module/action/namespace.
- Member cannot hit owner routes.
- Member cannot list or mutate the install namespace.
- envtest/kind for a slice of kube operations.
- No cluster credentials in CI. Image contains no install secrets.

See [ARCHITECTURE.md](../../ARCHITECTURE.md) and [ROADMAP.md](../../ROADMAP.md) phase 9.

## Out of scope

Multi-cluster, Lens extensions, local kubeconfig manager, email invites, in-app IP allowlist, bundled MongoDB, ownership transfer, port-forward in the browser.

## Next gate

User reviews the docs listed above. Changes go into those files. Implementation plan (writing-plans) starts only after explicit sign-off, beginning at roadmap phase 1.
