import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const ALL_NAMESPACES = '__all__'

export function isAllNamespaces(value: string): boolean {
  return value === ALL_NAMESPACES || value === ''
}

export function resolveNamespaceValue(prev: string, namespaces: string[]): string {
  if (isAllNamespaces(prev) || namespaces.includes(prev)) {
    return isAllNamespaces(prev) ? ALL_NAMESPACES : prev
  }
  return ALL_NAMESPACES
}

export function NamespaceSelect({
  namespaces,
  value,
  onChange,
}: {
  namespaces: string[]
  value: string
  onChange: (value: string) => void
}) {
  if (namespaces.length === 0) {
    return null
  }
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="namespace" className="text-xs text-muted-foreground">
        Namespace
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="namespace" size="sm" className="min-w-36">
          <SelectValue placeholder="Select namespace" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_NAMESPACES}>All</SelectItem>
          {namespaces.map((ns) => (
            <SelectItem key={ns} value={ns}>
              {ns}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
