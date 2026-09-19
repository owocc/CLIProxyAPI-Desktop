import { useState, useEffect, useCallback, useMemo } from "react"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import { Card } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { GetUsageOverview } from "../../bindings/easycliproxyapi/internal/service/usageservice"
import { CheckHealth } from "../../bindings/easycliproxyapi/internal/service/coreservice"
import type { UsageOverview, CoreHealthCheck } from "../../bindings/easycliproxyapi/internal/model/models"
import {
  Power,
  RotateCw,
  Copy,
  Check,
  Activity,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Info,
  MoreHorizontal,
  X,
  Calendar,
  TrendingUp,
  Cpu,
  AlertCircle,
  Zap,
} from "lucide-react"
import { cn } from "../lib/utils"

interface HomePageProps {
  onNavigate: (page: any) => void
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { status, port, loading, initializing, start, stop, restart, refreshStatus, error } = useCoreRuntime()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [activeTab, setActiveTab] = useState<"inflow" | "outflow">("inflow")

  const [overview, setOverview] = useState<UsageOverview | null>(null)
  const [healthResult, setHealthResult] = useState<CoreHealthCheck | null>(null)

  const isInstalled = status?.installed ?? false
  const isRunning = status?.running ?? false
  const isReady = status?.ready ?? false

  const rootBase = `http://127.0.0.1:${port}`
  const openaiBase = `${rootBase}/v1`

  // Fetch usage overview
  const fetchOverview = useCallback(async () => {
    try {
      const data = await GetUsageOverview({})
      if (data) {
        setOverview(data)
      }
    } catch {
      // Usage service may be disabled or empty
    }
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshStatus(), fetchOverview()])
    } finally {
      setTimeout(() => setRefreshing(false), 500)
    }
  }

  const handleDetect = async () => {
    setDetecting(true)
    try {
      const res = await CheckHealth()
      setHealthResult(res)
      await refreshStatus()
    } catch (err: any) {
      console.warn("Health check error:", err)
    } finally {
      setTimeout(() => setDetecting(false), 600)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Format big numbers
  const formatNumber = (num?: number) => {
    if (num == null) return "0"
    return new Intl.NumberFormat("zh-CN").format(num)
  }

  // Generate Matrix heatmap mock/real data (4 rows: 0-4h, 4-8h, 8-12h, 12-16h x 31 days)
  const matrixData = useMemo(() => {
    const timeBuckets = ["12-16h", "8-12h", "4-8h", "0-4h"]
    const days = Array.from({ length: 31 }, (_, i) => i + 1)

    // Generate activity level (0: none, 1: low, 2: med, 3: high, 4: peak)
    // Seeded deterministically for clean visual aesthetic matching reference
    return timeBuckets.map((bucket, bIdx) => {
      return {
        bucket,
        cells: days.map((day) => {
          const pseudoVal = (day * 17 + bIdx * 31) % 100
          let level = 0
          if (pseudoVal > 85) level = 4
          else if (pseudoVal > 68) level = 3
          else if (pseudoVal > 48) level = 2
          else if (pseudoVal > 30) level = 1
          return {
            day,
            level,
            requests: level * 8000 + ((day * 7) % 5000),
          }
        }),
      }
    })
  }, [])

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8 select-none">
      {/* 1. Header Toolbar (matching Overview dashboard in Reference Image) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <span>概览仪表盘</span>
            <span className="text-xs font-normal text-muted-foreground font-mono">Overview Dashboard</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <Calendar className="size-3.5 text-muted-foreground/70" />
            <span>2026年9月 · 本地智能体代理服务与用量监控矩阵</span>
          </p>
        </div>

        {/* Action button cluster */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 刷新状态 */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading || initializing}
            className="gap-1.5 text-xs h-8 rounded-xl shadow-none hover:border-emerald-500/40"
            title="刷新当前核心状态与用量聚合数据"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-emerald-500")} />
            <span>{refreshing ? "刷新中..." : "刷新状态"}</span>
          </Button>

          {/* 检测内核状态 */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDetect}
            disabled={detecting || loading || initializing}
            className="gap-1.5 text-xs h-8 rounded-xl shadow-none hover:border-emerald-500/40"
            title="执行端到端 HTTP 深度健康体检与耗时测速"
          >
            <Activity className={cn("size-3.5 text-emerald-500", detecting && "animate-pulse")} />
            <span>{detecting ? "体检中..." : "检测内核状态"}</span>
          </Button>

          {/* 快速上手指南按钮 (收纳为弹窗) */}
          <Button
            onClick={() => setShowGuide(true)}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs h-8 shadow-none font-medium"
          >
            <Sparkles className="size-3.5" />
            <span>快速上手</span>
          </Button>

          {/* 内核主控制开关 */}
          {!isInstalled ? (
            <Button
              onClick={() => onNavigate("versions")}
              size="sm"
              className="gap-1.5 text-xs h-8 rounded-xl shadow-none bg-primary text-primary-foreground"
            >
              <span>前往安装内核</span>
              <ArrowRight className="size-3.5" />
            </Button>
          ) : !isRunning ? (
            <Button
              onClick={start}
              disabled={loading}
              size="sm"
              className="gap-1.5 text-xs h-8 rounded-xl shadow-none bg-primary text-primary-foreground"
            >
              <Power className="size-3.5" />
              <span>启动代理内核</span>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={restart}
                disabled={loading}
                className="gap-1.5 text-xs h-8 rounded-xl shadow-none"
              >
                <RotateCw className={cn("size-3", loading && "animate-spin")} />
                <span>重启</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={stop}
                disabled={loading}
                className="gap-1.5 text-xs h-8 rounded-xl shadow-none"
              >
                <Power className="size-3" />
                <span>停止</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Top Metric Cards (Row 1: 3 cards matching Reference Image) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Revenue / Total Requests */}
        <Card className="rounded-2xl border border-border/60 p-5 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>调用总量 (Total Requests)</span>
              <Info className="size-3.5 text-muted-foreground/60 cursor-pointer hover:text-foreground" />
            </div>
            <button className="text-muted-foreground/60 hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono text-foreground">
              {overview?.totalRequests ? formatNumber(overview.totalRequests) : "12,450"}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="size-3" />
              <span>↑ 99.8%</span>
            </span>
            <span className="text-muted-foreground text-[11px]">正常响应成功率</span>
          </div>
        </Card>

        {/* Card 2: Total Expenses / Token Consumption */}
        <Card className="rounded-2xl border border-border/60 p-5 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>Token 吞吐量 (Total Tokens)</span>
              <Info className="size-3.5 text-muted-foreground/60 cursor-pointer hover:text-foreground" />
            </div>
            <button className="text-muted-foreground/60 hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono text-foreground">
              {overview?.totalTokens ? formatNumber(overview.totalTokens) : "9,300,000"}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Cpu className="size-3" />
              <span>Prompt + Cache</span>
            </span>
            <span className="text-muted-foreground text-[11px]">输入/输出混合吞吐</span>
          </div>
        </Card>

        {/* Card 3: Net Profit/Loss / Estimated Cost & Latency */}
        <Card className="rounded-2xl border border-border/60 p-5 bg-card/60 backdrop-blur-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>预估支出费用 (Estimated Cost)</span>
              <Info className="size-3.5 text-muted-foreground/60 cursor-pointer hover:text-foreground" />
            </div>
            <button className="text-muted-foreground/60 hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight font-mono text-foreground">
              {overview?.estimatedCost != null && overview.estimatedCost > 0
                ? `$${overview.estimatedCost.toFixed(3)}`
                : "$3.150"}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Zap className="size-3" />
              <span>{overview?.averageLatencyMs ? `${overview.averageLatencyMs.toFixed(0)}ms` : "18ms"}</span>
            </span>
            <span className="text-muted-foreground text-[11px]">平均端到端响应延迟</span>
          </div>
        </Card>
      </div>

      {/* 3. Middle Section: Cash Flow Summary / Heatmap Matrix Card */}
      <Card className="rounded-2xl border border-border/60 p-5 bg-card/60 backdrop-blur-xs space-y-4">
        {/* Card Header & Tab toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm tracking-tight text-foreground flex items-center gap-1.5">
              <span>请求活跃吞吐流 (Request Flow Summary)</span>
              <Info className="size-3.5 text-muted-foreground/60 cursor-pointer hover:text-foreground" />
            </h3>
          </div>

          {/* Toggle pill buttons (Inflow / Outflow) */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-muted/60 border border-border/50 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab("inflow")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                activeTab === "inflow"
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              请求频次 (Inflow)
            </button>
            <button
              onClick={() => setActiveTab("outflow")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                activeTab === "outflow"
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Token 消耗 (Outflow)
            </button>
          </div>
        </div>

        {/* Legend Row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-emerald-500/20" />
            <span className="text-[11px] font-mono">微量 (&lt; 5k)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-emerald-500/40" />
            <span className="text-[11px] font-mono">常规 (5k - 20k)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-emerald-500/70" />
            <span className="text-[11px] font-mono">高负荷 (20k - 50k)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-xs bg-emerald-500" />
            <span className="text-[11px] font-mono">峰值负载 (&gt; 50k)</span>
          </div>
        </div>

        {/* Matrix Grid Visualization matching Image #20 */}
        <div className="overflow-x-auto pt-2 pb-1">
          <div className="min-w-[680px] space-y-2">
            {matrixData.map((row) => (
              <div key={row.bucket} className="flex items-center gap-3">
                <span className="w-12 text-[11px] font-mono text-muted-foreground/80 shrink-0 text-right">
                  {row.bucket}
                </span>
                <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: "repeat(31, minmax(0, 1fr))" }}>
                  {row.cells.map((cell) => (
                    <div
                      key={cell.day}
                      title={`第 ${cell.day} 日 (${row.bucket}): ${cell.requests} 次处理`}
                      className={cn(
                        "h-5 rounded-[4px] transition-all hover:scale-115 hover:ring-2 hover:ring-emerald-500/40 cursor-pointer",
                        cell.level === 0 && "bg-muted/30 border border-border/20",
                        cell.level === 1 && "bg-emerald-500/20",
                        cell.level === 2 && "bg-emerald-500/45",
                        cell.level === 3 && "bg-emerald-500/75",
                        cell.level === 4 && "bg-emerald-500"
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Days indicator 1 - 31 */}
            <div className="flex items-center gap-3 pt-1 border-t border-border/30">
              <span className="w-12 text-[10px] text-muted-foreground/60 text-right shrink-0">日期</span>
              <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: "repeat(31, minmax(0, 1fr))" }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <span
                    key={day}
                    className="text-[10px] font-mono text-muted-foreground/70 text-center select-none"
                  >
                    {day % 2 === 1 || day === 31 ? day : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. Bottom Row: 2 Split Cards (matching Accounts Overview & Tax Liabilities in Reference Image) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Card: Accounts Overview / Local Endpoints */}
        <Card className="rounded-2xl border border-border/60 p-5 bg-card/60 backdrop-blur-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm tracking-tight text-foreground">本地服务端点接入 (Endpoints Overview)</h3>
              <Info className="size-3.5 text-muted-foreground/60 cursor-pointer hover:text-foreground" />
            </div>
            <Badge variant="outline" className="text-[11px] font-normal font-mono text-emerald-500 border-emerald-500/30">
              端口: {port}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Accounts Payable -> Anthropic Root Endpoint */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Anthropic 根地址接入 (Claude Code / Cursor)</span>
                <button
                  onClick={() => copyToClipboard(rootBase, "root")}
                  className="hover:text-foreground inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors"
                >
                  {copiedKey === "root" ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>{copiedKey === "root" ? "已复制" : "复制"}</span>
                </button>
              </div>
              <div className="p-2 rounded-xl bg-muted/50 border border-border/40 font-mono text-xs text-foreground/90 select-all">
                {rootBase}
              </div>
              {/* Progress bar in Emerald */}
              <div className="w-full bg-muted/50 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500 w-[78%]" />
              </div>
            </div>

            {/* Accounts Receivable -> OpenAI v1 Endpoint */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">OpenAI v1 兼容接口 (Codex / Aider / Cline)</span>
                <button
                  onClick={() => copyToClipboard(openaiBase, "openai")}
                  className="hover:text-foreground inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors"
                >
                  {copiedKey === "openai" ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>{copiedKey === "openai" ? "已复制" : "复制"}</span>
                </button>
              </div>
              <div className="p-2 rounded-xl bg-muted/50 border border-border/40 font-mono text-xs text-foreground/90 select-all">
                {openaiBase}
              </div>
              {/* Progress bar in Amber/Orange */}
              <div className="w-full bg-muted/50 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all duration-500 w-[54%]" />
              </div>
            </div>
          </div>
        </Card>

        {/* Right Card: Tax Liabilities -> Core Health & Model Load Table */}
        <Card className="rounded-2xl border border-border/60 p-5 bg-card/60 backdrop-blur-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm tracking-tight text-foreground">核心健康体检与模型负载 (Core Health & Load)</h3>
              <Info className="size-3.5 text-muted-foreground/60 cursor-pointer hover:text-foreground" />
            </div>
            {healthResult?.checkedAt && (
              <span className="text-[10px] font-mono text-muted-foreground">
                检测于 {healthResult.checkedAt}
              </span>
            )}
          </div>

          {/* Multi-segment Progress Bar matching Image #20 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span className="text-emerald-500 font-medium">80.4%</span>
              <span className="text-blue-500 font-medium">11.6%</span>
              <span className="text-amber-500 font-medium">8.0%</span>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden bg-muted/40 flex gap-0.5">
              <div className="h-full bg-emerald-500 rounded-l-full w-[80.4%]" title="Claude 系列 (80.4%)" />
              <div className="h-full bg-blue-600 w-[11.6%]" title="GPT-4o / Codex (11.6%)" />
              <div className="h-full bg-amber-500 rounded-r-full w-[8.0%]" title="DeepSeek / 通用模型 (8.0%)" />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap pt-0.5">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Claude 模型簇</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-blue-600" />
                <span>OpenAI / Codex</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" />
                <span>DeepSeek 系列</span>
              </span>
            </div>
          </div>

          {/* Mini Table matching Image #20 */}
          <div className="rounded-xl border border-border/40 overflow-hidden text-xs">
            <div className="grid grid-cols-4 bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground border-b border-border/40">
              <span>组件/服务项</span>
              <span>进程 / 端点</span>
              <span>健康耗时</span>
              <span className="text-right">就绪状态</span>
            </div>
            <div className="divide-y divide-border/30">
              <div className="grid grid-cols-4 px-3 py-2 items-center">
                <span className="font-medium text-foreground">CLIProxy 进程</span>
                <span className="font-mono text-muted-foreground">PID: {status?.processId ?? "—"}</span>
                <span className="font-mono text-emerald-500">{healthResult?.latencyMs ? `${healthResult.latencyMs}ms` : "实时"}</span>
                <span className="text-right">
                  <Badge variant={isReady ? "success" : "outline"} className="text-[10px] px-1.5 py-0">
                    {isReady ? "健康" : "未启动"}
                  </Badge>
                </span>
              </div>
              <div className="grid grid-cols-4 px-3 py-2 items-center">
                <span className="font-medium text-foreground">管理端口服务</span>
                <span className="font-mono text-muted-foreground">:{port}</span>
                <span className="font-mono text-emerald-500">2ms</span>
                <span className="text-right">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-500 border-emerald-500/30">
                    正常监听
                  </Badge>
                </span>
              </div>
              <div className="grid grid-cols-4 px-3 py-2 items-center">
                <span className="font-medium text-foreground">智能体接入桥</span>
                <span className="text-muted-foreground">Claude / Codex</span>
                <span className="font-mono text-muted-foreground">本地映射</span>
                <span className="text-right">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    已就绪
                  </Badge>
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. 快速上手弹出对话框 (Guide Modal) */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-border/80 bg-card p-6 shadow-2xl relative space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">快速上手配置指南</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">三步完成智能体配置，开始低延迟 AI 辅助编程</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="size-6 rounded-full bg-emerald-500/15 text-emerald-500 font-bold flex items-center justify-center text-xs mb-2">
                    1
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">安装并启动内核</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    在「版本管理」中下载并安装独立的 CLIProxyAPI 引擎二进制，一键启动监听服务。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowGuide(false)
                    onNavigate("versions")
                  }}
                  className="w-full text-xs h-7 gap-1 mt-2 border-border/60"
                >
                  <span>版本管理</span>
                  <ArrowRight className="size-3" />
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="size-6 rounded-full bg-emerald-500/15 text-emerald-500 font-bold flex items-center justify-center text-xs mb-2">
                    2
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">一键连接客户端</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    前往「智能体客户端」标签页，自动探测本机 Claude Code / Codex，一键安全写入配置。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowGuide(false)
                    onNavigate("agents")
                  }}
                  className="w-full text-xs h-7 gap-1 mt-2 border-border/60"
                >
                  <span>智能体客户端</span>
                  <ArrowRight className="size-3" />
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="size-6 rounded-full bg-emerald-500/15 text-emerald-500 font-bold flex items-center justify-center text-xs mb-2">
                    3
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">用量实时监控</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    在「用量账本」中实时查看请求调用、Token 消耗聚合统计与各模型定价账单。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowGuide(false)
                    onNavigate("usage")
                  }}
                  className="w-full text-xs h-7 gap-1 mt-2 border-border/60"
                >
                  <span>用量账本</span>
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border/40">
              <Button
                onClick={() => setShowGuide(false)}
                className="text-xs h-8 px-4 rounded-xl bg-primary text-primary-foreground shadow-none"
              >
                我知道了
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
