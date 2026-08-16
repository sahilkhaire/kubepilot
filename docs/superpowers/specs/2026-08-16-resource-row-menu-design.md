# Resource row action menu

Date: 2026-08-16  
Status: Design approved in chat; this file is the locked spec.

## Problem

Workloads, Config, Network, Storage, and Access lists (`ResourceListPage`) show inline action buttons. Pods render Logs, Exec, and YAML in the row; every other kind renders YAML. That crowds the table and does not match Nodes, which already uses a compact ⋮ dropdown.

## Goal

Replace those inline buttons with a per-row ⋮ menu. Items are only the actions we already support: YAML, Logs, Shell, and Delete. Permissions gate Logs, Shell, and Delete the same way Nodes gates Cordon / Drain / Delete.

## Scope

**In**

- `web/src/pages/ResourceListPage.tsx` (all kinds that page lists)
- Delete from the list using the existing `deleteK8sResource` API and `DeleteConfirm`
- Reload the list after a successful delete

**Out**

- Nodes, Namespaces, Events, Helm, CRDs (unchanged)
- Attach, Evict, Share, scale, restart, rollback, trigger
- Wiring `ResourceYAMLSheet` (YAML stays a navigation link to the existing YAML routes)
- Extracting a shared menu component used by Nodes
- Backend or RBAC catalog changes

## Approaches considered

1. **Inline the Nodes ⋮ pattern in `ResourceListPage`** (chosen) — smallest change, same UX.
2. Extract a shared `ResourceRowMenu` and refactor Nodes onto it — more churn for a menu Nodes already has.
3. Catalog-driven menus (scale, restart, …) — out of scope; not requested.

## Architecture

```
ResourceListPage
  useUser() + can(user, module, action)
  loadItems()                    ← extracted so delete can reload
  per-row DropdownMenu (⋮)
  DeleteConfirm (one dialog for the selected row)
```

`ResourceListPage` already sits behind list `view` (the page is reachable only if the user can load that kind). It does not need a new `user` prop: `UserProvider` / `useUser()` is the current pattern (`GrantGuard`, and Nodes is moving the same way).

No new routes. Logs and Shell keep `/workloads/:ns/pods/:pod/logs` and `/…/exec`. YAML keeps `yamlPath()` (namespaced or cluster-scoped).

## Menu items

Trigger: ghost icon button, `EllipsisVerticalIcon`, `aria-label={`Actions for ${name}`}`, `DropdownMenuContent align="end"`. Hide the old inline Logs / Exec / YAML buttons.

| Item | Visibility | Behavior |
| --- | --- | --- |
| YAML | Always (user can see the row) | `Link` to existing YAML route |
| Logs | `module === 'pods'` and `can(user, 'pods', 'logs')` | `Link` to logs route |
| Shell | `module === 'pods'` and `can(user, 'pods', 'exec')` | `Link` to exec route; label is **Shell**, not Exec |
| Delete | `can(user, module, 'delete')` and module is not `endpoints` | Opens `DeleteConfirm`; destructive; separated from the items above |

`can()` is `web/src/lib/grants.ts`: owner always allowed, otherwise the grant must include the action.

Endpoints omit `delete` in the RBAC catalog (controller-owned). Hide Delete for `endpoints` even for owner so the UI does not offer an action the catalog forbids.

If Logs and Shell are both hidden, YAML may be the only item. That is fine. If Delete is the only mutation, keep the separator only when Delete is shown.

## Delete flow

1. Menu click sets `deleteTarget` to `{ name, namespace }` (namespace omitted when cluster-scoped).
2. `DeleteConfirm` uses `resourceName={name}`, `resourceLabel={kind.label}`, `pending` while the request runs.
3. Confirm calls `deleteK8sResource(module, name, { namespace, clusterScoped })`.
4. Success: toast `Deleted ${name}`, close dialog, `loadItems()`.
5. Failure: toast the error, leave the dialog open so the user can cancel or retry.
6. While that row’s delete is in flight, disable its ⋮ trigger (`busy` like Nodes).

`loadItems` is the existing list fetch, lifted to `useCallback` so delete can call it without duplicating the URL logic.

## Error handling

- List load failures stay on `ErrorAlert` (unchanged).
- Delete failures are toasts, not a page-level error, matching Nodes.
- Direct visits to logs/exec without grants still hit `GrantGuard` (unchanged). YAML view vs `yaml_edit` stays on the YAML page; the menu does not require `yaml_edit` to show YAML.

## Testing

No new backend tests (delete API already covered in `internal/httpapi/k8s_mutations_test.go`).

Manual checks:

- Pods, owner: YAML, Logs, Shell, Delete.
- Pods, member with `view` + `logs` only: YAML and Logs; no Shell, no Delete.
- Deployments, member with `delete`: YAML and Delete; no Logs/Shell.
- Endpoints: YAML only; no Delete (including owner).
- Delete a pod: type-to-confirm, toast, row gone after reload.
- Cluster-scoped kind (e.g. StorageClasses): YAML and Delete use the cluster-scoped delete path.

No new automated frontend tests: there is no React Testing Library suite for the Nodes menu, and the delete check is `module !== 'endpoints' && can(user, module, 'delete')` inline. Do not extract a helper just to unit-test it.

## Out of scope (explicit)

Attach Pod, Evict, Share submenu, Show Details as a distinct page, YAML sheet from the list, Namespaces/Events/Helm/CRDs/Nodes menus, catalog-driven extra actions.
