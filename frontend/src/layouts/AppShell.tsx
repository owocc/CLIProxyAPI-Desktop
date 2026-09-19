import React from "react"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import { useTheme } from "../context/ThemeContext"
import { usePlatform } from "../lib/platform"
import {
  House,
  Bot,
  KeyRound,
  Network,
  History,
  Settings,
  PackageOpen,
  Power,
  AlertCircle,
  SlidersHorizontal,
  Sun,
  Moon,
  Lock,
  RefreshCw,
} from "lucide-react"
import { Button } from "../components/ui/button"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "../components/ui/sidebar"
import { cn } from "../lib/utils"

export type AppPageId = "home" | "agents" | "oauth" | "api" | "usage" | "config" | "settings" | "versions"

interface NavItem {
  id: AppPageId
  label: string
  icon: React.ElementType
  alwaysAvailable?: boolean
}

const navItems: NavItem[] = [
  { id: "home", label: "首页概览", icon: House, alwaysAvailable: true },
  { id: "agents", label: "智能体客户端", icon: Bot, alwaysAvailable: true },
  { id: "oauth", label: "OAuth 凭据", icon: KeyRound, alwaysAvailable: false },
  { id: "api", label: "API 接入", icon: Network, alwaysAvailable: false },
  { id: "usage", label: "用量账本", icon: History, alwaysAvailable: true },
  { id: "config", label: "内核配置", icon: Settings, alwaysAvailable: true },
  { id: "settings", label: "应用设置", icon: SlidersHorizontal, alwaysAvailable: true },
  { id: "versions", label: "版本管理", icon: PackageOpen, alwaysAvailable: true },
]

interface AppShellProps {
  activePage: AppPageId
  onNavigate: (page: AppPageId) => void
  children: React.ReactNode
}

function AppShellContent({ activePage, onNavigate, children }: AppShellProps) {
  const { status, port, loading, initializing, start } = useCoreRuntime()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { isMac, isWindows } = usePlatform()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const isInstalled = status?.installed ?? false
  const isReady = status?.ready ?? false

  const activeNavItem = navItems.find((item) => item.id === activePage)
  const isLocked = !activeNavItem?.alwaysAvailable && !isReady

  return (
    <>
      {/* 始终绝对固定在左侧的单个侧边栏开关按钮（Ghostty 风格，零位移） */}
      <div
        className={cn(
          "fixed top-0 z-30 h-[52px] flex items-center pointer-events-none select-none",
          isMac ? "left-[96px]" : "left-3"
        )}
      >
        <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties} className="pointer-events-auto">
          <SidebarTrigger
            title={isCollapsed ? "展开侧边栏 (Cmd+B / Ctrl+B)" : "收起侧边栏 (Cmd+B / Ctrl+B)"}
            className="size-7 rounded-[6px] text-muted-foreground/80 hover:text-foreground hover:bg-foreground/10 active:bg-foreground/15 active:scale-95 transition-all"
          />
        </div>
      </div>

      {/* Shadcn Sidebar with Multi-platform Safe Area Adaptation (fully hidden when collapsed) */}
      <Sidebar collapsible="offcanvas" variant="sidebar">
        {/* 顶部安全区与拖拽手柄：高度与主内容区头部一致 (52px)，macOS 下避开交通灯 */}
        <SidebarHeader
          className={cn(
            "h-[52px] shrink-0 justify-center select-none",
            isMac ? "pl-20 pr-3" : "px-3"
          )}
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="h-full w-full" />
        </SidebarHeader>

        {/* Navigation items */}
        <SidebarContent className="pt-1">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activePage === item.id
                  const isItemDisabled = !item.alwaysAvailable && !isReady && !initializing

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                          "relative transition-all",
                          isItemDisabled && !isActive && "opacity-60"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {isItemDisabled && (
                          <Lock className="size-3 ml-auto text-muted-foreground/60 shrink-0" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Sidebar Footer with Core status & Port */}
        <SidebarFooter>
          <div className="flex flex-col gap-1 text-xs text-sidebar-foreground/70 px-1 py-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-sidebar-foreground/60">核心版本</span>
              <span className="font-mono text-[11px] text-sidebar-foreground font-medium">
                {status?.currentVersion
                  ? status.currentVersion.startsWith("v")
                    ? status.currentVersion
                    : `v${status.currentVersion}`
                  : "未安装"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-sidebar-foreground/60">管理端口</span>
              <span className="font-mono text-[11px] text-sidebar-foreground font-medium">
                {port}
              </span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="relative h-screen w-full overflow-hidden">
        {/* 主内容区专属浮动头部：毛玻璃渐变蒙版严格限制在主内容区内部，绝不污染侧边栏分割线 */}
        <header
          className={cn(
            "absolute top-0 left-0 right-0 z-20 h-[52px] flex items-center justify-between select-none pointer-events-auto transition-all duration-200",
            isCollapsed ? (isMac ? "pl-[136px] pr-4" : "pl-12 pr-4") : "pl-4 pr-4",
            isWindows && "pr-5"
          )}
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {/* 苹果风格毛玻璃背景与渐变遮罩：仅在主内容区顶部生效 */}
          <div
            className="absolute inset-0 -z-10 bg-background/80 backdrop-blur-sm pointer-events-none transition-all"
            style={{
              WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 65%, rgba(0,0,0,0) 100%)",
              maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 65%, rgba(0,0,0,0) 100%)",
            }}
          />

          {/* 中间窗口拖拽区域 */}
          <div className="flex-1 h-full" />

          {/* 右侧全局控件（主题切换） */}
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              title={`当前主题: ${theme === "system" ? "跟随系统" : theme === "dark" ? "深色模式" : "浅色模式"}，点击快速切换`}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              {resolvedTheme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
            </Button>
          </div>
        </header>

        {/* View container occupying full visible height */}
        <main
          className={cn(
            "h-full w-full overflow-y-auto px-6 pb-6 bg-background/50",
            (isLocked || (initializing && !activeNavItem?.alwaysAvailable)) ? "pt-[52px] flex items-center justify-center" : "pt-[60px]"
          )}
        >
          {initializing && !activeNavItem?.alwaysAvailable ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-200">
              <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground">
                <RefreshCw className="size-6 animate-spin text-primary" />
              </div>
              <h2 className="text-base font-semibold mb-1">正在检测服务状态</h2>
              <p className="text-xs text-muted-foreground max-w-sm">
                正在检测代理内核运行状态与端口...
              </p>
            </div>
          ) : isLocked ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-200">
              <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground">
                <AlertCircle className="size-6" />
              </div>
              <h2 className="text-lg font-semibold mb-2">需要先启动内核</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                该功能需要访问 CLIProxyAPI 内核的管理端口。请先启动内核并在服务就绪后继续。
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
      </SidebarInset>
    </>
  )
}

export function AppShell(props: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppShellContent {...props} />
    </SidebarProvider>
  )
}
