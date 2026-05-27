import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { getStorageItem, setStorageItem } from '@/db/storage'

type Theme = 'light' | 'dark' | 'sepia' | 'system'
type ResolvedTheme = 'light' | 'dark' | 'sepia'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: ResolvedTheme
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    theme === 'system' ? getSystemTheme() : theme
  )

  const applyTheme = useCallback((t: ResolvedTheme) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.classList.toggle('sepia', t === 'sepia')
    document.documentElement.style.colorScheme = t === 'dark' ? 'dark' : 'light'
    setResolvedTheme(t)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    void setStorageItem('neotavern-theme', t)
    if (t === 'system') {
      applyTheme(getSystemTheme())
    } else {
      applyTheme(t)
    }
  }, [applyTheme])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const saved = await getStorageItem('neotavern-theme')
      if (cancelled || (saved !== 'light' && saved !== 'dark' && saved !== 'sepia' && saved !== 'system')) return
      setThemeState(saved)
      applyTheme(saved === 'system' ? getSystemTheme() : saved)
    })()
    return () => { cancelled = true }
  }, [applyTheme])

  useEffect(() => {
    if (theme === 'system') {
      applyTheme(getSystemTheme())
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme, applyTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
