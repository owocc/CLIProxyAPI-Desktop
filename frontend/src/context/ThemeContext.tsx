import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { Events, System } from "@wailsio/runtime"
import { GetGuiConfig, SaveGuiConfig } from "../../bindings/easycliproxyapi/internal/service/configservice"
import { SetWindowTheme } from "../../bindings/easycliproxyapi/internal/service/desktopservice"

export type Theme = "system" | "dark" | "light"
export type ResolvedTheme = "dark" | "light"
export type SidebarStyle = "blur" | "color"

interface ThemeContextType {
  theme: Theme
  resolvedTheme: ResolvedTheme
  sidebarStyle: SidebarStyle
  setTheme: (theme: Theme) => Promise<void>
  setSidebarStyle: (style: SidebarStyle) => Promise<void>
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_KEY = "cpa_app_theme"
const SIDEBAR_STYLE_STORAGE_KEY = "cpa_sidebar_style"

function getFallbackSystemTheme(): ResolvedTheme {
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

function applySidebarStyleToDOM(style: SidebarStyle) {
  const root = document.documentElement
  root.setAttribute("data-sidebar-style", style)
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

  const [sidebarStyle, setSidebarStyleState] = useState<SidebarStyle>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SIDEBAR_STYLE_STORAGE_KEY) as SidebarStyle | null
      if (stored === "blur" || stored === "color") {
        applySidebarStyleToDOM(stored)
        return stored
      }
    }
    applySidebarStyleToDOM("blur")
    return "blur"
  })

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === "system") {
      return getFallbackSystemTheme()
    }
    return theme
  })

  // Keep a ref to the current theme setting to avoid stale closure in event callbacks
  const themeRef = useRef<Theme>(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  // Sync theme to DOM, native window, and localStorage
  const applyTheme = useCallback((targetTheme: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, targetTheme)
    } catch {
      // ignore local storage errors
    }

    if (targetTheme === "system") {
      // Use Wails System.IsDarkMode() as the source of truth, fallback to CSS mediaQuery
      System.IsDarkMode()
        .then((isDark) => {
          const resolved: ResolvedTheme = isDark ? "dark" : "light"
          setResolvedTheme(resolved)
          applyThemeToDOM(resolved)
          SetWindowTheme(resolved).catch(() => {})
        })
        .catch(() => {
          const resolved = getFallbackSystemTheme()
          setResolvedTheme(resolved)
          applyThemeToDOM(resolved)
          SetWindowTheme(resolved).catch(() => {})
        })
    } else {
      setResolvedTheme(targetTheme)
      applyThemeToDOM(targetTheme)
      SetWindowTheme(targetTheme).catch((err) => {
        console.warn("Failed to set native window theme:", err)
      })
    }
  }, [])

  const applySidebarStyle = useCallback((targetStyle: SidebarStyle) => {
    setSidebarStyleState(targetStyle)
    applySidebarStyleToDOM(targetStyle)
    try {
      localStorage.setItem(SIDEBAR_STYLE_STORAGE_KEY, targetStyle)
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

        const backendSidebarStyle = (cfg as any).sidebarStyle as SidebarStyle | undefined
        if (backendSidebarStyle === "blur" || backendSidebarStyle === "color") {
          applySidebarStyle(backendSidebarStyle)
        }
      })
      .catch((err) => {
        console.warn("Failed to load theme/sidebar config from backend:", err)
      })

    return () => {
      mounted = false
    }
  }, [applyTheme, applySidebarStyle])

  // Listen to system appearance changes from both Wails backend events and webview mediaQuery
  useEffect(() => {
    const handleSystemThemeChange = (overrideIsDark?: boolean) => {
      if (themeRef.current !== "system") {
        return // User has chosen an explicit dark or light mode
      }

      if (typeof overrideIsDark === "boolean") {
        const newResolved: ResolvedTheme = overrideIsDark ? "dark" : "light"
        setResolvedTheme(newResolved)
        applyThemeToDOM(newResolved)
        SetWindowTheme(newResolved).catch(() => {})
        return
      }

      // Query authoritative Wails system API
      System.IsDarkMode()
        .then((isDark) => {
          if (themeRef.current !== "system") return
          const newResolved: ResolvedTheme = isDark ? "dark" : "light"
          setResolvedTheme(newResolved)
          applyThemeToDOM(newResolved)
          SetWindowTheme(newResolved).catch(() => {})
        })
        .catch(() => {
          if (themeRef.current !== "system") return
          const newResolved = getFallbackSystemTheme()
          setResolvedTheme(newResolved)
          applyThemeToDOM(newResolved)
          SetWindowTheme(newResolved).catch(() => {})
        })
    }

    // 1. Listen to custom event emitted by Go backend in main.go
    const unbindCustom = Events.On("system-theme-changed", (ev: any) => {
      handleSystemThemeChange(typeof ev?.data === "boolean" ? ev.data : undefined)
    })

    // 2. Listen to Wails runtime standard theme changed events
    const unbindCommon = Events.On("common:ThemeChanged" as any, () => {
      handleSystemThemeChange()
    })
    const unbindMac = Events.On("mac:ApplicationDidChangeTheme" as any, () => {
      handleSystemThemeChange()
    })

    // 3. Client webview mediaQuery listener as supplementary fallback
    let removeMediaQuery: (() => void) | undefined
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
      const mqHandler = (e: MediaQueryListEvent) => {
        handleSystemThemeChange(e.matches)
      }
      mediaQuery.addEventListener("change", mqHandler)
      removeMediaQuery = () => mediaQuery.removeEventListener("change", mqHandler)
    }

    return () => {
      unbindCustom?.()
      unbindCommon?.()
      unbindMac?.()
      removeMediaQuery?.()
    }
  }, [])

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

  const setSidebarStyle = useCallback(
    async (newStyle: SidebarStyle) => {
      applySidebarStyle(newStyle)

      // Persist to backend config asynchronously
      try {
        const cfg = await GetGuiConfig()
        if (cfg && (cfg as any).sidebarStyle !== newStyle) {
          ;(cfg as any).sidebarStyle = newStyle
          await SaveGuiConfig(cfg)
        }
      } catch (err) {
        console.warn("Failed to persist sidebar style to backend config:", err)
      }
    },
    [applySidebarStyle]
  )

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, sidebarStyle, setTheme, setSidebarStyle }}>
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
