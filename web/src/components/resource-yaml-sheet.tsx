import { FileCodeIcon } from 'lucide-react'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { YAMLTarget } from '@/lib/k8s-yaml'
import { gvkForModule, isClusterScopedModule } from '@/lib/k8s-yaml'

export default function ResourceYAMLSheet({
  target,
  canEdit,
  canDelete,
  canReveal,
  onOpenChange,
  onDeleted,
}: {
  target: YAMLTarget | null
  canEdit?: boolean
  canDelete?: boolean
  canReveal?: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const scoped = target ? (target.clusterScoped ?? isClusterScopedModule(target.module)) : false

  return (
    <Sheet open={target != null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {target ? (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="flex-row items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                <FileCodeIcon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {gvkForModule[target.module]?.split('/').pop() ?? target.module}
                </p>
                <SheetTitle className="truncate" title={target.name}>
                  {target.name}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {scoped ? 'Cluster-scoped' : `Namespace ${target.namespace ?? '—'}`}
                </SheetDescription>
              </div>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <ResourceYAMLEditor
                key={`${target.module}/${target.namespace ?? ''}/${target.name}`}
                canReveal={canReveal}
                module={target.module}
                name={target.name}
                namespace={target.namespace}
                clusterScoped={scoped}
                canEdit={canEdit}
                canDelete={canDelete}
                onDeleted={() => {
                  onDeleted?.()
                  onOpenChange(false)
                }}
              />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
