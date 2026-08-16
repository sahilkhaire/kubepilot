# Cluster Console — deployment

How the app is installed into the cluster. Helm is the supported installer. MongoDB is **not** bundled.

The published container image is **generic**: anyone can pull it and install it on their cluster. No hostname, registry credentials, Mongo URI, owner password, or namespace is baked into the image. All of that is Helm values + Secret + Downward API.

## Perimeter

```
User → Cloudflare Access → Ingress (TLS) → Service → Deployment (chart name)
```

- Configure the public hostname in Cloudflare Access (Zero Trust). Policies (SSO, email, IP, device) live there.
- Cluster Console still requires username/password.
- Do **not** expose the Service as NodePort/LoadBalancer without Cloudflare (or equivalent) in front.
- In-app IP whitelist is **not** implemented.

Trust `CF-Connecting-IP` only if Ingress is configured so that only Cloudflare can hit it (Cloudflare authenticated origin pulls / allowlist Cloudflare proxy IPs at the Ingress controller). Otherwise fall back as in [AUDIT.md](AUDIT.md).

## Public image (no baked-in config)

The image contains only the Go binary and the SPA assets.

Must **not** be in the image:

- Ingress host, TLS certs, Cloudflare settings
- `MONGODB_URI`, `SESSION_SECRET`, `OWNER_USERNAME`, `OWNER_PASSWORD`
- Install namespace, replica count, resource limits
- A fixed container registry (the chart’s `image.repository` / `image.tag` / `image.pullPolicy` are always values; pull secrets are installer-supplied)

Installers set `image.repository` to this project’s public image or to their own mirror. Default chart values may show the public image name as an example; they must remain overridable. The binary never reads a compiled-in registry or cluster URL.

## Helm chart (`cluster-console`)

Install into a **dedicated** namespace (chart default name `cluster-console`, overridable). That namespace is the install namespace: **owner-only** in the UI ([AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md)).

Resources (names come from chart fullname, not hardcoded in the image):

| Kind | Role |
| --- | --- |
| Namespace | Optional create; installer chooses the name |
| ServiceAccount | App identity |
| ClusterRoleBinding | Bind that SA to `cluster-admin` |
| Secret | URI, session secret, owner username/password |
| Deployment | One container: public image + env from Secret + `POD_NAMESPACE` |
| Service | ClusterIP (port from values, default 8080) |
| Ingress | hostname and TLS from values |
| NetworkPolicy | optional: allow Ingress controller + egress to Kubernetes API, DNS, Mongo |

Optional: PodDisruptionBudget, HPA — not required for v1. Default replicas: **2** (see stream stickiness in [ARCHITECTURE.md](ARCHITECTURE.md)).

### Values (logical examples — not baked into the image)

```yaml
image:
  repository: ""   # required: public image or your mirror, e.g. ghcr.io/example/cluster-console
  tag: ""          # required at install
  pullPolicy: IfNotPresent
  pullSecrets: []  # optional, for private mirrors

replicaCount: 2

ingress:
  host: ""         # required, e.g. console.your-company.com
  tlsSecretName: ""
  className: nginx

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: "2"
    memory: 1Gi

# Provide via --set-file or an existing Secret name
existingSecret: ""  # if set, chart does not create Secret

mongodbUri: ""       # only for generating Secret; prefer existingSecret
sessionSecret: ""
ownerUsername: owner
ownerPassword: ""    # required; used on every pod start

# Stream affinity so exec stays on one pod
sessionAffinity: ClientIP
```

Never commit real `mongodbUri`, `sessionSecret`, or `ownerPassword` to git. Never bake them into the image.

## Environment variables

From the Secret (installer) and Downward API (chart), consumed by the container:

| Variable | Required | Default |
| --- | --- | --- |
| `MONGODB_URI` | yes | |
| `SESSION_SECRET` | yes | |
| `OWNER_USERNAME` | no | `owner` (only when creating the owner) |
| `OWNER_PASSWORD` | yes always | |
| `POD_NAMESPACE` | yes | from Downward API `metadata.namespace` |
| `LISTEN_ADDR` | no | `:8080` |
| `TRUST_PROXY` | no | `true` (honor forwarded headers / CF) |

## Probes

- `GET /healthz` — process up. Liveness.
- `GET /readyz` — Mongo ping succeeded, in-cluster kube config loaded, `OWNER_PASSWORD` present, owner row synced. Readiness.

Do not require Prometheus or metrics-server for readiness.

## Bootstrap and owner password

1. Install chart with Secret containing Mongo URI, session secret, **owner password**, and values for image + ingress host.
2. Pod starts, connects to Mongo.
3. If `users` has no `role=owner`, create owner from `OWNER_USERNAME` / `OWNER_PASSWORD`.
4. **Every start:** set the owner password hash from `OWNER_PASSWORD`. If the hash changed, delete owner sessions.
5. Put Cloudflare Access in front of the Ingress hostname.
6. Log in as owner, create permission sets (or clone templates), invite members, share credentials.

**Owner password lost or rotate:** edit `OWNER_PASSWORD` in the Secret, restart the Deployment. The new value is in use after pods become ready. There is no in-app owner password change and no Mongo break-glass for the owner password.

## RBAC of the dashboard

v1 binds the app ServiceAccount to **cluster-admin**. That is required for the full Lens catalog (nodes drain, CRDs, clusterroles, all namespaces).

Members never get this SA token. The token never leaves the pod.

Members also cannot see the install namespace in the dashboard, so they cannot edit this Deployment or read this Secret through the UI.

Hardening later: replace `cluster-admin` with a custom ClusterRole matching enabled product modules. Until then, treat the install namespace as sensitive (restricted who can `kubectl exec` into it, no extra Ingress).

## MongoDB

- Atlas, VM, or in-cluster Mongo: all fine.
- Network: the dashboard pods must reach the URI (NetworkPolicy egress, Atlas IP access list including NAT/egress IPs of the cluster).
- Auth in the URI (user/password or similar). TLS as required by the server.
- Database name is whatever the installer puts in the URI path. If the path is empty, the app uses `cluster_console` as a product default (not an install identity).
- Collections created by the app on start.

## TLS

Terminate TLS at Ingress (cert-manager or origin cert). The container may speak HTTP inside the cluster. Cookie `Secure` requires the browser to see HTTPS, which it does via Ingress.

## Related docs

- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Owner password and install namespace: [AUTH-AND-PERMISSIONS.md](AUTH-AND-PERMISSIONS.md)
- Roadmap phase that produces this chart: [ROADMAP.md](ROADMAP.md)
