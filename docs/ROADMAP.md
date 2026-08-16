# KubePilot — roadmap

The **product** is fully specified in this `docs/` folder. **Code** ships in phases. Do not start a phase until the previous phase is usable in a cluster.

Step-by-step tasks: [superpowers/plans/2026-08-16-kubepilot.md](superpowers/plans/2026-08-16-kubepilot.md).

## Phase 0 — Documentation (done)

- This folder complete.
- Coding plan written. Start at Phase 1 in that plan.

## Phase 1 — App shell, login, bootstrap

**Goal:** deploy an empty console, log in as owner, stay logged in.

- Go HTTP server, health/ready, SPA placeholder.
- Mongo connection from `MONGODB_URI`.
- Owner create-if-missing; **sync owner password from `OWNER_PASSWORD` on every start**.
- Login/logout, session cookie, `/api/auth/me`. Owner cannot change password via API.
- Helm chart: generic image (repository/tag from values), Deployment, Service, Ingress, SA, cluster-admin binding, Secret, `POD_NAMESPACE`.
- Cloudflare Access is an ops step, not code.

**Done when:** helm install with only values/Secret → owner can log in with `OWNER_PASSWORD`. Restarting with a new `OWNER_PASSWORD` changes login. Image contains no install secrets.

## Phase 2 — Members, permission sets, audit viewer

**Goal:** owner can invite a member who cannot see owner settings.

- Permission set CRUD + Viewer/Operator/Admin templates.
- Member CRUD, invite password once, reset, disable, delete.
- Force password change.
- `rbac` middleware.
- Audit writer + owner audit UI (filter, delete).
- Namespace grants stored and returned on `/me`.
- Install namespace (`POD_NAMESPACE`) hidden from members even with `["*"]`.

**Done when:** a Viewer member cannot call `/api/settings/*` (403, audited). Owner sees that denial. A member with `["*"]` cannot list the install namespace.

## Phase 3 — Workloads read + logs

**Goal:** Lens-like workload browsing in granted namespaces.

- Namespace switcher.
- Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs: list + detail.
- Workloads overview, cluster overview (without metrics if not yet wired).
- Pod logs stream.
- Events on the resource page.
- Search within allowed types.

**Done when:** Operator in `["dev"]` sees only `dev` pods and can stream logs; `prod` is 403.

## Phase 4 — Mutations and YAML

**Goal:** operate workloads without kubectl.

- Delete (with confirm), scale, restart, rollback, CronJob trigger.
- YAML view + server-side apply (`yaml_edit`).
- Structured create/edit for Deployments and similar where we have forms; YAML as fallback.

**Done when:** granted restart works and is audited; missing `delete` cannot delete.

## Phase 5 — Config, network, storage

- ConfigMaps, Secrets (masked + `reveal`), ResourceQuotas, LimitRanges, HPAs, PDBs, PriorityClasses, RuntimeClasses, Leases.
- Services, Endpoints/EndpointSlices, Ingresses, IngressClasses, NetworkPolicies.
- PVCs, PVs, StorageClasses.

**Done when:** secret values never appear without `reveal`; reveal is audited.

## Phase 6 — Nodes, events, access control, namespaces

- Nodes: detail, cordon, drain, uncordon, YAML.
- Events explorer.
- Namespaces CRUD.
- ServiceAccounts, Roles, RoleBindings, ClusterRoles, ClusterRoleBindings.

**Done when:** member without `nodes` sees no Nodes in the sidebar or API.

## Phase 7 — Exec and metrics

- Web terminal (xterm) via pod exec.
- Metrics auto-detect Prometheus, else metrics-server; charts on overview/nodes/pods.

**Done when:** `exec` denied is audited and the terminal does not open; metrics hide cleanly if unavailable.

## Phase 8 — CRDs and Helm

- CRD list and CR instances (namespaced + cluster).
- Helm releases, values, history, install, upgrade, rollback, uninstall.
- Owner-configured Helm repos in app settings.

**Done when:** Helm uninstall in an ungranted namespace is 403.

## Phase 9 — Polish

- Resource requests/limits tuning, PDB.
- Stream session affinity documented and tested on 2 replicas.
- UX pass (empty states, confirmations, search).
- Test suite as in [ARCHITECTURE.md](ARCHITECTURE.md) (rbac tables, envtest/kind slice).
- Optional: replace `cluster-admin` with a custom ClusterRole.

## Will not build

- Port-forward in the browser (no localhost tunnels, no in-app TCP/HTTP proxy)

## Explicitly later / not scheduled

- Multi-cluster
- In-app IP allowlist
- Email invites
- Audit CSV export
- Audit retention auto-delete
- Ownership transfer
- Mapping members to Kubernetes ServiceAccounts
- Lens extensions

## Related docs

- Catalog: [PRODUCT.md](PRODUCT.md)
- Deploy: [DEPLOYMENT.md](DEPLOYMENT.md)
