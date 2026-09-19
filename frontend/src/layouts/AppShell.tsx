import React from "react"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  House,
  Bot,
  Network,
  History,
  Settings,
  PackageOpen,
  Power,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Terminal,
} from "lucide-react"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"

export type AppPageId = "home" | "agents" | "api" | "usage" | "config" | "versions"

interface NavItem {
  id: AppPageId
  label: string
  icon: React.ElementType
  alwaysAvailable?: boolean
}

const navItems: NavItem[] = [
  { id: "home", label: "首页概览", icon: House, alwaysAvailable: true },
  { id: "agents", label: "智能体客户端", icon: Bot, alwaysAvailable: true },
  { id: "api", label: "API 访问", icon: Network, alwaysAvailable: false },
  { id: "usage", label: "用量账本", icon: History, alwaysAvailable: true },
  { id: "config", label: "内核配置", icon: Settings, alwaysAvailable: true },
  { id: "versions", label: "版本管理", icon: PackageOpen, alwaysAvailable: true },
]

interface AppShellProps {
  activePage: AppPageId
  onNavigate: (page: AppPageId) => void
  children: React.ReactNode
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const { status, port, loading, start, stop, restart } = useCoreRuntime()

  const isInstalled = status?.installed ?? false
  const isRunning = status?.running ?? false
  const isReady = status?.ready ?? false
  const isStarting = status?.starting ?? false

  const activeNavItem = navItems.find((item) => item.id === activePage)
  const isLocked = !activeNavItem?.alwaysAvailable && !isReady

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* Sidebar */}
      <aside className="flex flex-col w-56 border-r border-border/40 bg-card/50 backdrop-blur-md">
        {/* Window Draggable Header for macOS traffic lights */}
        <div
          className="h-12 flex items-center px-4 pt-1 border-b border-border/30"
          style={{ WebkitAppRegion: "drag" } as any}
        >
          {/* Traffic light spacer on Mac */}
          <div className="w-16" />
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight text-foreground">
            <Terminal className="size-4 text-primary" />
            <span>EasyCLIProxy</span>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-border/30 text-xs text-muted-foreground/80 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span>核心版本</span>
            <span className="font-mono text-[11px] text-foreground">
              {status?.currentVersion
                ? status.currentVersion.startsWith("v")
                  ? status.currentVersion
                  : `v${status.currentVersion}`
                : "未安装"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>管理端口</span>
            <span className="font-mono text-[11px] text-foreground">{port}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Bar */}
        <header
          className="h-12 border-b border-border/40 bg-card/30 backdrop-blur-md px-6 flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: "drag" } as any}
        >
          {/* Status Indicator */}
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as any}>
            {!isInstalled ? (
              <Badge variant="destructive" className="gap-1.5 font-normal">
                <AlertCircle className="size-3" />
                未安装内核
              </Badge>
            ) : isStarting ? (
              <Badge variant="warning" className="gap-1.5 font-normal animate-pulse">
                <Loader2 className="size-3 animate-spin" />
                启动中...
              </Badge>
            ) : isRunning ? (
              <Badge variant={isReady ? "success" : "warning"} className="gap-1.5 font-normal">
                {isReady ? (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                ) : (
                  <Loader2 className="size-3 animate-spin text-amber-500" />
                )}
                {isReady ? `运行中 (${port})` : "服务启动中"}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                已停止
              </Badge>
            )}

            <span className="text-xs text-muted-foreground truncate max-w-sm">
              {status?.message}
            </span>
          </div>

          {/* Core Controls */}
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as any}>
            {isRunning && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={restart}
                title="重启内核"
                className="gap-1.5 text-xs h-7"
              >
                <RotateCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>重启</span>
              </Button>
            )}

            {!isRunning ? (
              <Button
                variant="default"
                size="sm"
                disabled={loading || !isInstalled}
                onClick={start}
                className="gap-1.5 text-xs h-7"
              >
                <Power className="size-3.5" />
                <span>启动内核</span>
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                disabled={loading}
                onClick={stop}
                className="gap-1.5 text-xs h-7"
              >
                <Power className="size-3.5" />
                <span>停止内核</span>
              </Button>
            )}
          </div>
        </header>

        {/* View container */}
        <main className="flex-1 overflow-y-auto p-6 bg-background/50">
          {isLocked ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground">
                <AlertCircle className="size-6" />
              </div>
              <h2 className="text-lg font-semibold mb-2">需要先启动内核</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                该功能需要访问 CLIProxyAPI 内核的管理端口。请先点击右上角按钮启动内核，并在服务就绪后继续。
              </p>
              <Button onClick={start} disabled={loading || !isInstalled} className="gap-2">
                <Power className="size-4" />
                立即启动内核
              </Button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
