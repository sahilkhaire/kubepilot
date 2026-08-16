# KubePilot

In-cluster Kubernetes web dashboard for a single cluster. The published container image is **generic** — no cluster URLs, secrets, or hostnames are baked in. Install with Helm and provide configuration via values and Secrets.

Product documentation lives in [docs/](docs/README.md).

## Quick install

```bash
helm install kubepilot deploy/charts/kubepilot \
  --namespace YOUR_NAMESPACE --create-namespace \
  --set mongodbUri=mongodb://<host>:27017/kubepilot \
  --set sessionSecret=<random-string> \
  --set ownerPassword=<owner-password> \
  --set ingress.host=console.example.com
```

The chart defaults to the public image `ghcr.io/sahilkhaire/kubepilot:latest` (`linux/amd64` and `linux/arm64`). Override `image.repository` / `image.tag` to use a mirror.

Alternatively, create a Secret yourself and set `existingSecret` instead of `mongodbUri`, `sessionSecret`, and `ownerPassword`.

## Required Helm values

| Value | Description |
| --- | --- |
| `image.repository` | Container image (public or your mirror) |
| `image.tag` | Image tag |
| `mongodbUri` or `existingSecret` | MongoDB connection (URI for chart-generated Secret, or name of an existing Secret) |
| `ownerPassword` | Owner account password (from env on every boot; not changeable in UI) |
| `sessionSecret` | Cookie signing secret |

The install namespace is whatever you pass to `helm install --namespace`; the app reads it from `POD_NAMESPACE` on the Deployment (Downward API, `metadata.namespace`). Default `replicaCount` is 2 with `sessionAffinity: ClientIP` on the Service for stream stickiness. A PodDisruptionBudget (`minAvailable: 1`) is created when replicas ≥ 2 (disable with `podDisruptionBudget.enabled: false`).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for ingress, TLS, Cloudflare Access, and full values reference.

## Development

```bash
go test -race ./...
cd web && npm run build
make chart-check   # requires helm
```
