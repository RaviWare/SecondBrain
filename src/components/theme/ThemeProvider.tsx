'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
type ThemeCtx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }

const Ctx = createContext<ThemeCtx | null>(null)
const STORAGE_KEY = 'sb-theme'

export function ThemeProvider({ children, defaultTheme = 'dark' }: { children: React.ReactNode; defaultTheme?: Theme }) {
  // Initialize state lazily by reading localStorage during the first render
  // on the client. The inline `themeInitScript` in <head> already set
  // `data-theme` on <html> before paint, so this stays in sync without an
  // extra effect-driven cascading re-render.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null
      if (saved === 'dark' || saved === 'light') return saved
    } catch {}
    return defaultTheme
  })

  // Reflect to <html data-theme="">
  // We add a short-lived `.theme-swapping` class so a global CSS rule can
  // animate background/border/color across the whole tree for ~400ms,
  // then we remove it so we don't pay transition cost on hover/focus etc.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.classList.add('theme-swapping')
    const t = window.setTimeout(() => root.classList.remove('theme-swapping'), 450)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
    return () => window.clearTimeout(t)
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

/** Script to run BEFORE paint to prevent theme flash. Inline in <head>. */
export const themeInitScript = `
(function(){try{
  var t = localStorage.getItem('${STORAGE_KEY}');
  if (t !== 'dark' && t !== 'light') t = 'dark';
  document.documentElement.setAttribute('data-theme', t);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();
`
