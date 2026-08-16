import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { ActionTooltip } from '@/components/icon-action-button'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Theme, useTheme } from '@/lib/theme'

const options: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <ActionTooltip label="Theme">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Theme">
            <SunIcon className="dark:hidden" />
            <MoonIcon className="hidden dark:block" />
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
