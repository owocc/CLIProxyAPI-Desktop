import { useState, useEffect } from "react"
import { DesktopService } from "../../bindings/easycliproxyapi/internal/service"

export type Platform = "darwin" | "windows" | "linux"

export function getPlatform(): Platform {
  if (typeof window === "undefined") {
    return "darwin"
  }

  const nav = window.navigator as any
  const platformStr = (nav.userAgentData?.platform || nav.platform || "").toLowerCase()
  const ua = (nav.userAgent || "").toLowerCase()

  if (platformStr.includes("mac") || ua.includes("mac os") || ua.includes("macintosh")) {
    return "darwin"
  }
  if (platformStr.includes("win") || ua.includes("windows")) {
    return "windows"
  }
  if (platformStr.includes("linux") || ua.includes("linux") || ua.includes("x11")) {
    return "linux"
  }

  return "darwin"
}

export interface PlatformInfo {
  platform: Platform
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

export function usePlatform(): PlatformInfo {
  const [platform, setPlatform] = useState<Platform>(getPlatform)

  useEffect(() => {
    let isMounted = true
    DesktopService.GetPlatform()
      .then((os) => {
        if (!isMounted || !os) return
        const normalized = os.toLowerCase()
        if (normalized === "darwin" || normalized === "windows" || normalized === "linux") {
          setPlatform(normalized as Platform)
        }
      })
      .catch(() => {
        // Fallback to synchronously detected platform
      })
    return () => {
      isMounted = false
    }
  }, [])

  return {
    platform,
    isMac: platform === "darwin",
    isWindows: platform === "windows",
    isLinux: platform === "linux",
  }
}
