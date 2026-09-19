import { useState } from "react"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import {
  Power,
  RotateCw,
  Copy,
  Check,
  FolderOpen,
  Activity,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react"

interface HomePageProps {
  onNavigate: (page: any) => void
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { status, port, loading, initializing, start, stop, restart, error } = useCoreRuntime()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const isInstalled = status?.installed ?? false
  const isRunning = status?.running ?? false
  const isReady = status?.ready ?? false

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const rootBase = `http://127.0.0.1:${port}`
  const openaiBase = `${rootBase}/v1`

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner / Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CPA 代理控制台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            高性能 AI CLI 代理内核管理与智能体一键接入中枢
          </p>
        </div>

        <div className="flex items-center gap-2">
          {initializing ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-2 shadow-sm text-xs"
            >
              <RefreshCw className="size-3.5 animate-spin text-primary" />
              检测服务中...
            </Button>
          ) : !isInstalled ? (
            <Button
              onClick={() => onNavigate("versions")}
              className="gap-2 shadow-sm"
            >
              前往安装内核
              <ArrowRight className="size-4" />
            </Button>
          ) : !isRunning ? (
            <Button
              onClick={start}
              disabled={loading}
              className="gap-2 shadow-sm"
            >
              <Power className="size-4" />
              启动代理内核
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={restart}
                disabled={loading}
                className="gap-1.5"
              >
                <RotateCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                重启服务
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={stop}
                disabled={loading}
                className="gap-1.5"
              >
                <Power className="size-3.5" />
                停止服务
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Primary Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                <span>内核运行状态</span>
              </CardTitle>
              {initializing ? (
                <Badge variant="outline" className="px-2.5 py-1 text-muted-foreground animate-pulse gap-1.5">
                  <RefreshCw className="size-3 animate-spin text-primary" />
                  正在检测服务...
                </Badge>
              ) : isReady ? (
                <Badge variant="success" className="px-2.5 py-1">
                  服务正常就绪
                </Badge>
              ) : isRunning ? (
                <Badge variant="warning" className="px-2.5 py-1">
                  进程启动中
                </Badge>
              ) : isInstalled ? (
                <Badge variant="outline" className="px-2.5 py-1 text-muted-foreground">
                  已停止
                </Badge>
              ) : (
                <Badge variant="destructive" className="px-2.5 py-1">
                  未安装内核
                </Badge>
              )}
            </div>
            <CardDescription>{initializing ? "正在探测代理内核运行状态与监听端口..." : status?.message}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">监听端口</span>
                <span className="font-mono text-base font-semibold">{port}</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">进程 PID</span>
                <span className="font-mono text-base font-semibold">
                  {status?.processId ?? "—"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">已装版本</span>
                <span className="font-mono text-base font-semibold">
                  {status?.currentVersion
                    ? status.currentVersion.startsWith("v")
                      ? status.currentVersion
                      : `v${status.currentVersion}`
                    : "无"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">托管方式</span>
                <span className="text-base font-semibold">
                  {status?.managed ? "主控子进程" : isRunning ? "外部发现" : "—"}
                </span>
              </div>
            </div>

            {status?.binaryPath && (
              <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t border-border/40">
                <FolderOpen className="size-3.5 shrink-0" />
                <span className="truncate" title={status.binaryPath}>
                  {status.binaryPath}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Connection Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">本地服务端点</CardTitle>
            <CardDescription>客户端直连所使用的本地接口</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>根地址 (Anthropic 等)</span>
                <button
                  onClick={() => copyToClipboard(rootBase, "root")}
                  className="hover:text-foreground inline-flex items-center gap-1"
                >
                  {copiedKey === "root" ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>复制</span>
                </button>
              </div>
              <div className="p-2 rounded bg-muted/60 font-mono text-xs select-all break-all">
                {rootBase}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>OpenAI Compatible (v1)</span>
                <button
                  onClick={() => copyToClipboard(openaiBase, "openai")}
                  className="hover:text-foreground inline-flex items-center gap-1"
                >
                  {copiedKey === "openai" ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>复制</span>
                </button>
              </div>
              <div className="p-2 rounded bg-muted/60 font-mono text-xs select-all break-all">
                {openaiBase}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Guide / Onboarding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            快速上手指南
          </CardTitle>
          <CardDescription>三步完成智能体配置，开始低延迟 AI 编程</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-border/50 bg-card/40 space-y-2">
              <div className="size-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                1
              </div>
              <h4 className="font-medium text-sm">安装并启动内核</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                在「版本管理」中下载并安装最新的 CLIProxyAPI 独立二进制，然后启动内核。
              </p>
            </div>

            <div className="p-4 rounded-lg border border-border/50 bg-card/40 space-y-2">
              <div className="size-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                2
              </div>
              <h4 className="font-medium text-sm">一键连接客户端</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                前往「智能体客户端」标签页，自动探测本机 Claude Code / Codex，一键安全写入配置。
              </p>
            </div>

            <div className="p-4 rounded-lg border border-border/50 bg-card/40 space-y-2">
              <div className="size-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                3
              </div>
              <h4 className="font-medium text-sm">开始使用与监控</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                在「用量账本」中实时查看请求调用、Token 消耗聚合统计与各模型定价账单。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
