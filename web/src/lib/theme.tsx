import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'kubepilot.theme'

type ThemeContextValue = {
  theme: Theme
  resolved: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // ignore
  }
  return 'dark'
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  const root = document.documentElement
  if (root.classList.contains('dark') !== (resolved === 'dark')) {
    root.classList.add('theme-switching')
    root.classList.toggle('dark', resolved === 'dark')
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  }
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1c1c21' : '#f5f5f7')
  return resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => applyTheme(readStoredTheme()))

  useEffect(() => {
    setResolved(applyTheme(theme))
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore quota / private-mode failures
    }
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (theme === 'system') setResolved(applyTheme('system'))
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      resolved,
      setTheme: setThemeState,
    }),
    [theme, resolved],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
