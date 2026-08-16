import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { YAMLTarget } from '@/lib/k8s-yaml'
import { isClusterScopedModule } from '@/lib/k8s-yaml'

export default function ResourceYAMLSheet({
  target,
  canEdit,
  canDelete,
  onOpenChange,
  onDeleted,
}: {
  target: YAMLTarget | null
  canEdit?: boolean
  canDelete?: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const scoped = target ? (target.clusterScoped ?? isClusterScopedModule(target.module)) : false

  return (
    <Sheet open={target != null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton
      >
        {target ? (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b">
              <SheetTitle className="font-mono text-sm">
                YAML: {target.module}/{target.name}
              </SheetTitle>
              <SheetDescription>
                {scoped ? 'Cluster-scoped resource' : `Namespace ${target.namespace ?? '—'}`}
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <ResourceYAMLEditor
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
