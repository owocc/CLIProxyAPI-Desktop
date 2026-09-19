import { useState, useEffect } from "react"
import { useTheme, type Theme } from "../context/ThemeContext"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Switch } from "../components/ui/switch"
import { Badge } from "../components/ui/badge"
import {
  GetGuiConfig,
  SaveGuiConfig,
} from "../../bindings/easycliproxyapi/internal/service/configservice"
import {
  EnterLightweightMode,
} from "../../bindings/easycliproxyapi/internal/service/desktopservice"
import type { GuiConfigFile } from "../../bindings/easycliproxyapi/internal/model/models"
import {
  Sun,
  Moon,
  Laptop,
  Feather,
  Cpu,
  AppWindow,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Minimize2,
  XCircle,
  Zap,
} from "lucide-react"

export function AppSettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { status, port } = useCoreRuntime()

  const [config, setConfig] = useState<GuiConfigFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enteringLightweight, setEnteringLightweight] = useState(false)

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const cfg = await GetGuiConfig()
      setConfig(cfg)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleUpdateConfig = async (newConfig: GuiConfigFile) => {
    setConfig(newConfig)
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      await SaveGuiConfig(newConfig)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleThemeChange = async (newTheme: Theme) => {
    await setTheme(newTheme)
    if (config) {
      const updated = { ...config, theme: newTheme }
      await handleUpdateConfig(updated)
    }
  }

  const handleEnterLightweightMode = async () => {
    setEnteringLightweight(true)
    try {
      await EnterLightweightMode()
    } catch (err: any) {
      setError(err?.message || String(err))
      setEnteringLightweight(false)
    }
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        正在读取应用设置...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">应用设置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            自定义客户端外观主题、系统菜单栏托盘、轻量模式及桌面运行策略
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500 animate-in fade-in">
              <CheckCircle2 className="size-3.5" />
              已保存并即时生效
            </span>
          )}
          {saving && (
            <span className="text-xs text-muted-foreground animate-pulse">
              正在保存设置...
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              {error}
            </span>
          )}
        </div>
      </div>

      {/* 1. 外观与主题设置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base">外观与主题风格</CardTitle>
                <CardDescription>
                  支持浅色、深色模式及随操作系统自动切换，即时生效
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-normal">
              当前生效: {resolvedTheme === "dark" ? "深色模式" : "浅色模式"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 跟随系统 */}
            <div
              onClick={() => handleThemeChange("system")}
              className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-primary/60 flex flex-col justify-between gap-3 ${
                theme === "system"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/60 bg-card/40 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-muted text-foreground">
                    <Laptop className="size-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">跟随系统</div>
                    <div className="text-xs text-muted-foreground">自动同步系统外观</div>
                  </div>
                </div>
                {theme === "system" && (
                  <CheckCircle2 className="size-4 text-primary" />
                )}
              </div>

              {/* Mini mockup preview */}
              <div className="h-16 w-full rounded-lg border border-border/50 bg-background/50 p-2 flex gap-1.5 overflow-hidden">
                <div className="w-1/4 h-full rounded bg-muted/60" />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="h-2 w-3/4 rounded bg-muted" />
                  <div className="h-full rounded border border-border/40 bg-card/80" />
                </div>
              </div>
            </div>

            {/* 深色模式 */}
            <div
              onClick={() => handleThemeChange("dark")}
              className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-primary/60 flex flex-col justify-between gap-3 ${
                theme === "dark"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/60 bg-card/40 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-900 text-slate-100">
                    <Moon className="size-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">深色模式</div>
                    <div className="text-xs text-muted-foreground">极客沉浸暗黑风格</div>
                  </div>
                </div>
                {theme === "dark" && (
                  <CheckCircle2 className="size-4 text-primary" />
                )}
              </div>

              {/* Mini mockup preview - dark */}
              <div className="h-16 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 flex gap-1.5 overflow-hidden">
                <div className="w-1/4 h-full rounded bg-neutral-900" />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="h-2 w-3/4 rounded bg-neutral-800" />
                  <div className="h-full rounded border border-neutral-800 bg-neutral-900" />
                </div>
              </div>
            </div>

            {/* 浅色模式 */}
            <div
              onClick={() => handleThemeChange("light")}
              className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-primary/60 flex flex-col justify-between gap-3 ${
                theme === "light"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/60 bg-card/40 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-900">
                    <Sun className="size-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">浅色模式</div>
                    <div className="text-xs text-muted-foreground">明亮清晰清爽日间</div>
                  </div>
                </div>
                {theme === "light" && (
                  <CheckCircle2 className="size-4 text-primary" />
                )}
              </div>

              {/* Mini mockup preview - light */}
              <div className="h-16 w-full rounded-lg border border-neutral-300 bg-neutral-50 p-2 flex gap-1.5 overflow-hidden">
                <div className="w-1/4 h-full rounded bg-neutral-200" />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="h-2 w-3/4 rounded bg-neutral-300" />
                  <div className="h-full rounded border border-neutral-200 bg-white" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. 轻量模式与内存优化 (核心亮点) */}
      <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500">
                <Feather className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  轻量模式 (极致节省内存)
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px] font-normal">
                    内存节省达 90%+
                  </Badge>
                </CardTitle>
                <CardDescription>
                  专为长期作为代理服务运行设计：关闭主界面时彻底释放 Web 渲染进程，仅保留轻量内核
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.lightweightMode}
              onCheckedChange={(checked) =>
                handleUpdateConfig({
                  ...config,
                  lightweightMode: checked,
                  closeBehavior: checked ? "lightweight" : config.closeBehavior === "lightweight" ? "minimize-to-tray" : config.closeBehavior,
                })
              }
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Memory comparison visual tile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl border border-border/50 bg-background/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AppWindow className="size-4 text-muted-foreground" />
                  <span>完整界面模式</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  ~150MB - 300MB+
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                加载 WebKit/Chromium 渲染引擎、DOM 树及交互组件，适合进行智能体配置、日志查阅和用量分析。
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <Zap className="size-4" />
                  <span>轻量模式 (单独运行内核)</span>
                </div>
                <Badge variant="success" className="font-mono text-xs">
                  ~15MB - 25MB
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                销毁 WebUI 渲染进程，释放 90% 以上内存。CPA 代理内核在后台高效响应 API 请求，退出程序时安全终止内核。
              </p>
            </div>
          </div>

          {/* Quick action button to enter lightweight mode immediately */}
          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border/30">
            <div className="text-xs text-muted-foreground">
              💡 随时可通过 macOS 菜单栏 / 系统托盘中的 <strong className="text-foreground">“显示主界面”</strong> 瞬间唤醒恢复窗口。
            </div>
            <Button
              size="sm"
              variant="default"
              disabled={enteringLightweight}
              onClick={handleEnterLightweightMode}
              className="gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Feather className="size-3.5" />
              {enteringLightweight ? "正在释放内存..." : "立即进入轻量模式"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. 菜单栏托盘与快捷菜单 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Layers className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base">系统菜单栏托盘</CardTitle>
                <CardDescription>
                  在 macOS 顶部状态栏或 Windows 任务栏右侧常驻图标，提供便捷快捷控制
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.showTrayIcon}
              onCheckedChange={(checked) =>
                handleUpdateConfig({ ...config, showTrayIcon: checked })
              }
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
            <div className="text-sm font-medium flex items-center justify-between">
              <span>托盘快捷菜单包含：</span>
              <span className="text-xs text-muted-foreground font-mono">
                当前内核: {status?.running ? `运行中 (${port})` : "已停止"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-border/40">
                <div className="size-2 rounded-full bg-emerald-500" />
                <span><strong className="text-foreground">内核状态指示</strong>：实时显示内核端口与运行态</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-border/40">
                <div className="size-2 rounded-full bg-primary" />
                <span><strong className="text-foreground">显示主界面</strong>：点击唤醒或重建 Web UI 窗口</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-border/40">
                <div className="size-2 rounded-full bg-amber-500" />
                <span><strong className="text-foreground">启动 / 关闭内核</strong>：无需打开界面一键启停服务</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-border/40">
                <div className="size-2 rounded-full bg-blue-500" />
                <span><strong className="text-foreground">轻量模式切换</strong>：快速切换轻量模式与退出程序</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. 窗口关闭与桌面运行策略 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <AppWindow className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base">窗口关闭行为与运行策略</CardTitle>
              <CardDescription>
                设置点击窗口左上角关闭按钮 (✕) 时的行为逻辑
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 轻量模式 */}
            <div
              onClick={() =>
                handleUpdateConfig({
                  ...config,
                  closeBehavior: "lightweight",
                  lightweightMode: true,
                })
              }
              className={`cursor-pointer rounded-xl border-2 p-3.5 transition-all flex flex-col justify-between gap-2 ${
                config.closeBehavior === "lightweight" || config.lightweightMode
                  ? "border-emerald-500 bg-emerald-500/5 shadow-sm"
                  : "border-border/60 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Feather className="size-4 text-emerald-500" />
                  <span className="font-semibold text-sm">轻量模式 (推荐)</span>
                </div>
                {(config.closeBehavior === "lightweight" || config.lightweightMode) && (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                销毁 WebUI 窗口释放渲染内存，仅保留轻量代理内核在后台运行。
              </p>
            </div>

            {/* 最小化到托盘 */}
            <div
              onClick={() =>
                handleUpdateConfig({
                  ...config,
                  closeBehavior: "minimize-to-tray",
                  lightweightMode: false,
                })
              }
              className={`cursor-pointer rounded-xl border-2 p-3.5 transition-all flex flex-col justify-between gap-2 ${
                config.closeBehavior === "minimize-to-tray" && !config.lightweightMode
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/60 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Minimize2 className="size-4 text-primary" />
                  <span className="font-semibold text-sm">最小化到托盘</span>
                </div>
                {config.closeBehavior === "minimize-to-tray" && !config.lightweightMode && (
                  <CheckCircle2 className="size-4 text-primary" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                隐藏窗口至系统托盘，WebUI 保持驻留内存，呼出时无需重新加载。
              </p>
            </div>

            {/* 退出应用 */}
            <div
              onClick={() =>
                handleUpdateConfig({
                  ...config,
                  closeBehavior: "exit",
                  lightweightMode: false,
                })
              }
              className={`cursor-pointer rounded-xl border-2 p-3.5 transition-all flex flex-col justify-between gap-2 ${
                config.closeBehavior === "exit" && !config.lightweightMode
                  ? "border-destructive bg-destructive/5 shadow-sm"
                  : "border-border/60 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="size-4 text-destructive" />
                  <span className="font-semibold text-sm">直接退出应用</span>
                </div>
                {config.closeBehavior === "exit" && !config.lightweightMode && (
                  <CheckCircle2 className="size-4 text-destructive" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                关闭主窗口时同时退出 EasyCLIProxy 并彻底终止后台内核进程。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. 常规选项 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Cpu className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base">常规与启动项</CardTitle>
              <CardDescription>系统自启与基础偏好</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">开机自动启动</div>
              <div className="text-xs text-muted-foreground">
                登录操作系统时在后台自启 EasyCLIProxy 代理服务
              </div>
            </div>
            <Switch
              checked={config.runOnStartup}
              onCheckedChange={(checked) =>
                handleUpdateConfig({ ...config, runOnStartup: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
