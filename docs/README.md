# KubePilot — documentation

KubePilot is an in-cluster web dashboard for **one** Kubernetes cluster: the cluster it is deployed into. It is password-protected, sits behind Cloudflare Access, and enforces owner-defined permission sets so members can only see and do what they are granted.

This folder is the product source of truth. Implementation follows the [step-by-step plan](superpowers/plans/2026-08-16-kubepilot.md).

## Read in this order

| Doc | What it answers |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | What we are building, who uses it, full Lens-parity feature catalog, what we will not build |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, request flow, live streams, MongoDB vs Kubernetes, secrets |
| [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md) | Login, owner/members, invites, permission sets, full module/action matrix |
| [AUDIT.md](AUDIT.md) | What is logged, schema, redaction, owner delete |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Helm resources, env/secrets, Cloudflare Access, owner bootstrap |
| [ROADMAP.md](ROADMAP.md) | Implementation phases |
| [superpowers/plans/2026-08-16-kubepilot.md](superpowers/plans/2026-08-16-kubepilot.md) | Step-by-step development plan (start coding here) |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | Leftover non-blockers; defaults already chosen |

Decision log (short, links here, not a second copy of the spec):

- [superpowers/specs/2026-08-16-kubepilot-design.md](superpowers/specs/2026-08-16-kubepilot-design.md)

## Locked product shape

- **Stack:** Go API + React (TypeScript) UI in one container. Published image is generic: no cluster URLs, secrets, or hostnames baked in.
- **Cluster scope:** in-cluster only. Not multi-cluster. Not a desktop app.
- **Perimeter:** Cloudflare Access. No in-app IP whitelist.
- **Identity:** app username/password. Owner password comes from env on every boot and cannot be changed in the UI. Owner invites members by sharing generated credentials.
- **Authorization:** permission sets (module + action + namespace grant). Owner bypasses all of this. Members never see the install namespace.
- **Data:** MongoDB via `MONGODB_URI` for users, sets, sessions, settings, audit. Kubernetes is the source of truth for cluster objects.
- **Enforcement:** the Go API is the only caller of the Kubernetes API. Members never receive a kubeconfig.

## After you review

Product docs are written. **Code** follows [superpowers/plans/2026-08-16-kubepilot.md](superpowers/plans/2026-08-16-kubepilot.md), phase 1 first.
