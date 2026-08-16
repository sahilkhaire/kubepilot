# KubePilot — product

Product name: **KubePilot**. Helm chart, image, Go module, and repo name: `kubepilot`.

## Vision

A Lens-like Kubernetes dashboard that runs **inside** our cluster, is reached through Cloudflare Access, and is safe to give to people who must not have full cluster access.

Owner creates members, assigns a permission set and namespaces, and shares a username plus a generated password. Every login and every privileged or mutating operation is written to MongoDB. Owner can read and delete those logs.

The product spec includes the full Lens-style feature catalog. Implementation ships module by module ([ROADMAP.md](ROADMAP.md)).

## Who it is for

### Owner (exactly one)

Created on first start from env (`OWNER_USERNAME`, `OWNER_PASSWORD`). Full access to the cluster through the UI, and exclusive access to:

- Members (create, disable, delete, reset password)
- Permission sets
- Audit logs (view, filter, delete)
- App settings (session timeouts, metrics source override, Helm chart repositories)
- The **install namespace** (the namespace this app runs in)

The owner account cannot be deleted. Ownership transfer is not in v1.

The owner **cannot change their password in the UI**. Whatever `OWNER_PASSWORD` is set when the pod boots is the password in use. Change it by updating the Secret and restarting the pods.

### Members

Created by the owner. They log in with credentials the owner shares out of band (Slack, password manager, etc.). They only see modules their permission set allows, only in namespaces they are granted, and only actions that set allows.

Members cannot:

- Sign up
- Reset their own password (owner resets for them)
- See or manage other members
- See audit logs
- Receive a kubeconfig
- See or mutate the namespace where KubePilot is installed (even with all-namespaces `*`)

## How people reach it

1. Cloudflare Access (Zero Trust) in front of the Ingress hostname.
2. KubePilot login (username + password) so the app knows **which member** is acting.

Cloudflare proves the visitor is allowed onto the hostname. The app proves which identity to audit and which permission set to apply. Both layers stay.

There is **no in-app IP whitelist**. If IP restriction is needed, it is configured in Cloudflare Access.

## What it is

An in-cluster web application:

- One Kubernetes cluster: the one the pod runs in (`rest.InClusterConfig`).
- One **generic** container image: no registry, hostname, Mongo URI, or passwords baked in. Every install supplies config via Helm values / Secret / env.
- One container: Go serves `/api/*` and the built React SPA.
- All Kubernetes calls go through Go after session + permission checks.
- Live features (logs, exec, metrics) go through Go as streams, with the same checks.

## What it is not

| Out of scope | Why |
| --- | --- |
| Multi-cluster | Product is the cluster it is deployed into |
| Desktop app / OpenLens fork | We own the web UX and the permission model |
| Lens extensions / marketplace | Not needed for an internal console |
| Local kubeconfig manager | Members never get kubeconfig |
| Email invites or SMTP | Owner copies credentials from the UI |
| In-app IP allowlist | Cloudflare Access is the perimeter |
| Bundled MongoDB | Connection URI only (Atlas or existing infra) |
| Self-signup / SSO into the app | Username/password in-app; Cloudflare may still use SSO at the edge |
| Ownership transfer | Single owner for v1 |
| ReplicationControllers | Legacy; use Deployments / ReplicaSets |
| Port-forward | Not offered in the browser (no localhost tunnels, no in-app TCP/HTTP proxy) |

## Feature catalog (Lens parity)

Every item below is in the **product**. Each is a module (or sub-module) with `view` / `create` / `edit` / `delete` unless noted, plus extra actions. The UI hides what the permission set does not allow. The API returns 403 and still audits the attempt.

Details of who can do what: [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md).

### Cluster

- **Overview:** node count, pod count, CPU/memory (if metrics available), failing workloads, recent warnings.
- **Namespaces:** list, create, edit labels/annotations, delete.

### Nodes (cluster-scoped)

- List and detail (conditions, capacity, allocatable, taints, labels, pods on node).
- Metrics (CPU/memory) when available.
- Cordon, uncordon, drain.
- YAML view/edit.

### Workloads

- **Overview:** deployments/statefulsets/daemonsets/pods health in allowed namespaces.
- **Pods:** list, detail (containers, conditions, volumes, events), delete, logs, exec/terminal (attach uses the same `exec` grant), YAML. Creating a bare pod is YAML apply, not a separate form.
- **Deployments:** list, detail, create, edit, delete, scale, restart (rollout restart), rollback, YAML.
- **StatefulSets:** list, detail, create, edit, delete, scale, restart, YAML.
- **DaemonSets:** list, detail, create, edit, delete, restart, YAML.
- **ReplicaSets:** list, detail, delete, scale, YAML (create is unusual; allowed if `create` is granted).
- **Jobs:** list, detail, create, delete, YAML.
- **CronJobs:** list, detail, create, edit, delete, trigger (spawn a Job), YAML.

### Config

- ConfigMaps: list, detail, create, edit, delete, YAML.
- Secrets: same, plus **reveal** (show decoded values) as a separate action. Without `reveal`, names/keys/metadata only, values masked.
- ResourceQuotas, LimitRanges, HPAs, PodDisruptionBudgets: list, detail, create, edit, delete, YAML.
- PriorityClasses, RuntimeClasses: cluster-scoped; same CRUD + YAML.
- Leases: list, detail, delete, YAML (create/edit rarely needed; still gated by those actions).

### Network

- Services: list, detail, create, edit, delete, YAML.
- Endpoints / EndpointSlices: list, detail, YAML.
- Ingresses: list, detail, create, edit, delete, YAML.
- IngressClasses: cluster-scoped; CRUD + YAML.
- NetworkPolicies: list, detail, create, edit, delete, YAML.

### Storage

- PersistentVolumeClaims: list, detail, create, edit, delete, YAML.
- PersistentVolumes: cluster-scoped; CRUD + YAML.
- StorageClasses: cluster-scoped; CRUD + YAML.

### Access control

- ServiceAccounts: list, detail, create, edit, delete, YAML.
- Roles, RoleBindings: namespaced; CRUD + YAML.
- ClusterRoles, ClusterRoleBindings: cluster-scoped; CRUD + YAML.

This is Kubernetes RBAC **inside the cluster**, not KubePilot's own permission sets. Granting a member `view` on ClusterRoles does **not** grant them KubePilot owner powers.

### Custom resources

- CRD list (cluster-scoped): list, detail, YAML; create/edit/delete of CRD definitions if granted.
- Instances of each CRD: list/detail/CRUD/YAML, filtered by namespace when the CR is namespaced.

### Helm

- Releases: list, detail (values, manifests, notes), history.
- Install, upgrade, rollback, uninstall.
- Uses the Helm Go SDK against the same cluster. Chart sources: OCI/HTTP repos configured in app settings (owner). Default: no public repos until the owner adds them.

### Events

- Cluster and namespaced events, filter by type/object/namespace.
- Highlighted on resource detail pages.
- View only.

### Metrics

- Live CPU/memory on overview, nodes, pods, and workload detail.
- Source: in-cluster Prometheus if reachable, otherwise metrics-server.
- Owner can pin the source in app settings.
- View only (`metrics.view`). Charts are hidden if the source is missing or the member lacks the grant.

### Everywhere (if permitted)

- Namespace switcher (only granted namespaces; owner sees all, including the install namespace). Members never see the install namespace.
- Search across allowed resource types in allowed namespaces.
- YAML view for any allowed resource; YAML apply uses **server-side apply** and requires `yaml_edit`.
- Delete with a typed confirmation on destructive actions.
- Copy name / kubectl-style resource identifier.

### Owner-only (not Lens)

- Members
- Permission sets (including Viewer / Operator / Admin templates)
- Audit logs
- App settings (session timeouts, metrics source, Helm chart repositories)

## Interactive tools (how they work)

These exist in the product and are each a distinct permission.

| Tool | Where it runs | Permission |
| --- | --- | --- |
| Live logs | Browser ↔ Go ↔ kube API stream | `logs` on Pods |
| Exec / web terminal | Browser (xterm) ↔ Go ↔ pod exec | `exec` on Pods |
| YAML edit/apply | Editor in UI; Go applies server-side | `yaml_edit` on that module |
| Secret reveal | UI unmasks values after a click | `reveal` on Secrets |

No feature talks to kube-apiserver from the browser.

## Success criteria

The product is complete when:

1. Owner can log in with the boot `OWNER_PASSWORD`, invite members, assign permission sets and namespaces, and reset **member** passwords.
2. A member cannot see or mutate anything outside their grants (UI and API).
3. Lens-catalog resources and actions above are available to whoever is granted them.
4. Audit logs show who logged in, from which IP (Cloudflare `CF-Connecting-IP`), and what privileged/mutating operations they performed. Owner can delete logs.
5. The app deploys with Helm, uses a MongoDB URI, and is reachable only through Cloudflare Access plus app login.

## Related docs

- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Permissions matrix: [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md)
- Audit: [AUDIT.md](AUDIT.md)
- Deploy: [DEPLOYMENT.md](DEPLOYMENT.md)
