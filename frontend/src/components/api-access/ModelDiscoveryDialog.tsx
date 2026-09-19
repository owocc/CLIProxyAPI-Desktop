import { useState, useMemo, useEffect, useRef } from "react"
import { RefreshCw, X, AlertCircle } from "lucide-react"
import { Button } from "../ui/button"
import { ModelSelectionPanel } from "./ModelSelectionPanel"
import {
  fetchModels,
  mergeModelOptions,
  type ModelOption,
  type ModelProvider,
} from "../../services/modelService"

interface ModelDiscoveryDialogProps {
  provider: ModelProvider
  baseUrl: string
  apiKey: string
  authIndex?: string
  customHeaders?: Record<string, string>
  initialSelectedModels: ModelOption[]
  onClose: () => void
  onApply: (models: ModelOption[]) => void
}

export function ModelDiscoveryDialog({
  provider,
  baseUrl,
  apiKey,
  authIndex,
  customHeaders,
  initialSelectedModels,
  onClose,
  onApply,
}: ModelDiscoveryDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discoveredModels, setDiscoveredModels] = useState<ModelOption[]>([])
  const [selectedNames, setSelectedNames] = useState<Set<string>>(
    () => new Set(initialSelectedModels.map((m) => m.name.toLowerCase())),
  )

  const requestRef = useRef(0)

  const allModelOptions = useMemo(
    () => mergeModelOptions(discoveredModels, initialSelectedModels),
    [discoveredModels, initialSelectedModels],
  )

  const selectedModels = useMemo(
    () => allModelOptions.filter((m) => selectedNames.has(m.name.toLowerCase())),
    [allModelOptions, selectedNames],
  )

  const unselectedModels = useMemo(
    () => allModelOptions.filter((m) => !selectedNames.has(m.name.toLowerCase())),
    [allModelOptions, selectedNames],
  )

  const triggerDiscovery = async () => {
    const reqId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const models = await fetchModels(
        provider,
        baseUrl,
        apiKey,
        authIndex,
        customHeaders,
      )
      if (reqId !== requestRef.current) return
      setDiscoveredModels(models)
      if (models.length === 0) {
        setError("上游服务未返回可识别的模型列表")
      }
    } catch (err: any) {
      if (reqId === requestRef.current) {
        setError(err?.message || String(err))
      }
    } finally {
      if (reqId === requestRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    triggerDiscovery()
  }, [])

  const handleMove = (models: ModelOption[], toSelected: boolean) => {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      models.forEach((m) => {
        const k = m.name.toLowerCase()
        if (toSelected) next.add(k)
        else next.delete(k)
      })
      return next
    })
  }

  const handleApply = () => {
    onApply(selectedModels)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl bg-card border border-border/80 shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Dialog Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
          <div>
            <h2 className="text-base font-semibold text-foreground">拉取与管理模型列表</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              从上游端点自动探测模型列表并选择要在客户端暴露的模型
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
            <X className="size-4" />
          </Button>
        </div>

        {/* Toolbar & stats */}
        <div className="p-3 border-b border-border/40 flex items-center justify-between bg-muted/10 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">探测结果：</span>
            <span className="font-mono font-medium text-foreground">
              共发现 {allModelOptions.length} 个模型 · 已勾选 {selectedModels.length} 个
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={triggerDiscovery}
            disabled={loading}
            className="h-7 text-xs gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>重新拉取</span>
          </Button>
        </div>

        {error && (
          <div className="m-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dual Panels */}
        <div className="flex-1 p-3 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden">
          <ModelSelectionPanel
            models={unselectedModels}
            selected={false}
            loading={loading}
            onMove={handleMove}
          />
          <ModelSelectionPanel
            models={selectedModels}
            selected={true}
            loading={loading}
            onMove={handleMove}
          />
        </div>

        {/* Dialog Actions */}
        <div className="p-3.5 border-t border-border/50 bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedModels.length === 0 ? "请至少在右侧保留或添加一个模型" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={loading || selectedModels.length === 0}
              className="h-8 text-xs font-medium"
            >
              确认并应用 ({selectedModels.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
