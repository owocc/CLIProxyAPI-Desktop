import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { GetGuiConfig, SaveGuiConfig } from "../../bindings/easycliproxyapi/internal/service/configservice"

export type Theme = "system" | "dark" | "light"
export type ResolvedTheme = "dark" | "light"

interface ThemeContextType {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => Promise<void>
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_KEY = "cpa_app_theme"

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark"
  }
  return "light"
}

function applyThemeToDOM(resolved: ResolvedTheme) {
  const root = document.documentElement
  if (resolved === "dark") {
    root.classList.add("dark")
    root.classList.remove("light")
    root.setAttribute("data-theme", "dark")
  } else {
    root.classList.add("light")
    root.classList.remove("dark")
    root.setAttribute("data-theme", "light")
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
      if (stored === "system" || stored === "dark" || stored === "light") {
        return stored
      }
    }
    return "system"
  })

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === "system") {
      return getSystemTheme()
    }
    return theme
  })

  // Sync theme to DOM and localStorage whenever theme changes
  const applyTheme = useCallback((targetTheme: Theme) => {
    const resolved = targetTheme === "system" ? getSystemTheme() : targetTheme
    setResolvedTheme(resolved)
    applyThemeToDOM(resolved)
    try {
      localStorage.setItem(STORAGE_KEY, targetTheme)
    } catch {
      // ignore local storage errors
    }
  }, [])

  // Initial load from backend config
  useEffect(() => {
    let mounted = true
    GetGuiConfig()
      .then((cfg) => {
        if (!mounted || !cfg) return
        const backendTheme = cfg.theme as Theme
        if (backendTheme === "system" || backendTheme === "dark" || backendTheme === "light") {
          setThemeState(backendTheme)
          applyTheme(backendTheme)
        }
      })
      .catch((err) => {
        console.warn("Failed to load theme from backend config:", err)
      })

    return () => {
      mounted = false
    }
  }, [applyTheme])

  // Watch system color scheme changes when in "system" mode
  useEffect(() => {
    applyTheme(theme)

    if (theme !== "system" || typeof window === "undefined") {
      return
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? "dark" : "light"
      setResolvedTheme(newResolved)
      applyThemeToDOM(newResolved)
    }

    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [theme, applyTheme])

  const setTheme = useCallback(
    async (newTheme: Theme) => {
      setThemeState(newTheme)
      applyTheme(newTheme)

      // Persist to backend config asynchronously
      try {
        const cfg = await GetGuiConfig()
        if (cfg && cfg.theme !== newTheme) {
          cfg.theme = newTheme
          await SaveGuiConfig(cfg)
        }
      } catch (err) {
        console.warn("Failed to persist theme to backend config:", err)
      }
    },
    [applyTheme]
  )

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return ctx
}
