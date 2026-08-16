# Resource Row Action Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline Logs / Exec / YAML buttons on `ResourceListPage` with a Nodes-style ⋮ menu (YAML, Logs, Shell, Delete).

**Architecture:** Keep all UI in `web/src/pages/ResourceListPage.tsx`. Lift the list fetch to `loadItems` via `useCallback` so delete can reload. A local `ResourceRowMenu` matches the Nodes dropdown. Permissions use existing `useUser()` + `can()`. Delete uses existing `deleteK8sResource` + `DeleteConfirm`. No new routes, APIs, or shared menu component.

**Tech Stack:** React 19, TypeScript, Vite, shadcn/radix DropdownMenu, sonner toasts.

**Spec:** [docs/superpowers/specs/2026-08-16-resource-row-menu-design.md](../specs/2026-08-16-resource-row-menu-design.md)

## Global Constraints

- YAML, Logs, Shell, Delete only — no Attach, Evict, Share, scale, restart, rollback.
- YAML is a `Link` to the existing YAML route (`yamlPath()`), not `ResourceYAMLSheet`.
- Shell label is **Shell**, linking to the exec route.
- Hide Delete when `module === 'endpoints'`, even for owner.
- Logs/Shell only when `module === 'pods'` and `can(user, 'pods', 'logs'|'exec')`.
- Delete when `module !== 'endpoints' && can(user, module, 'delete')`.
- On delete failure: toast error, leave `DeleteConfirm` open.
- No new automated frontend tests.
- Do not change Nodes, Namespaces, Events, Helm, CRDs.

---

## File map

- Modify: `web/src/pages/ResourceListPage.tsx` — load callback, row menu, delete dialog
- Unchanged: `web/src/api.ts` (`deleteK8sResource`), `web/src/lib/grants.ts` (`can`), `web/src/components/DeleteConfirm.tsx`, `web/src/components/ui/dropdown-menu.tsx`

---

### Task 1: Lift `loadItems` and add delete state

**Files:**
- Modify: `web/src/pages/ResourceListPage.tsx`

**Interfaces:**
- Consumes: `deleteK8sResource(module, name, { namespace?, clusterScoped? })` from `@/api`
- Produces: `loadItems(): Promise<void>`; `deleteTarget: { name: string; namespace?: string } | null`; `runDelete(): Promise<void>`

- [x] **Step 1: Add imports and delete state**

Add `useCallback` to the React import. Add:

```tsx
import { EllipsisVerticalIcon } from 'lucide-react'
import { toast } from 'sonner'
import { deleteK8sResource, type User } from '@/api'
import DeleteConfirm from '@/components/DeleteConfirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
```

Inside `ResourceListPage`, after `query` state:

```tsx
const [deleteTarget, setDeleteTarget] = useState<{ name: string; namespace?: string } | null>(null)
const [deleting, setDeleting] = useState(false)
```

- [x] **Step 2: Replace the items `useEffect` fetch with `loadItems`**

```tsx
const loadItems = useCallback(async () => {
  if (!module || module === 'overview') return
  if (!clusterScoped && !namespace) {
    setItems([])
    return
  }
  setError('')
  try {
    const path = clusterScoped
      ? `/api/k8s/${encodeURIComponent(module)}`
      : `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}`
    const res = await fetch(path, { credentials: 'same-origin' })
    if (res.status === 403 || res.status === 404) {
      setItems([])
      return
    }
    if (!res.ok) {
      throw new Error(`failed to load ${module}`)
    }
    const data: K8sObject[] = await res.json()
    setItems(Array.isArray(data) ? data : [])
  } catch (e) {
    setError(e instanceof Error ? e.message : 'load failed')
  }
}, [module, namespace, clusterScoped])

useEffect(() => {
  void loadItems()
}, [loadItems])
```

- [x] **Step 3: Add `runDelete` after `yamlPath`**

```tsx
async function runDelete() {
  if (!deleteTarget) return
  setDeleting(true)
  try {
    await deleteK8sResource(module, deleteTarget.name, {
      namespace: clusterScoped ? undefined : deleteTarget.namespace,
      clusterScoped,
    })
    toast.success(`Deleted ${deleteTarget.name}`)
    setDeleteTarget(null)
    await loadItems()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'delete failed')
  } finally {
    setDeleting(false)
  }
}
```

- [x] **Step 4: Render `DeleteConfirm` at the end of `PageBody`**

```tsx
{deleteTarget ? (
  <DeleteConfirm
    resourceName={deleteTarget.name}
    resourceLabel={kind.label}
    pending={deleting}
    onConfirm={() => runDelete()}
    onCancel={() => !deleting && setDeleteTarget(null)}
  />
) : null}
```

---

### Task 2: Replace inline buttons with `ResourceRowMenu`

**Files:**
- Modify: `web/src/pages/ResourceListPage.tsx`

**Interfaces:**
- Consumes: `loadItems`, `setDeleteTarget`, `deleting`, `deleteTarget` from Task 1
- Produces: `ResourceRowMenu` local component

- [x] **Step 1: Add `ResourceRowMenu` below `statusBadge`**

```tsx
function ResourceRowMenu({
  name,
  namespace,
  module,
  yamlHref,
  user,
  busy,
  onDelete,
}: {
  name: string
  namespace: string
  module: string
  yamlHref: string
  user: User
  busy: boolean
  onDelete: () => void
}) {
  const showLogs = module === 'pods' && can(user, 'pods', 'logs')
  const showShell = module === 'pods' && can(user, 'pods', 'exec')
  const showDelete = module !== 'endpoints' && can(user, module, 'delete')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${name}`} disabled={busy}>
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem asChild>
          <Link to={yamlHref}>YAML</Link>
        </DropdownMenuItem>
        {showLogs ? (
          <DropdownMenuItem asChild>
            <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/logs`}>
              Logs
            </Link>
          </DropdownMenuItem>
        ) : null}
        {showShell ? (
          <DropdownMenuItem asChild>
            <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/exec`}>
              Shell
            </Link>
          </DropdownMenuItem>
        ) : null}
        {showDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [x] **Step 2: Replace the Actions cell contents**

Change the Actions header to match Nodes:

```tsx
<TableHead className="w-8" />
```

Replace the inline button `div` with:

```tsx
<TableCell className="text-right">
  <ResourceRowMenu
    name={name}
    namespace={ns}
    module={module}
    yamlHref={yamlPath(item)}
    user={user}
    busy={deleting && deleteTarget?.name === name}
    onDelete={() => setDeleteTarget({ name, namespace: clusterScoped ? undefined : ns })}
  />
</TableCell>
```

Remove the unused `Button` import if it is only still needed by `ResourceRowMenu` (keep it).

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p web` (or the project's web typecheck script)

Expected: PASS, no errors in `ResourceListPage.tsx`

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| ⋮ menu replaces inline buttons | 2 |
| YAML always, existing route | 2 |
| Logs/Shell pods + grants, Shell label | 2 |
| Delete gated, hidden for endpoints | 2 |
| DeleteConfirm + toast + reload | 1 |
| Failure leaves dialog open | 1 (`setDeleteTarget(null)` only on success) |
| Disable ⋮ while that row deletes | 2 (`busy`) |
| `loadItems` via `useCallback` | 1 |
| No YAML sheet, no shared Nodes component | both |
