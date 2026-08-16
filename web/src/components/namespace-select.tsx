import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
