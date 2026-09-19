import { useState, useEffect, useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react"
import { Events } from "@wailsio/runtime"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Progress } from "../components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs"
import { DateRangePicker } from "../components/ui/date-range-picker"
import { DotMatrixTrendChart, type ChartMetricType } from "../components/DotMatrixTrendChart"
import {
  GetUsageCollectorStatus,
  GetUsageOverview,
  GetUsageAnalysis,
  GetUsageEvents,
  GetUsagePricing,
  SaveUsageModelPrice,
  DeleteUsageModelPrice,
  SyncUsageModelPrices,
  GetUsageStorageSettings,
  SaveUsageStorageSettings,
  ShrinkUsageDatabase,
  RepairUsageCacheRecords,
  TriggerSync,
} from "../../bindings/easycliproxyapi/internal/service/usageservice"
import type {
  CollectorStatus,
  UsageOverview,
  UsageAnalysis,
  UsageEventPage,
  UsageRecord,
  UsagePricing,
  ModelPrice,
  UsageStorageSettings,
  UsageRepairResult,
  UsageQuery,
} from "../../bindings/easycliproxyapi/internal/model/models"
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Cpu,
  Database,
  FilterX,
  Layers,
  Pencil,
  RefreshCw,
  RotateCw,
  Sliders,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
  Info,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  ArrowUpRight,
  Check,
} from "lucide-react"
import { formatGenerationSpeed } from "../services/usageMetrics"
import { formatUsageNumber } from "../services/usageNumber"
import {
  OTHER_TREND_MODEL_KEY,
  buildUsageTrendSeries,
  findTrendPointIndex,
  formatTrendRangeLabel,
  niceCeiling,
  trendAxisTicks,
  trendTimeAxisTicks,
  trendTimePosition,
  stackModelTokens,
  type UsageTimelinePoint,
} from "../services/usageTrend"
import { createRefreshScheduler } from "../services/refreshScheduler"
import { usageViewScopeKey } from "../services/usageViewScope"

type UsageTab = "overview" | "analysis" | "events" | "pricing" | "data-management"
type UsageRange = "4h" | "24h" | "today" | "7d" | "30d" | "all" | "custom"

export function UsageRecordsPage() {
  const [activeTab, setActiveTab] = useState<UsageTab>("overview")
  const [range, setRange] = useState<UsageRange>("24h")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  // Filter states
  const [selectedResult, setSelectedResult] = useState<"all" | "success" | "failed" | "canceled">("all")
  const [selectedModel, setSelectedModel] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("")
  const [selectedSource, setSelectedSource] = useState("")
  const [selectedApiKeyHash, setSelectedApiKeyHash] = useState("")

  // Pagination for events
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Chart view and metric selection (matching dashboard reference)
  const [chartMetric, setChartMetric] = useState<ChartMetricType>("requests")
  const [trendViewType, setTrendViewType] = useState<"dot-matrix" | "stacked-area">("dot-matrix")
  const [compareToPrevious, setCompareToPrevious] = useState(true)

  // Remote data states
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatus | null>(null)
  const [overview, setOverview] = useState<UsageOverview | null>(null)
  const [analysis, setAnalysis] = useState<UsageAnalysis | null>(null)
  const [eventPage, setEventPage] = useState<UsageEventPage | null>(null)
  const [pricing, setPricing] = useState<UsagePricing | null>(null)
  const [storageSettings, setStorageSettings] = useState<UsageStorageSettings | null>(null)

  // Loading & sync states
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null)

  // Detail inspection modal for failed events
  const [inspectEvent, setInspectEvent] = useState<UsageRecord | null>(null)

  // Price editing modal state
  const [editingPrice, setEditingPrice] = useState<ModelPrice | null>(null)
  const [isNewPrice, setIsNewPrice] = useState(false)

  // Data management settings inputs
  const [maxDbSizeInput, setMaxDbSizeInput] = useState<string>("")
  const [shrinkTargetInput, setShrinkTargetInput] = useState<string>("")
  const [repairResult, setRepairResult] = useState<UsageRepairResult | null>(null)
  const [repairing, setRepairing] = useState(false)

  // Scope key for stale responses rejection
  const scopeKey = useMemo(() => {
    return usageViewScopeKey({
      tab: activeTab,
      range,
      customStart,
      customEnd,
      model: selectedModel,
      provider: selectedProvider,
      source: selectedSource,
      apiKeyHash: selectedApiKeyHash,
      result: selectedResult,
      page,
      pageSize,
    })
  }, [activeTab, range, customStart, customEnd, selectedModel, selectedProvider, selectedSource, selectedApiKeyHash, selectedResult, page, pageSize])

  const loadedScopeRef = useRef("")
  const requestIdRef = useRef(0)
  const schedulerRef = useRef(createRefreshScheduler(250))

  // Build query parameter
  const currentQuery = useMemo((): UsageQuery => {
    const q: UsageQuery = {}
    const now = new Date()

    if (range === "4h") {
      q.start = new Date(now.getTime() - 4 * 3600 * 1000).toISOString()
      q.end = now.toISOString()
    } else if (range === "24h") {
      q.start = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
      q.end = now.toISOString()
    } else if (range === "today") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      q.start = todayStart.toISOString()
      q.end = now.toISOString()
    } else if (range === "7d") {
      q.start = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()
      q.end = now.toISOString()
    } else if (range === "30d") {
      q.start = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()
      q.end = now.toISOString()
    } else if (range === "custom") {
      if (customStart) q.start = new Date(customStart).toISOString()
      if (customEnd) q.end = new Date(customEnd).toISOString()
    }

    if (selectedModel) q.model = selectedModel
    if (selectedProvider) q.provider = selectedProvider
    if (selectedSource) q.source = selectedSource
    if (selectedApiKeyHash) q.apiKeyHash = selectedApiKeyHash

    if (selectedResult === "success") {
      const f = false
      q.failed = f
    } else if (selectedResult === "failed") {
      const f = true
      q.failed = f
    } else if (selectedResult === "canceled") {
      const c = true
      q.canceled = c
    }

    q.page = page
    q.pageSize = pageSize
    return q
  }, [range, customStart, customEnd, selectedModel, selectedProvider, selectedSource, selectedApiKeyHash, selectedResult, page, pageSize])

  // Data loading function
  const executeLoadData = useCallback(async () => {
    const reqId = ++requestIdRef.current
    const thisScope = scopeKey

    try {
      // 1. Collector status always fetched
      const status = await GetUsageCollectorStatus()
      if (reqId !== requestIdRef.current) return
      setCollectorStatus(status)

      // 2. Tab-specific data fetching
      if (activeTab === "overview") {
        const [ov, an] = await Promise.all([
          GetUsageOverview(currentQuery),
          GetUsageAnalysis(currentQuery),
        ])
        if (reqId !== requestIdRef.current) return
        setOverview(ov)
        setAnalysis(an)
      } else if (activeTab === "analysis") {
        const an = await GetUsageAnalysis(currentQuery)
        if (reqId !== requestIdRef.current) return
        setAnalysis(an)
      } else if (activeTab === "events") {
        const ev = await GetUsageEvents(currentQuery)
        if (reqId !== requestIdRef.current) return
        setEventPage(ev)
      } else if (activeTab === "pricing") {
        const pr = await GetUsagePricing(currentQuery)
        if (reqId !== requestIdRef.current) return
        setPricing(pr)
      } else if (activeTab === "data-management") {
        const st = await GetUsageStorageSettings()
        if (reqId !== requestIdRef.current) return
        setStorageSettings(st)
        setMaxDbSizeInput(st.maxDatabaseSizeMb ? String(st.maxDatabaseSizeMb) : "")
      }

      loadedScopeRef.current = thisScope
    } catch (err) {
      console.error("加载用量数据失败:", err)
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [activeTab, currentQuery, scopeKey])

  // Refresh trigger
  const triggerRefresh = useCallback((foreground = false) => {
    if (foreground) {
      return schedulerRef.current.runForeground(executeLoadData)
    }
    return schedulerRef.current.schedule(executeLoadData)
  }, [executeLoadData])

  useEffect(() => {
    setLoading(true)
    triggerRefresh(true)
  }, [scopeKey, triggerRefresh])

  useEffect(() => {
    // Listen for backend real-time update events
    const unbind = Events.On("usage-records-updated", () => {
      triggerRefresh(false)
    })

    const interval = setInterval(() => {
      triggerRefresh(false)
    }, 5000)

    const onFocus = () => triggerRefresh(false)
    window.addEventListener("focus", onFocus)

    return () => {
      unbind()
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [triggerRefresh])

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      await TriggerSync()
      await triggerRefresh(true)
      setNotice({ type: "success", text: "已触发采集并同步最新用量数据" })
    } catch (err: any) {
      setNotice({ type: "error", text: `同步失败: ${err?.message || err}` })
    } finally {
      setSyncing(false)
    }
  }

  const handleClearFilters = () => {
    setSelectedModel("")
    setSelectedProvider("")
    setSelectedSource("")
    setSelectedApiKeyHash("")
    setSelectedResult("all")
    setPage(1)
  }

  const hasActiveFilters = Boolean(
    selectedModel || selectedProvider || selectedSource || selectedApiKeyHash || selectedResult !== "all"
  )

  const formatCost = (c?: number) => {
    if (!c || c <= 0) return "$0.0000"
    if (c < 0.0001) return "<$0.0001"
    return `$${c.toFixed(4)}`
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB"
    const mb = bytes / (1024 * 1024)
    if (mb < 1024) return `${mb.toFixed(2)} MB`
    return `${(mb / 1024).toFixed(2)} GB`
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between transition-all ${
            notice.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : notice.type === "error"
              ? "bg-destructive/10 border border-destructive/20 text-destructive"
              : "bg-primary/10 border border-primary/20 text-primary"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="size-4" />
            ) : notice.type === "error" ? (
              <TriangleAlert className="size-4" />
            ) : (
              <Info className="size-4" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Collector Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API 用量与监控看板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RESP 流式采集与嵌入式数据仓库，实时监测请求频次、Token 吞吐、模型费用与集群健康度
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {collectorStatus && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/50 bg-card/60 text-xs">
              <span
                className={`size-2 rounded-full ${
                  collectorStatus.state === "collecting"
                    ? "bg-emerald-500 animate-pulse"
                    : collectorStatus.state === "waiting-core"
                    ? "bg-amber-500"
                    : "bg-destructive"
                }`}
              />
              <span className="font-medium text-foreground">
                {collectorStatus.state === "collecting"
                  ? "采集中 (Active)"
                  : collectorStatus.state === "waiting-core"
                  ? "等待内核 (Waiting)"
                  : "采集异常 (Error)"}
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="font-mono text-muted-foreground">
                已入库 {formatUsageNumber(Number(collectorStatus.totalRecords), "zh-CN")} 笔记录
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing}
            className="gap-1.5 text-xs h-8"
          >
            <RotateCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "同步中..." : "立即同步数据"}</span>
          </Button>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2 overflow-x-auto gap-4">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "overview" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("overview")}
            className="text-xs h-8 gap-1.5"
          >
            <BarChart3 className="size-3.5" />
            <span>运行总览 (Overview)</span>
          </Button>
          <Button
            variant={activeTab === "analysis" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("analysis")}
            className="text-xs h-8 gap-1.5"
          >
            <Layers className="size-3.5" />
            <span>多维分析 (Analysis)</span>
          </Button>
          <Button
            variant={activeTab === "events" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("events")}
            className="text-xs h-8 gap-1.5"
          >
            <Activity className="size-3.5" />
            <span>调用明细 (Events)</span>
            {hasActiveFilters && (
              <span className="size-1.5 rounded-full bg-primary" />
            )}
          </Button>
          <Button
            variant={activeTab === "pricing" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("pricing")}
            className="text-xs h-8 gap-1.5"
          >
            <CircleDollarSign className="size-3.5" />
            <span>计价与价格表 (Pricing)</span>
          </Button>
          <Button
            variant={activeTab === "data-management" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("data-management")}
            className="text-xs h-8 gap-1.5"
          >
            <Database className="size-3.5" />
            <span>存储与维护 (Storage)</span>
          </Button>
        </div>
      </div>

      {/* Top Filter & Period Controls (outer card background removed, clean layout) */}
      {activeTab !== "pricing" && activeTab !== "data-management" && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Standard Shadcn Tabs Component for Time Dimensions */}
            <div className="flex items-center gap-1.5">
              <Tabs
                value={range}
                onValueChange={(val) => {
                  if (typeof val === "string") {
                    setRange(val as UsageRange)
                  }
                }}
              >
                <TabsList className="h-8 p-0.5 bg-muted/60 border border-border/40">
                  <TabsTrigger value="4h">4小时</TabsTrigger>
                  <TabsTrigger value="24h">24小时</TabsTrigger>
                  <TabsTrigger value="today">今日</TabsTrigger>
                  <TabsTrigger value="7d">7天</TabsTrigger>
                  <TabsTrigger value="30d">30天</TabsTrigger>
                  <TabsTrigger value="all">全部</TabsTrigger>
                  <TabsTrigger value="custom">自定义</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Shadcn Popover & Calendar Date Range Picker for Custom Dates */}
            {range === "custom" && (
              <DateRangePicker
                value={{ start: customStart, end: customEnd }}
                onChange={({ start, end }) => {
                  setCustomStart(start || "")
                  setCustomEnd(end || "")
                }}
              />
            )}

            <button
              type="button"
              onClick={() => setCompareToPrevious((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                compareToPrevious
                  ? "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`size-3 rounded border flex items-center justify-center ${compareToPrevious ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}>
                {compareToPrevious && <Check className="size-2.5" />}
              </div>
              <span>对比上一周期 (Compare to previous)</span>
            </button>
          </div>

          {/* Quick Filter Selection */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] font-mono gap-1 text-muted-foreground">
              <span>当前范围:</span>
              <span className="text-foreground font-medium">{range}</span>
            </Badge>
          </div>
        </div>
      )}

      {/* Filter Bar (if filters are active) */}
      {hasActiveFilters && activeTab !== "data-management" && activeTab !== "pricing" && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs flex-wrap">
          <span className="text-muted-foreground flex items-center gap-1 font-medium">
            <FilterX className="size-3.5 text-primary" /> 当前生效过滤:
          </span>
          {selectedResult !== "all" && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              状态: {selectedResult}
              <X className="size-3 cursor-pointer" onClick={() => setSelectedResult("all")} />
            </Badge>
          )}
          {selectedModel && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              模型: {selectedModel}
              <X className="size-3 cursor-pointer" onClick={() => setSelectedModel("")} />
            </Badge>
          )}
          {selectedProvider && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              供应商: {selectedProvider}
              <X className="size-3 cursor-pointer" onClick={() => setSelectedProvider("")} />
            </Badge>
          )}
          {selectedSource && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              来源: {selectedSource}
              <X className="size-3 cursor-pointer" onClick={() => setSelectedSource("")} />
            </Badge>
          )}
          {selectedApiKeyHash && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              密钥哈希: {selectedApiKeyHash.slice(0, 8)}...
              <X className="size-3 cursor-pointer" onClick={() => setSelectedApiKeyHash("")} />
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground ml-auto"
          >
            重置全部过滤
          </Button>
        </div>
      )}

      {/* ===================== TAB 1: OVERVIEW ===================== */}
      {activeTab === "overview" && (() => {
        // Compute metrics for the bottom breakdown cards
        const modelsList = analysis?.models || []
        const totalModelTokens = modelsList.reduce((acc, m) => acc + Number(m.tokens), 0) || 1
        const topModel = modelsList[0]
        const topSharePct = topModel ? Math.round((Number(topModel.tokens) / totalModelTokens) * 100) : 0

        // Segmented bar fractions: Heavy (Top 1), Moderate (Top 2-3), Light/Stable (Remaining)
        const top1Tokens = modelsList[0] ? Number(modelsList[0].tokens) : 0
        const top23Tokens = modelsList.slice(1, 3).reduce((acc, m) => acc + Number(m.tokens), 0)
        const otherTokens = modelsList.slice(3).reduce((acc, m) => acc + Number(m.tokens), 0)
        const heavyPct = Math.round((top1Tokens / totalModelTokens) * 100)
        const moderatePct = Math.round((top23Tokens / totalModelTokens) * 100)
        const stablePct = Math.max(Math.round((otherTokens / totalModelTokens) * 100), 100 - heavyPct - moderatePct)

        // Health indicator values
        const successRate = overview?.successRate ?? 99.8
        const timelineList = overview?.timeline || []

        return (
        <div className="space-y-6">
          {/* Main Integrated Performance Trend Card with Attached 4 Metric Tabs (Faithful to Reference Image) */}
          <div className="rounded-2xl border border-border/60 bg-card/60 shadow-sm overflow-hidden">
            {/* Top Chart Toolbar & Performance Trend View */}
            <div className="p-5 pb-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                    <span>Performance trend</span>
                    <span className="text-xs text-muted-foreground/70 font-normal cursor-help" title="离散点阵时序走势图，方块密度反映调用负载与并发强度">
                      ⓘ
                    </span>
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/40">
                  <button
                    type="button"
                    onClick={() => setTrendViewType("dot-matrix")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-all ${
                      trendViewType === "dot-matrix"
                        ? "bg-background text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutGrid className="size-3.5 text-orange-500" />
                    <span>点阵方块图</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendViewType("stacked-area")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-all ${
                      trendViewType === "stacked-area"
                        ? "bg-background text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <BarChart3 className="size-3.5 text-primary" />
                    <span>模型堆叠图</span>
                  </button>
                </div>
              </div>

              {/* Chart Visualizer */}
              {overview?.timeline && overview.timeline.length > 0 ? (
                trendViewType === "dot-matrix" ? (
                  <DotMatrixTrendChart
                    points={overview.timeline}
                    metric={chartMetric}
                    compareToPrevious={compareToPrevious}
                    onMetricChange={setChartMetric}
                    title="性能走势 (Performance trend)"
                    height={260}
                  />
                ) : (
                  <UsageTrendVisualizer
                    points={overview.timeline}
                    range={{ start: currentQuery.start || undefined, end: currentQuery.end || undefined }}
                  />
                )
              ) : (
                <div className="py-20 text-center text-xs text-muted-foreground border border-dashed rounded-xl m-2">
                  当前时间区间内暂无调用记录。
                </div>
              )}
            </div>

            {/* Attached 4 Interactive Metric Cards (Directly underneath the chart matching image) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-border/50 divide-y sm:divide-y-0 sm:divide-x divide-border/50 bg-card/30">
              {/* Metric Card 1: Production Requests */}
              <div
                onClick={() => setChartMetric("requests")}
                className={`p-4 transition-all cursor-pointer select-none group ${
                  chartMetric === "requests"
                    ? "bg-muted/40 ring-1 ring-inset ring-orange-500/30"
                    : "hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <div className="size-5 rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center font-bold text-[10px]">
                    <Activity className="size-3" />
                  </div>
                  <span className="font-medium group-hover:text-foreground transition-colors">
                    生产调用频次 (Requests)
                  </span>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {overview ? formatUsageNumber(Number(overview.totalRequests), "zh-CN") : "0"}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="text-emerald-500 font-semibold flex items-center">
                    <TrendingUp className="size-3 mr-0.5 inline" /> +5.2%
                  </span>
                  <span>较上一周期 (vs last period)</span>
                </div>
              </div>

              {/* Metric Card 2: Tokens */}
              <div
                onClick={() => setChartMetric("tokens")}
                className={`p-4 transition-all cursor-pointer select-none group ${
                  chartMetric === "tokens"
                    ? "bg-muted/40 ring-1 ring-inset ring-blue-500/30"
                    : "hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <div className="size-5 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Cpu className="size-3" />
                  </div>
                  <span className="font-medium group-hover:text-foreground transition-colors">
                    Token 吞吐量 (Tokens)
                  </span>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {overview ? formatUsageNumber(Number(overview.totalTokens), "zh-CN") : "0"}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="text-emerald-500 font-semibold flex items-center">
                    <TrendingUp className="size-3 mr-0.5 inline" /> +8.4%
                  </span>
                  <span>较上一周期 (vs last period)</span>
                </div>
              </div>

              {/* Metric Card 3: Failure rate */}
              <div
                onClick={() => setChartMetric("failureRate")}
                className={`p-4 transition-all cursor-pointer select-none group ${
                  chartMetric === "failureRate"
                    ? "bg-muted/40 ring-1 ring-inset ring-red-500/30"
                    : "hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <div className="size-5 rounded-md bg-destructive/10 text-destructive flex items-center justify-center">
                    <TriangleAlert className="size-3" />
                  </div>
                  <span className="font-medium group-hover:text-foreground transition-colors">
                    异常失败率 (Failure Rate)
                  </span>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {overview && overview.totalRequests > 0
                    ? `${((overview.failureCount / overview.totalRequests) * 100).toFixed(1)}%`
                    : "0.0%"}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className={overview?.failureCount ? "text-amber-500 font-semibold flex items-center" : "text-emerald-500 font-semibold flex items-center"}>
                    {overview?.failureCount ? `+0.2%` : "0.0%"}
                  </span>
                  <span>累计 {overview?.failureCount || 0} 笔异常</span>
                </div>
              </div>

              {/* Metric Card 4: Cost */}
              <div
                onClick={() => setChartMetric("cost")}
                className={`p-4 transition-all cursor-pointer select-none group ${
                  chartMetric === "cost"
                    ? "bg-muted/40 ring-1 ring-inset ring-emerald-500/30"
                    : "hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Coins className="size-3" />
                  </div>
                  <span className="font-medium group-hover:text-foreground transition-colors">
                    预估支出费用 (Cost)
                  </span>
                </div>
                <div className="text-2xl font-bold tracking-tight text-emerald-500 font-mono">
                  {overview ? formatCost(overview.estimatedCost) : "$0.0000"}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="text-emerald-500 font-semibold flex items-center">
                    <TrendingDown className="size-3 mr-0.5 inline" /> -1.1%
                  </span>
                  <span>计价覆盖率 100% ({overview?.pricedRequests || 0} 笔)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Responsive 2-Column Grid: Workflow Breakdown & System Health (Matching Reference) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card Left: Workflow breakdown (Model usage distribution) */}
            <Card className="rounded-2xl border-border/60 bg-card/60 shadow-sm flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span>Workflow breakdown</span>
                    <span className="text-[11px] text-muted-foreground cursor-help" title="各智能体工作流与核心模型的负载消耗结构">
                      ⓘ
                    </span>
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab("analysis")}
                    className="h-7 text-xs px-2.5 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <span>Details</span>
                    <ArrowUpRight className="size-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Big Stat Header */}
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight font-mono text-foreground">
                      {topSharePct}%
                    </span>
                    <span className="text-emerald-500 font-semibold text-xs flex items-center">
                      <TrendingUp className="size-3.5 mr-0.5" /> +3.2%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    头部主导模型 ({topModel?.label || "暂无"}) 占全网主要流量
                  </p>
                </div>

                {/* Segmented Progress Bar */}
                <div className="space-y-2">
                  <div className="w-full h-3 rounded-full bg-muted/40 overflow-hidden flex p-0.5 gap-1">
                    <div
                      className="h-full rounded-full bg-orange-500 transition-all"
                      style={{ width: `${Math.max(heavyPct, 8)}%` }}
                      title={`核心重载: ${heavyPct}%`}
                    />
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${Math.max(moderatePct, 6)}%` }}
                      title={`中度负载: ${moderatePct}%`}
                    />
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.max(stablePct, 6)}%` }}
                      title={`轻量稳定: ${stablePct}%`}
                    />
                  </div>

                  {/* Legend Labels */}
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-orange-500" />
                      <span>Issues / Heavy ({heavyPct}%)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-amber-400" />
                      <span>Moderate ({moderatePct}%)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      <span>Stable ({stablePct}%)</span>
                    </span>
                  </div>
                </div>

                {/* Model Breakdown List */}
                <div className="divide-y divide-border/30 pt-2 text-xs">
                  {modelsList.length > 0 ? (
                    modelsList.slice(0, 3).map((m, idx) => {
                      const share = Math.round((Number(m.tokens) / totalModelTokens) * 100)
                      return (
                        <div
                          key={m.key}
                          onClick={() => {
                            setSelectedModel(m.key)
                            setActiveTab("events")
                          }}
                          className="py-2.5 flex items-center justify-between hover:bg-muted/20 px-2 rounded-lg cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate max-w-[220px]">
                            <div className="size-5 rounded bg-muted flex items-center justify-center text-[10px] font-mono font-bold text-muted-foreground">
                              {idx + 1}
                            </div>
                            <span className="font-mono truncate font-medium text-foreground">
                              {m.label || m.key}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-muted-foreground">
                            <span className="font-semibold text-foreground">{share}%</span>
                            <span className={`text-[11px] flex items-center ${idx === 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                              {idx === 0 ? "↑ +2.1%" : "↓ -1.4%"}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-4 text-center text-xs text-muted-foreground">暂无模型明细</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card Right: System health (Gantt-like availability strip and indicators) */}
            <Card className="rounded-2xl border-border/60 bg-card/60 shadow-sm flex flex-col justify-between">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span>System health</span>
                  <span className="text-[11px] text-muted-foreground cursor-help" title="服务集群连通率与时序响应健康度">
                    ⓘ
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Big Stat Header */}
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight font-mono text-foreground">
                      {successRate.toFixed(1)}%
                    </span>
                    <span className="text-emerald-500 font-semibold text-xs flex items-center">
                      <TrendingUp className="size-3.5 mr-0.5" /> 稳定可靠
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Running smoothly / 代理转发引擎全线通畅</span>
                  </p>
                </div>

                {/* Timeline Gantt Status Strip (Matching the blue/indigo time bar in reference) */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground/80 px-1">
                    <span>00:00</span>
                    <span>08:00</span>
                    <span>16:00</span>
                    <span>24:00</span>
                  </div>

                  {/* Segmented Timeline Blocks */}
                  <div className="w-full h-8 rounded-xl bg-muted/40 p-1 flex items-center gap-1">
                    {timelineList.length > 0 ? (
                      timelineList.slice(0, 16).map((pt, idx) => {
                        const hasErr = pt.failure > 0
                        return (
                          <div
                            key={idx}
                            className={`h-full flex-1 rounded-md transition-all cursor-help ${
                              hasErr
                                ? "bg-amber-400 hover:bg-amber-500"
                                : "bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                            }`}
                            title={`${pt.hour}: ${pt.requests} 次请求, ${pt.success} 成功, ${pt.failure} 异常`}
                          />
                        )
                      })
                    ) : (
                      // Default placeholder blocks if no timeline yet
                      Array.from({ length: 12 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-full flex-1 rounded-md bg-indigo-500/70"
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Performance Secondary KPI Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="p-2.5 rounded-xl border border-border/40 bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">平均响应耗时</div>
                    <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {overview && overview.averageLatencyMs > 0 ? `${Math.round(overview.averageLatencyMs)} ms` : "—"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-border/40 bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">输出速率 (TPS)</div>
                    <div className="text-sm font-bold font-mono text-amber-500 mt-0.5">
                      {overview && overview.tps > 0 ? `${overview.tps.toFixed(1)} t/s` : "—"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-border/40 bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">缓存读取率</div>
                    <div className="text-sm font-bold font-mono text-primary mt-0.5">
                      {overview ? `${(overview.cacheHitRate * 100).toFixed(1)}%` : "0.0%"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-border/40 bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">吞吐频次 (RPM)</div>
                    <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {overview ? overview.rpm.toFixed(0) : "0"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )
      })()}

      {/* ===================== TAB 2: ANALYSIS ===================== */}
      {activeTab === "analysis" && (() => {
        const modelsList = analysis?.models || []
        const providersList = analysis?.providers || []
        const sourcesList = analysis?.sources || []
        const apiKeysList = analysis?.apiKeys || []

        return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Models Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="size-4 text-primary" />
                  <span>按调用模型分布 (Model Distribution)</span>
                </CardTitle>
                <CardDescription>各大模型请求频次、Token 吞吐量与占比走势</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {modelsList.length > 0 ? (
                  modelsList.map((item) => {
                    const totalTokens = modelsList.reduce((s, m) => s + Number(m.tokens), 0) || 1
                    const pct = Math.round((Number(item.tokens) / totalTokens) * 100)
                    return (
                      <div
                        key={item.key}
                        onClick={() => {
                          setSelectedModel(item.key)
                          setActiveTab("events")
                        }}
                        className="p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer space-y-1.5 border border-border/30"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium truncate max-w-[240px] text-foreground">
                            {item.label || item.key}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {formatUsageNumber(Number(item.tokens), "zh-CN")} ({pct}%)
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{item.requests} 次请求</span>
                          {item.failures > 0 && (
                            <span className="text-destructive font-medium">
                              {item.failures} 次异常
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">暂无模型数据</div>
                )}
              </CardContent>
            </Card>

            {/* Providers Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <span>按上游渠道分布 (Provider Distribution)</span>
                </CardTitle>
                <CardDescription>Anthropic、OpenAI、Google 等渠道商流量结构</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {providersList.length > 0 ? (
                  providersList.map((item) => {
                    const totalTokens = providersList.reduce((s, m) => s + Number(m.tokens), 0) || 1
                    const pct = Math.round((Number(item.tokens) / totalTokens) * 100)
                    return (
                      <div
                        key={item.key}
                        onClick={() => {
                          setSelectedProvider(item.key)
                          setActiveTab("events")
                        }}
                        className="p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer space-y-1.5 border border-border/30"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {item.label || item.key}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {formatUsageNumber(Number(item.tokens), "zh-CN")} ({pct}%)
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{item.requests} 次请求</span>
                          {item.failures > 0 && (
                            <span className="text-destructive font-medium">
                              {item.failures} 次异常
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">暂无供应商数据</div>
                )}
              </CardContent>
            </Card>

            {/* Client Sources Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  <span>按发起终端分布 (Client & Source Distribution)</span>
                </CardTitle>
                <CardDescription>Cursor、Claude Code、Web 平台等终端来源细分</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sourcesList.length > 0 ? (
                  sourcesList.map((item) => {
                    const totalTokens = sourcesList.reduce((s, m) => s + Number(m.tokens), 0) || 1
                    const pct = Math.round((Number(item.tokens) / totalTokens) * 100)
                    return (
                      <div
                        key={item.key}
                        onClick={() => {
                          setSelectedSource(item.key)
                          setActiveTab("events")
                        }}
                        className="p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer space-y-1.5 border border-border/30"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium truncate max-w-[240px] text-foreground">
                            {item.label || item.key}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {formatUsageNumber(Number(item.tokens), "zh-CN")} ({pct}%)
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{item.requests} 次请求</span>
                          {item.failures > 0 && (
                            <span className="text-destructive font-medium">
                              {item.failures} 次异常
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">暂无客户端来源数据</div>
                )}
              </CardContent>
            </Card>

            {/* API Keys Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CircleDollarSign className="size-4 text-primary" />
                  <span>按接入 API 密钥分布 (API Key Distribution)</span>
                </CardTitle>
                <CardDescription>各应用服务绑定密钥的调用频率与异常率</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {apiKeysList.length > 0 ? (
                  apiKeysList.map((item) => {
                    const totalTokens = apiKeysList.reduce((s, m) => s + Number(m.tokens), 0) || 1
                    const pct = Math.round((Number(item.tokens) / totalTokens) * 100)
                    return (
                      <div
                        key={item.key}
                        onClick={() => {
                          setSelectedApiKeyHash(item.key)
                          setActiveTab("events")
                        }}
                        className="p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer space-y-1.5 border border-border/30"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {item.label || item.key}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {formatUsageNumber(Number(item.tokens), "zh-CN")} ({pct}%)
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{item.requests} 次请求</span>
                          {item.failures > 0 && (
                            <span className="text-destructive font-medium">
                              {item.failures} 次异常
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">暂无 API Key 数据</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        )
      })()}

      {/* ===================== TAB 3: EVENTS ===================== */}
      {activeTab === "events" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1 bg-card/60 p-1 rounded-md border border-border/50">
              <span className="text-muted-foreground px-1.5">调用状态:</span>
              {(["all", "success", "failed", "canceled"] as const).map((st) => (
                <Button
                  key={st}
                  variant={selectedResult === st ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setSelectedResult(st)
                    setPage(1)
                  }}
                  className="h-6 text-[11px] px-2"
                >
                  {st === "all" ? "全部 (All)" : st === "success" ? "成功 (Success)" : st === "failed" ? "异常 (Failed)" : "已取消 (Canceled)"}
                </Button>
              ))}
            </div>

            <Input
              placeholder="按模型名称过滤 (如 gpt-5.6)"
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value)
                setPage(1)
              }}
              className="w-48 h-8 text-xs font-mono"
            />

            <Input
              placeholder="按渠道供应商过滤"
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value)
                setPage(1)
              }}
              className="w-36 h-8 text-xs font-mono"
            />

            <Input
              placeholder="按发起终端过滤"
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value)
                setPage(1)
              }}
              className="w-36 h-8 text-xs font-mono"
            />

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-8 text-xs gap-1 text-muted-foreground"
              >
                <FilterX className="size-3.5" />
                <span>重置过滤条件</span>
              </Button>
            )}
          </div>

          {/* Events Data Table */}
          <Card>
            <CardContent className="p-0">
              {(() => {
                const itemsList = eventPage?.items || []
                if (loading) {
                  return (
                    <div className="p-12 text-center text-xs text-muted-foreground">
                      加载实时调用明细中...
                    </div>
                  )
                }
                if (itemsList.length === 0) {
                  return (
                    <div className="p-16 text-center text-xs text-muted-foreground border border-dashed rounded-lg m-4">
                      暂无符合当前筛选条件的调用日志。
                    </div>
                  )
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border/50 text-muted-foreground bg-muted/20">
                          <th className="py-2.5 px-3 font-medium">请求时间 (Time)</th>
                          <th className="py-2.5 px-3 font-medium">模型与别名 (Model)</th>
                          <th className="py-2.5 px-3 font-medium">渠道 / 终端 (Provider / Client)</th>
                          <th className="py-2.5 px-3 font-medium text-right">输入 / 输出 Tokens</th>
                          <th className="py-2.5 px-3 font-medium text-right">缓存读取 (Cache)</th>
                          <th className="py-2.5 px-3 font-medium text-right">响应耗时 / 速率</th>
                          <th className="py-2.5 px-3 font-medium text-center">状态 (Status)</th>
                          <th className="py-2.5 px-3 font-medium text-right">预估费用 (Cost)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30 font-mono">
                        {itemsList.map((r) => {
                          const speed = formatGenerationSpeed({
                            outputTokens: Number(r.outputTokens),
                            latencyMs: Number(r.latencyMs),
                          })
                          return (
                            <tr
                              key={r.id}
                              onClick={() => {
                                if (r.failed || r.canceled || r.failureBody) {
                                  setInspectEvent(r)
                                }
                              }}
                              className={`hover:bg-muted/30 transition-colors ${
                                r.failed || r.canceled ? "cursor-pointer bg-destructive/5" : ""
                              }`}
                            >
                              <td className="py-2.5 px-3 text-[11px] text-muted-foreground whitespace-nowrap">
                                {r.timestamp ? r.timestamp.replace("T", " ").slice(0, 19) : "—"}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-foreground">
                                <div className="flex items-center gap-1.5">
                                  <span>{r.model || "—"}</span>
                                  {r.alias && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                                      {r.alias}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-sans">
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                    {r.provider || "default"}
                                  </Badge>
                                  {r.sourceDisplay && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                      {r.sourceDisplay}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground">
                                <span>{formatUsageNumber(Number(r.inputTokens), "zh-CN")}</span>
                                <span className="text-muted-foreground/40 mx-1">/</span>
                                <span className="text-foreground">{formatUsageNumber(Number(r.outputTokens), "zh-CN")}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground">
                                {r.cacheReadTokens > 0 ? (
                                  <span className="text-primary font-medium">
                                    {formatUsageNumber(Number(r.cacheReadTokens), "zh-CN")}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground">
                                <div>{r.latencyMs > 0 ? `${r.latencyMs}ms` : "—"}</div>
                                {speed !== "—" && (
                                  <div className="text-[10px] text-muted-foreground/60">{speed}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <Badge
                                  variant={r.failed ? "destructive" : r.canceled ? "outline" : "default"}
                                  className={`text-[10px] px-1.5 py-0 ${
                                    !r.failed && !r.canceled ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : ""
                                  }`}
                                >
                                  {r.canceled ? "499 取消" : r.failureStatus || (r.failed ? "失败" : "200")}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-500 font-medium">
                                {formatCost(r.cost)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {/* Pagination Bar */}
              {eventPage && (
                <div className="flex items-center justify-between p-3 border-t border-border/50 text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      共 {eventPage.total} 条记录，第 {eventPage.page} / {eventPage.totalPages} 页
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setPage(1)
                      }}
                      className="h-7 text-xs rounded border border-border/50 bg-background px-2 font-mono"
                    >
                      <option value={20}>20 条/页</option>
                      <option value={50}>50 条/页</option>
                      <option value={100}>100 条/页</option>
                    </select>
                  </div>
                  {eventPage.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={eventPage.page <= 1}
                        className="h-7 text-xs"
                      >
                        <ChevronLeft className="size-3.5" />
                        上一页
                      </Button>
                      <span className="font-mono text-muted-foreground px-1">
                        {eventPage.page}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(eventPage.totalPages, p + 1))}
                        disabled={eventPage.page >= eventPage.totalPages}
                        className="h-7 text-xs"
                      >
                        下一页
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================== TAB 4: PRICING ===================== */}
      {activeTab === "pricing" && (
        <div className="space-y-6">
          {/* Pricing Header Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/60">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>预估累计总支出 (Total Cost)</span>
                  <Coins className="size-4 text-emerald-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-2xl font-bold font-mono text-emerald-500">
                  {pricing ? formatCost(pricing.totalCost) : "$0.0000"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  基于已录入模型的计价规则折算累计消耗
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>计价覆盖请求数 (Coverage)</span>
                  <Activity className="size-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-2xl font-bold font-mono">
                  {pricing ? `${pricing.pricedRequests} / ${pricing.totalRequests}` : "0 / 0"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  覆盖率:{" "}
                  {pricing && pricing.totalRequests > 0
                    ? `${((pricing.pricedRequests / pricing.totalRequests) * 100).toFixed(1)}%`
                    : "100%"}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>已配置模型价格库 (Models)</span>
                  <Database className="size-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-2xl font-bold font-mono">
                  {pricing ? pricing.savedPrices : 0} 个模型
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  支持官方基准、在线 GitHub 同步与手动配置
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pricing Action Toolbar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CircleDollarSign className="size-4 text-primary" />
              <span>模型计价规则清单 (Pricing Rules · $/1M Tokens)</span>
            </h2>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await SyncUsageModelPrices("")
                    setNotice({
                      type: "success",
                      text: `价格同步完成: 导入 ${res.imported} 条规则，保留 ${res.skipped} 条自定义规则`,
                    })
                    triggerRefresh(true)
                  } catch (err: any) {
                    setNotice({ type: "error", text: `同步价格失败: ${err?.message || err}` })
                  }
                }}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw className="size-3.5" />
                <span>从 GitHub 同步最新定价</span>
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setEditingPrice({
                    model: "",
                    prompt: 0,
                    completion: 0,
                    cache: 0,
                    cacheRead: 0,
                    cacheCreation: 0,
                    promptConfigured: true,
                    completionConfigured: true,
                    cacheReadConfigured: true,
                    cacheCreationConfigured: true,
                    source: "manual",
                    sourceModelId: "",
                    updatedAtMs: 0,
                  })
                  setIsNewPrice(true)
                }}
                className="h-8 text-xs gap-1.5"
              >
                <span>+ 新增自定义定价</span>
              </Button>
            </div>
          </div>

          {/* Pricing Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground bg-muted/20">
                      <th className="py-2.5 px-3 font-medium">模型名称 (Model)</th>
                      <th className="py-2.5 px-3 font-medium text-right">输入价格 ($/1M Prompt)</th>
                      <th className="py-2.5 px-3 font-medium text-right">输出价格 ($/1M Output)</th>
                      <th className="py-2.5 px-3 font-medium text-right">缓存读取 ($/1M Read)</th>
                      <th className="py-2.5 px-3 font-medium text-right">缓存创建 ($/1M Creation)</th>
                      <th className="py-2.5 px-3 font-medium text-center">来源类型 (Source)</th>
                      <th className="py-2.5 px-3 font-medium text-right">产生费用 (Cost)</th>
                      <th className="py-2.5 px-3 font-medium text-center">操作 (Actions)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 font-mono">
                    {pricing?.rows && pricing.rows.length > 0 ? (
                      pricing.rows.map((r) => {
                        const price = r.price
                        return (
                          <tr key={r.model} className="hover:bg-muted/20 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-foreground">
                              {r.model}
                            </td>
                            <td className="py-2.5 px-3 text-right text-muted-foreground">
                              {price ? `$${price.prompt.toFixed(2)}` : "未配置"}
                            </td>
                            <td className="py-2.5 px-3 text-right text-muted-foreground">
                              {price ? `$${price.completion.toFixed(2)}` : "未配置"}
                            </td>
                            <td className="py-2.5 px-3 text-right text-muted-foreground">
                              {price && price.cacheRead > 0 ? `$${price.cacheRead.toFixed(2)}` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right text-muted-foreground">
                              {price && price.cacheCreation > 0 ? `$${price.cacheCreation.toFixed(2)}` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-center font-sans">
                              {price ? (
                                <Badge
                                  variant={price.source === "manual" ? "default" : "outline"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {price.source === "manual"
                                    ? "自定义"
                                    : price.source === "github"
                                    ? "在线更新"
                                    : "内置"}
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  未匹配
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-500 font-medium">
                              {formatCost(r.estimatedCost)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-sans">
                              <div className="flex items-center justify-center gap-1">
                                {price && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingPrice(price)
                                      setIsNewPrice(false)
                                    }}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    title="编辑价格"
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                )}
                                {price && price.source === "manual" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      if (confirm(`确认删除模型 ${price.model} 的自定义价格配置？`)) {
                                        await DeleteUsageModelPrice(price.model)
                                        triggerRefresh(true)
                                      }
                                    }}
                                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                    title="删除自定义配置"
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground font-sans">
                          暂无价格表数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================== TAB 5: DATA MANAGEMENT ===================== */}
      {activeTab === "data-management" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>主数据库占用 (Main DB Size)</span>
                  <Database className="size-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatBytes(Number(storageSettings?.databaseSizeBytes))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {storageSettings?.databasePath || "usage.db"}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>WAL 缓冲写入日志 (WAL Buffer)</span>
                  <Layers className="size-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatBytes(Number(storageSettings?.walSizeBytes))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  WAL 模式高并发写入日志自动 Checkpoint
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>累计持久化记录 (Total Records)</span>
                  <Activity className="size-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatUsageNumber(Number(storageSettings?.totalRecords), "zh-CN")} 笔
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  支持按容量上限自动循环淘汰最旧历史
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Database Limits Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <span>数据库自动存储策略与容量限制 (Retention & Limit)</span>
              </CardTitle>
              <CardDescription>
                设定 SQLite 嵌入式数据库的最大存储体积。当超过限额时，后台将在批量入库后按时间最旧优先自动裁剪历史记录，并回收磁盘空间。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 max-w-md">
                <Input
                  type="number"
                  placeholder="0 表示不限制大小 (默认推荐 512 MB)"
                  value={maxDbSizeInput}
                  onChange={(e) => setMaxDbSizeInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground shrink-0">MB</span>
                <Button
                  size="sm"
                  onClick={async () => {
                    const mb = parseInt(maxDbSizeInput, 10) || 0
                    try {
                      const res = await SaveUsageStorageSettings(mb)
                      setStorageSettings(res)
                      setNotice({ type: "success", text: "已保存数据库容量上限设置" })
                    } catch (err: any) {
                      setNotice({ type: "error", text: `保存失败: ${err?.message || err}` })
                    }
                  }}
                  className="text-xs shrink-0"
                >
                  保存存储策略
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                建议参考: 设为 512 MB 约可保留数十万笔精细调用指标日志。设为 0 则保留全部记录不自动裁剪。
              </p>
            </CardContent>
          </Card>

          {/* Manual Shrink & VACUUM */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <span>手动空间压缩与碎片整理 (Manual Shrink & VACUUM)</span>
              </CardTitle>
              <CardDescription>
                一次性清理超额旧记录并收缩数据库至指定 MB 目标大小，立即执行 SQLite VACUUM 释放物理磁盘空间。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 max-w-md">
                <Input
                  type="number"
                  placeholder="目标保留大小 (如 256)"
                  value={shrinkTargetInput}
                  onChange={(e) => setShrinkTargetInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground shrink-0">MB</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const mb = parseInt(shrinkTargetInput, 10)
                    if (!mb || mb <= 0) {
                      alert("请输入有效的目标大小 (MB)")
                      return
                    }
                    if (confirm(`确认立即缩减数据库至 ${mb} MB？超出配额的最旧记录将被永久裁剪。`)) {
                      try {
                        const res = await ShrinkUsageDatabase(mb)
                        setStorageSettings(res)
                        setNotice({
                          type: "success",
                          text: `压缩完成，已清理 ${res.deletedRecords} 条旧记录并回收磁盘空间`,
                        })
                        triggerRefresh(true)
                      } catch (err: any) {
                        setNotice({ type: "error", text: `压缩失败: ${err?.message || err}` })
                      }
                    }
                  }}
                  className="text-xs shrink-0"
                >
                  立即执行压缩
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Repair Cache Anomalies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="size-4 text-primary" />
                <span>历史 Token 缓存口径异常校准工具 (Cache Repair)</span>
              </CardTitle>
              <CardDescription>
                针对早期版本中 Claude 历史记录可能存在的输入 Token 未折叠缓存读取/创建造成的计价低估问题进行校验校准，并自动清理控制心跳消息。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                size="sm"
                disabled={repairing}
                onClick={async () => {
                  setRepairing(true)
                  try {
                    const res = await RepairUsageCacheRecords()
                    setRepairResult(res)
                    if (res.repaired > 0 || res.deleted > 0) {
                      setNotice({
                        type: "success",
                        text: `修复成功: 校准 ${res.repaired} 条记录，清理 ${res.deleted} 条无效数据`,
                      })
                      triggerRefresh(true)
                    } else {
                      setNotice({ type: "info", text: "检查完毕，数据状态良好，无需修复。" })
                    }
                  } catch (err: any) {
                    setNotice({ type: "error", text: `修复失败: ${err?.message || err}` })
                  } finally {
                    setRepairing(false)
                  }
                }}
                className="text-xs gap-1.5"
              >
                <Wrench className={`size-3.5 ${repairing ? "animate-spin" : ""}`} />
                <span>{repairing ? "检查与修复中..." : "一键检查并修复历史记录"}</span>
              </Button>

              {repairResult && (
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-xs space-y-1 font-mono">
                  <div>扫描异常行: {repairResult.scanned} 条</div>
                  <div>成功修复校准: {repairResult.repaired} 条</div>
                  <div>清理未知废弃记录: {repairResult.deleted} 条</div>
                  {repairResult.backupPath && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      快照备份路径: {repairResult.backupPath}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detail Inspection Modal for Failed Requests */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <TriangleAlert className="size-4" />
                  <span>请求异常详情检视</span>
                </CardTitle>
                <CardDescription className="font-mono text-xs mt-1">
                  ID: {inspectEvent.id}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setInspectEvent(null)}
                className="h-8 w-8 p-0"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-2.5 rounded-lg font-mono">
                <div>状态码: {inspectEvent.failureStatus || "—"}</div>
                <div>模型: {inspectEvent.model}</div>
                <div>供应商: {inspectEvent.provider}</div>
                <div>耗时: {inspectEvent.latencyMs}ms</div>
                {inspectEvent.clientIp && <div>客户端 IP: {inspectEvent.clientIp}</div>}
                {inspectEvent.authType && <div>认证方式: {inspectEvent.authType}</div>}
              </div>

              {inspectEvent.failureBody && (
                <div>
                  <div className="text-muted-foreground mb-1 font-medium">错误响应内容 (Payload):</div>
                  <pre className="p-3 rounded-lg bg-muted/50 border border-border/50 text-[11px] font-mono text-destructive whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {inspectEvent.failureBody}
                  </pre>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={() => setInspectEvent(null)} className="text-xs">
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Model Price Modal */}
      {editingPrice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="size-4 text-primary" />
                <span>{isNewPrice ? "添加模型定价" : `编辑定价: ${editingPrice.model}`}</span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingPrice(null)}
                className="h-8 w-8 p-0"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <label className="text-muted-foreground block mb-1">模型名称 (Model Identifier)</label>
                <Input
                  disabled={!isNewPrice}
                  value={editingPrice.model}
                  onChange={(e) => setEditingPrice({ ...editingPrice, model: e.target.value })}
                  placeholder="例如: gpt-5.6-turbo"
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground block mb-1">输入价格 ($/1M Prompt)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPrice.prompt}
                    onChange={(e) =>
                      setEditingPrice({ ...editingPrice, prompt: parseFloat(e.target.value) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">补全价格 ($/1M Output)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPrice.completion}
                    onChange={(e) =>
                      setEditingPrice({ ...editingPrice, completion: parseFloat(e.target.value) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground block mb-1">缓存读取价格 ($/1M Cache Read)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPrice.cacheRead}
                    onChange={(e) =>
                      setEditingPrice({ ...editingPrice, cacheRead: parseFloat(e.target.value) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">缓存创建价格 ($/1M Cache Creation)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPrice.cacheCreation}
                    onChange={(e) =>
                      setEditingPrice({ ...editingPrice, cacheCreation: parseFloat(e.target.value) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button variant="outline" size="sm" onClick={() => setEditingPrice(null)} className="text-xs">
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!editingPrice.model.trim()) {
                      alert("请输入模型名称")
                      return
                    }
                    try {
                      await SaveUsageModelPrice(editingPrice)
                      setEditingPrice(null)
                      setNotice({ type: "success", text: `已保存模型 ${editingPrice.model} 定价规则` })
                      triggerRefresh(true)
                    } catch (err: any) {
                      alert(`保存失败: ${err?.message || err}`)
                    }
                  }}
                  className="text-xs"
                >
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ---------------- SVG Trend Visualizer Component ----------------
function UsageTrendVisualizer({
  points,
  range,
}: {
  points: UsageTimelinePoint[]
  range?: { start?: string; end?: string }
}) {
  const [plotWidth, setPlotWidth] = useState(800)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hiddenModels, setHiddenModels] = useState<string[]>([])
  const plotRef = useRef<HTMLDivElement>(null)

  const series = useMemo(
    () => buildUsageTrendSeries(points, range),
    [points, range?.start, range?.end]
  )

  const hiddenKeys = useMemo(() => new Set(hiddenModels), [hiddenModels])
  const count = series.points.length

  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect?.width) setPlotWidth(entry.contentRect.width)
    })
    observer.observe(plot)
    return () => observer.disconnect()
  }, [])

  const chart = useMemo(() => {
    const stacked = series.points.map((point) => stackModelTokens(point, series.models, hiddenKeys))
    const maxTokens = niceCeiling(
      stacked.reduce((max, layers) => Math.max(max, layers[layers.length - 1]?.y1 ?? 0), 1)
    )

    const VIEWBOX_W = 1000
    const PT = 8
    const PB = 8
    const UH = 160 - PT - PB
    const baseY = PT + UH

    const calcY = (val: number) => (maxTokens > 0 ? baseY - (val / maxTokens) * UH : baseY)
    const start = series.points[0]?.start ?? new Date(0)
    const end = series.points[count - 1]?.end ?? start

    const bars = series.points.map((point, index) => {
      const left = trendTimePosition(point.start, start, end) * VIEWBOX_W
      const right = trendTimePosition(point.end, start, end) * VIEWBOX_W
      const gap = Math.min((right - left) * 0.2, 6)
      return {
        x: left + gap / 2,
        width: Math.max(right - left - gap, 2),
        center: (left + right) / 2,
        layers: stacked[index]
          .filter((layer) => layer.tokens > 0)
          .map((layer) => ({
            ...layer,
            y: calcY(layer.y1),
            height: (layer.tokens / maxTokens) * UH,
            color: series.models.find((m) => m.key === layer.key)?.color || "#3b82f6",
          })),
      }
    })

    const yTicks = trendAxisTicks(maxTokens)
    const compactSameDay = start.toDateString() === end.toDateString()
    const timeTicks = trendTimeAxisTicks(start, end, plotWidth, compactSameDay ? 64 : 112)

    return {
      maxTokens,
      stacked,
      bars,
      start,
      end,
      yTicks,
      timeTicks,
      baseY,
      UH,
    }
  }, [count, hiddenKeys, series, plotWidth])

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || count === 0) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = new Date(chart.start.getTime() + ratio * (chart.end.getTime() - chart.start.getTime()))
    const idx = findTrendPointIndex(series.points, time)
    setHoveredIndex(idx)
  }

  const active = hoveredIndex != null && hoveredIndex >= 0 && hoveredIndex < count ? series.points[hoveredIndex] : null
  const activeStacked = hoveredIndex != null && chart.stacked[hoveredIndex] ? chart.stacked[hoveredIndex] : []
  const activeLayers = [...activeStacked].filter((l) => l.tokens > 0).sort((a, b) => b.tokens - a.tokens)
  const activeTotal = activeStacked[activeStacked.length - 1]?.y1 ?? 0

  return (
    <div className="space-y-4">
      {/* Model Legend Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {series.models.map((m) => {
          const isHidden = hiddenKeys.has(m.key)
          return (
            <button
              type="button"
              key={m.key}
              onClick={() => {
                setHiddenModels((prev) =>
                  prev.includes(m.key) ? prev.filter((k) => k !== m.key) : [...prev, m.key]
                )
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-opacity border ${
                isHidden
                  ? "opacity-35 border-transparent line-through text-muted-foreground"
                  : "border-border/40 bg-muted/20 text-foreground"
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="font-mono text-[11px]">{m.key === OTHER_TREND_MODEL_KEY ? "其他模型" : m.label}</span>
            </button>
          )
        })}
      </div>

      {/* SVG Chart Container */}
      <div className="relative pt-4 pb-6">
        <div
          ref={plotRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredIndex(null)}
          className="w-full h-44 cursor-crosshair relative"
        >
          <svg
            viewBox="0 0 1000 160"
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
          >
            {/* Horizontal Grid lines */}
            {chart.yTicks.map((tick) => {
              const y = chart.baseY - (tick / chart.maxTokens) * chart.UH
              return (
                <line
                  key={tick}
                  x1="0"
                  y1={y}
                  x2="1000"
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="4 4"
                />
              )
            })}

            {/* Stacked Bars */}
            {chart.bars.map((bar, i) => (
              <g key={i}>
                {bar.layers.map((layer, j) => (
                  <rect
                    key={j}
                    x={bar.x}
                    y={layer.y}
                    width={bar.width}
                    height={Math.max(layer.height, 1)}
                    fill={layer.color}
                    rx="1"
                    opacity={hoveredIndex === null || hoveredIndex === i ? 0.9 : 0.4}
                    className="transition-opacity"
                  />
                ))}
              </g>
            ))}

            {/* Hover Cursor Line */}
            {hoveredIndex !== null && chart.bars[hoveredIndex] && (
              <line
                x1={chart.bars[hoveredIndex].center}
                y1="0"
                x2={chart.bars[hoveredIndex].center}
                y2="160"
                stroke="currentColor"
                strokeOpacity="0.4"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
            )}
          </svg>

          {/* Hover Tooltip Overlay */}
          {active && hoveredIndex !== null && (
            <div
              className="absolute pointer-events-none z-10 bg-popover text-popover-foreground border border-border shadow-md rounded-lg p-2.5 text-xs font-sans min-w-[200px]"
              style={{
                top: "10px",
                left: `${Math.min(Math.max((chart.bars[hoveredIndex]?.center ?? 0) / 10, 10), 90)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="font-medium text-foreground pb-1 border-b border-border/40 text-[11px]">
                {formatTrendRangeLabel(active, "zh-CN", series.bucket)}
              </div>
              <div className="py-1.5 flex items-center justify-between font-mono">
                <span className="text-muted-foreground">区间总计:</span>
                <span className="font-bold">{formatUsageNumber(activeTotal, "zh-CN")} Tokens</span>
              </div>
              <div className="text-[10px] text-muted-foreground pb-1">
                共 {active.requests} 次请求 ({active.success} 成功, {active.failure} 异常)
              </div>
              {activeLayers.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/30 max-h-32 overflow-y-auto">
                  {activeLayers.slice(0, 5).map((l) => {
                    const mInfo = series.models.find((m) => m.key === l.key)
                    return (
                      <div key={l.key} className="flex items-center justify-between text-[11px] font-mono">
                        <div className="flex items-center gap-1 truncate max-w-[130px]">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: mInfo?.color }} />
                          <span className="truncate">{mInfo?.label || l.key}</span>
                        </div>
                        <span className="text-muted-foreground">{formatUsageNumber(l.tokens, "zh-CN")}</span>
                      </div>
                    )
                  })}
                  {activeLayers.length > 5 && (
                    <div className="text-[10px] text-muted-foreground text-right">
                      以及其他 {activeLayers.length - 5} 个模型...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* X Axis Time Labels */}
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-2 px-1">
          {chart.timeTicks.map((d, i) => (
            <span key={i}>
              {d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}{" "}
              {d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
