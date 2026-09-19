import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { Events } from "@wailsio/runtime"
import {
  GetStatus,
  StartCore,
  StopCore,
  RestartCore,
  CheckLatestCore,
  InstallCoreVersion,
  CancelCoreInstall,
  GetCoreInstallTask,
  GetCorePort,
} from "../../bindings/easycliproxyapi/internal/service/coreservice"
import type {
  CoreStatus,
  CoreInstallTask,
  ReleaseInfo,
} from "../../bindings/easycliproxyapi/internal/model/models"

interface CoreRuntimeContextType {
  status: CoreStatus | null
  installTask: CoreInstallTask | null
  port: number
  loading: boolean
  initializing: boolean
  error: string | null
  refreshStatus: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  checkLatest: (source: string) => Promise<ReleaseInfo | null>
  installVersion: (version: string, source: string) => Promise<void>
  cancelInstall: () => Promise<void>
}

const CoreRuntimeContext = createContext<CoreRuntimeContextType | null>(null)

export function CoreRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CoreStatus | null>(null)
  const [installTask, setInstallTask] = useState<CoreInstallTask | null>(null)
  const [port, setPort] = useState<number>(8317)
  const [loading, setLoading] = useState<boolean>(false)
  const [initializing, setInitializing] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        GetStatus().catch((err) => {
          console.error("Failed to get core status:", err)
          return null
        }),
        GetCorePort().catch(() => 8317),
      ])
      if (s) {
        setStatus(s)
      }
      if (p) {
        setPort(p)
      }
      setError(null)
    } catch (err: any) {
      console.error("Failed to refresh core status:", err)
      setError(err?.message || String(err))
    } finally {
      setInitializing(false)
    }
  }, [])

  useEffect(() => {
    refreshStatus()

    // Listen to real-time events from Go backend
    const unbindStatus = Events.On("core-status-changed", (ev: any) => {
      if (ev?.data) {
        setStatus(ev.data)
        setInitializing(false)
      }
    })

    const unbindInstall = Events.On("core-install-progress", (ev: any) => {
      if (ev?.data) {
        setInstallTask(ev.data)
      }
    })

    // Periodic heartbeat sync (fallback)
    const timer = setInterval(() => {
      refreshStatus()
    }, 4000)

    return () => {
      unbindStatus()
      unbindInstall()
      clearInterval(timer)
    }
  }, [refreshStatus])

  const start = async () => {
    setLoading(true)
    setError(null)
    try {
      await StartCore()
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message || String(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const stop = async () => {
    setLoading(true)
    setError(null)
    try {
      await StopCore()
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message || String(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const restart = async () => {
    setLoading(true)
    setError(null)
    try {
      await RestartCore()
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message || String(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const checkLatest = async (source: string) => {
    try {
      return await CheckLatestCore(source)
    } catch (err: any) {
      setError(err?.message || String(err))
      throw err
    }
  }

  const installVersion = async (version: string, source: string) => {
    setError(null)
    try {
      await InstallCoreVersion(version, source)
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message || String(err))
      throw err
    }
  }

  const cancelInstall = async () => {
    try {
      await CancelCoreInstall()
      const t = await GetCoreInstallTask()
      setInstallTask(t)
    } catch (err: any) {
      setError(err?.message || String(err))
      throw err
    }
  }

  return (
    <CoreRuntimeContext.Provider
      value={{
        status,
        installTask,
        port,
        loading,
        initializing,
        error,
        refreshStatus,
        start,
        stop,
        restart,
        checkLatest,
        installVersion,
        cancelInstall,
      }}
    >
      {children}
    </CoreRuntimeContext.Provider>
  )
}

export function useCoreRuntime() {
  const context = useContext(CoreRuntimeContext)
  if (!context) {
    throw new Error("useCoreRuntime must be used within a CoreRuntimeProvider")
  }
  return context
}
