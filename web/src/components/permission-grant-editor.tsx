import type { CatalogGroup, CatalogModule } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { actionLabel, grantSummary, hasAction } from '@/lib/grants'
import { cn } from '@/lib/utils'

function cloneGrants(grants: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [module, actions] of Object.entries(grants)) {
    if (actions.length > 0) out[module] = [...actions]
  }
  return out
}

function setModuleActions(
  grants: Record<string, string[]>,
  module: CatalogModule,
  next: string[],
): Record<string, string[]> {
  const out = cloneGrants(grants)
  const allowed = new Set(module.actions)
  const unique = next.filter((action, i) => allowed.has(action) && next.indexOf(action) === i)
  if (unique.length === 0 || !unique.includes('view')) {
    delete out[module.id]
    return out
  }
  out[module.id] = module.actions.filter((action) => unique.includes(action))
  return out
}

function toggleAction(grants: Record<string, string[]>, module: CatalogModule, action: string): Record<string, string[]> {
  const current = grants[module.id] ?? []
  if (action === 'view') {
    if (current.includes('view')) return setModuleActions(grants, module, [])
    return setModuleActions(grants, module, ['view'])
  }
  if (current.includes(action)) {
    return setModuleActions(
      grants,
      module,
      current.filter((a) => a !== action),
    )
  }
  return setModuleActions(grants, module, current.includes('view') ? [...current, action] : ['view', action])
}

function setGroup(grants: Record<string, string[]>, group: CatalogGroup, mode: 'view' | 'all' | 'clear'): Record<string, string[]> {
  let next = cloneGrants(grants)
  for (const module of group.modules) {
    if (mode === 'clear') {
      next = setModuleActions(next, module, [])
    } else if (mode === 'view') {
      const current = next[module.id] ?? []
      next = setModuleActions(next, module, current.includes('view') ? current : ['view', ...current])
    } else {
      next = setModuleActions(next, module, module.actions)
    }
  }
  return next
}

function scopeLabel(scope: CatalogModule['scope']): string {
  if (scope === 'cluster') return 'cluster'
  if (scope === 'mixed') return 'ns or cluster'
  return 'ns'
}

export function PermissionGrantEditor({
  catalog,
  grants,
  onChange,
}: {
  catalog: CatalogGroup[]
  grants: Record<string, string[]>
  onChange: (grants: Record<string, string[]>) => void
}) {
  const summary = grantSummary(grants)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {summary.modules} module{summary.modules === 1 ? '' : 's'}, {summary.actions} action
        {summary.actions === 1 ? '' : 's'}. Missing modules are off. View is required for any other
        action.
      </p>
      {catalog.map((group) => (
        <section key={group.id} className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <h3 className="text-sm font-medium">{group.title}</h3>
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="xs" variant="ghost" onClick={() => onChange(setGroup(grants, group, 'view'))}>
                View all
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => onChange(setGroup(grants, group, 'all'))}>
                Full access
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => onChange(setGroup(grants, group, 'clear'))}>
                Clear
              </Button>
            </div>
          </div>
          <div className="divide-y">
            {group.modules.map((module) => {
              const enabled = hasAction(grants, module.id, 'view')
              return (
                <div key={module.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{module.label}</span>
                      <Badge variant="outline">{scopeLabel(module.scope)}</Badge>
                    </div>
                    {module.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{module.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {module.actions.map((action) => {
                      const checked = hasAction(grants, module.id, action)
                      const disabled = action !== 'view' && !enabled
                      const id = `${module.id}-${action}`
                      return (
                        <div key={action} className="flex items-center gap-1.5">
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() => onChange(toggleAction(grants, module, action))}
                          />
                          <Label
                            htmlFor={id}
                            className={cn('text-xs font-normal', disabled && 'text-muted-foreground')}
                          >
                            {actionLabel(action)}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
