import { useState, useMemo, useEffect, useRef } from "react"
import {
  X,
  Search,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Clock,
  Play,
  Loader2,
} from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Badge } from "../ui/badge"
import {
  checkProviderModelHealth,
  checkProviderModelsHealth,
  mergeProviderHealthModels,
  PROVIDER_HEALTH_TIMEOUT_MS,
  type ProviderHealthCheckOptions,
  type ProviderModelHealthResult,
} from "../../services/providerHealthCheck"
import {
  fetchModels,
  modelSearchText,
  type ModelOption,
  type ModelProvider,
} from "../../services/modelService"

interface ProviderHealthDialogProps {
  provider: ModelProvider
  providerName: string
  baseUrl: string
  apiKeys: string[]
  authIndex?: string
  customHeaders?: Record<string, string>
  configuredModels: ModelOption[]
  onClose: () => void
}

type ModelHealthState = { status: "checking" } | ProviderModelHealthResult

export function ProviderHealthDialog({
  provider,
  providerName,
  baseUrl,
  apiKeys,
  authIndex,
  customHeaders,
  configuredModels,
  onClose,
}: ProviderHealthDialogProps) {
  const [models, setModels] = useState<ModelOption[]>(configuredModels)
  const [loadingModels, setLoadingModels] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<Record<string, ModelHealthState>>({})
  const [checkingAll, setCheckingAll] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const healthOptions = useMemo<ProviderHealthCheckOptions>(
    () => ({
      provider,
      baseUrl,
      apiKeys,
      authIndex,
      customHeaders,
      timeoutMs: PROVIDER_HEALTH_TIMEOUT_MS,
    }),
    [provider, baseUrl, apiKeys, authIndex, customHeaders],
  )

  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    return () => controller.abort()
  }, [])

  // Auto-fetch additional available models if configured models is empty or few
  useEffect(() => {
    let active = true
    setLoadingModels(true)
    const primaryKey = apiKeys.find((k) => k.trim()) ?? ""
    fetchModels(provider, baseUrl, primaryKey, authIndex, customHeaders)
      .then((discovered) => {
        if (active) {
          setModels(mergeProviderHealthModels(discovered, configuredModels))
        }
      })
      .catch(() => {
        // Fallback to configured models silently
      })
      .finally(() => {
        if (active) setLoadingModels(false)
      })
    return () => {
      active = false
    }
  }, [provider, baseUrl, apiKeys, authIndex, customHeaders, configuredModels])

  const visibleModels = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => modelSearchText(m).includes(q))
  }, [models, search])

  const resultValues = Object.values(results)
  const checkedCount = resultValues.filter((r) => r.status !== "checking").length
  const healthyCount = resultValues.filter((r) => r.status === "healthy").length
  const failedCount = resultValues.filter((r) => r.status === "failed").length

  const handleCheckOne = async (model: ModelOption) => {
    const k = model.name.toLowerCase()
    setResults((prev) => ({ ...prev, [k]: { status: "checking" } }))
    const res = await checkProviderModelHealth(healthOptions, model.name)
    setResults((prev) => ({ ...prev, [k]: res }))
  }

  const handleCheckAll = async () => {
    if (models.length === 0 || checkingAll) return
    setCheckingAll(true)
    const initStates: Record<string, ModelHealthState> = {}
    models.forEach((m) => {
      initStates[m.name.toLowerCase()] = { status: "checking" }
    })
    setResults(initStates)

    try {
      await checkProviderModelsHealth(
        healthOptions,
        models,
        (res) => {
          setResults((prev) => ({
            ...prev,
            [res.model.toLowerCase()]: res,
          }))
        },
        4,
        abortControllerRef.current?.signal,
      )
    } finally {
      setCheckingAll(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl bg-card border border-border/80 shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Activity className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                可用性与延迟测速
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                对目标提供商【{providerName}】发起流式探针以测量真实网络延迟
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
            <X className="size-4" />
          </Button>
        </div>

        {/* Stats bar */}
        <div className="px-4 py-3 border-b border-border/40 bg-muted/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">已测: {checkedCount}/{models.length}</span>
            {healthyCount > 0 && (
              <Badge variant="outline" className="text-emerald-600 bg-emerald-500/10 border-emerald-500/20 text-[11px] gap-1">
                <CheckCircle2 className="size-3" />
                <span>正常 {healthyCount}</span>
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="outline" className="text-destructive bg-destructive/10 border-destructive/20 text-[11px] gap-1">
                <AlertTriangle className="size-3" />
                <span>异常 {failedCount}</span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleCheckAll}
              disabled={checkingAll || models.length === 0}
              className="h-7 text-xs gap-1.5"
            >
              {checkingAll ? (
                <RotateCw className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5 fill-current" />
              )}
              <span>{checkingAll ? "正在全量探测..." : "检测全部模型"}</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border/40 relative bg-background">
          <Search className="size-3.5 absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="按模型名称快速过滤..."
            className="h-8 text-xs pl-8 font-mono"
          />
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-96">
          {visibleModels.length ? (
            visibleModels.map((m) => {
              const key = m.name.toLowerCase()
              const state = results[key]
              const isChecking = state?.status === "checking"
              const isHealthy = state && state.status === "healthy"
              const isFailed = state && state.status === "failed"

              return (
                <div
                  key={m.name}
                  className="flex items-center justify-between p-2.5 px-3 rounded-lg border border-border/50 bg-card hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <div className="font-mono text-xs font-medium text-foreground truncate select-all">
                      {m.name}
                    </div>
                    {(m.alias || m.displayName) && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {m.alias || m.displayName}
                      </div>
                    )}
                    {isFailed && state.error && (
                      <div className="text-[11px] text-destructive flex items-center gap-1 mt-1 truncate">
                        <AlertTriangle className="size-3 shrink-0" />
                        <span className="truncate">{state.error}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Latency badge */}
                    {isChecking ? (
                      <Badge variant="outline" className="text-muted-foreground text-[11px] gap-1 animate-pulse">
                        <Loader2 className="size-3 animate-spin" />
                        <span>检测中</span>
                      </Badge>
                    ) : isHealthy ? (
                      <Badge
                        variant="outline"
                        className="text-emerald-600 bg-emerald-500/10 border-emerald-500/20 text-[11px] gap-1 font-mono"
                      >
                        <Clock className="size-3" />
                        <span>
                          {state.firstTokenLatencyMs != null
                            ? `${state.firstTokenLatencyMs} ms`
                            : `${state.responseLatencyMs} ms`}
                        </span>
                      </Badge>
                    ) : isFailed ? (
                      <Badge variant="outline" className="text-destructive bg-destructive/10 border-destructive/20 text-[11px]">
                        失败
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 mr-1">未测试</span>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCheckOne(m)}
                      disabled={isChecking || checkingAll}
                      className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                    >
                      {state ? "重试" : "检测"}
                    </Button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="py-16 text-center text-xs text-muted-foreground">
              {loadingModels ? "正在拉取模型..." : "未找到模型"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border/50 bg-muted/20 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            关闭
          </Button>
        </div>
      </div>
    </div>
  )
}
