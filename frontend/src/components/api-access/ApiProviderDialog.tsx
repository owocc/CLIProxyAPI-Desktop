import { useState } from "react"
import {
  X,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Brain,
  KeyRound,
  Globe,
  Tag,
} from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Switch } from "../ui/switch"
import { Badge } from "../ui/badge"
import { ModelDiscoveryDialog } from "./ModelDiscoveryDialog"
import {
  DEEPSEEK_BASE_URL,
  normalizeBaseUrl,
  type ModelOption,
  type ModelProvider,
} from "../../services/modelService"

export type ProviderCategory =
  | "openai-compatibility"
  | "deepseek"
  | "claude-api-key"
  | "codex-api-key"
  | "gemini-api-key"

export interface ProviderDraft {
  name: string
  apiKey: string
  remark: string
  baseUrl: string
  priority: string
  models: ModelOption[]
  prefix?: string
  headersText?: string
  excludedModelsText?: string
  disableCooling?: boolean
  websockets?: boolean
  testModel?: string
  thinkingLevels?: string[]
  disabled?: boolean
  cloakMode?: string
  cloakStrictMode?: boolean
  cloakSensitiveWordsText?: string
  cloakCacheUserId?: boolean
}

export interface ApiProviderDialogProps {
  category: ProviderCategory
  initialDraft: ProviderDraft
  isEditing: boolean
  busy: boolean
  onClose: () => void
  onSave: (draft: ProviderDraft) => Promise<{ success: boolean; error?: string }>
}

export const OPENAI_THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const

export function ApiProviderDialog({
  category,
  initialDraft,
  isEditing,
  busy,
  onClose,
  onSave,
}: ApiProviderDialogProps) {
  const [draft, setDraft] = useState<ProviderDraft>(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const isOpenAiCompatible = category === "openai-compatibility"
  const isDeepSeek = category === "deepseek"
  const isClaude = category === "claude-api-key"
  const isCodex = category === "codex-api-key"
  const isGemini = category === "gemini-api-key"

  const modelProvider: ModelProvider = isDeepSeek
    ? "deepseek"
    : isClaude
      ? "claude"
      : isCodex
        ? "codex"
        : isGemini
          ? "gemini"
          : "openai"

  const updateDraft = (patch: Partial<ProviderDraft>) => {
    setError(null)
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const handleAddModel = () => {
    updateDraft({
      models: [...draft.models, { name: "", alias: "" }],
    })
  }

  const handleUpdateModel = (index: number, patch: Partial<ModelOption>) => {
    const nextModels = draft.models.map((m, idx) =>
      idx === index ? { ...m, ...patch } : m,
    )
    updateDraft({ models: nextModels })
  }

  const handleRemoveModel = (index: number) => {
    const nextModels = draft.models.filter((_, idx) => idx !== index)
    updateDraft({ models: nextModels })
  }

  const handleAddThinkingLevel = (level: string) => {
    const lvl = level.trim().toLowerCase()
    if (!lvl) return
    const current = draft.thinkingLevels ?? []
    if (!current.includes(lvl)) {
      updateDraft({ thinkingLevels: [...current, lvl] })
    }
  }

  const handleRemoveThinkingLevel = (level: string) => {
    const current = draft.thinkingLevels ?? []
    updateDraft({ thinkingLevels: current.filter((l) => l !== level) })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic Validation
    const keys = draft.apiKey
      .split(/\r?\n/)
      .map((k) => k.trim())
      .filter(Boolean)

    if (keys.length === 0) {
      setError("请至少填入一个有效的 API Key")
      return
    }

    if ((isOpenAiCompatible || isCodex) && !draft.baseUrl.trim()) {
      setError("该服务提供商必须填写 Base URL")
      return
    }

    if (isOpenAiCompatible && !isDeepSeek && !draft.remark.trim() && !draft.name.trim()) {
      setError("请为自定义提供商指定名称或备注")
      return
    }

    // Validate Base URL
    if (draft.baseUrl.trim()) {
      try {
        normalizeBaseUrl(draft.baseUrl)
      } catch (err: any) {
        setError(err?.message || "Base URL 格式无效")
        return
      }
    }

    // Parse custom headers validation
    if (draft.headersText?.trim()) {
      const lines = draft.headersText.split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (!trimmed.includes(":")) {
          setError(`自定义 Headers 格式错误 (缺少冒号): "${trimmed}"`)
          return
        }
      }
    }

    const res = await onSave(draft)
    if (!res.success) {
      setError(res.error || "保存提供商配置失败")
    }
  }

  const categoryTitle = isOpenAiCompatible
    ? "OpenAI 兼容 / 自定义提供商"
    : isDeepSeek
      ? "DeepSeek (官方渠道)"
      : isClaude
        ? "Claude API Key"
        : isCodex
          ? "Codex API Key"
          : "Gemini API Key"

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200"
        onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
      >
        <div className="w-full max-w-2xl bg-card border border-border/80 shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {isEditing ? "编辑服务提供商" : "添加服务提供商"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                接入协议：{categoryTitle}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={busy}
              className="size-8"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Remark / Provider Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Tag className="size-3.5 text-muted-foreground" />
                <span>提供商名称 / 备注</span>
              </label>
              <Input
                value={draft.remark}
                onChange={(e) => updateDraft({ remark: e.target.value })}
                placeholder={
                  isOpenAiCompatible
                    ? "例如：硅基流动生产集群、公司本地 vLLM"
                    : "例如：我的主力账户"
                }
                className="text-xs"
              />
            </div>

            {/* Base URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Globe className="size-3.5 text-muted-foreground" />
                <span>接口 Base URL</span>
                {(isOpenAiCompatible || isCodex) && (
                  <span className="text-destructive">*</span>
                )}
              </label>
              <Input
                value={draft.baseUrl}
                onChange={(e) => updateDraft({ baseUrl: e.target.value })}
                placeholder={
                  isOpenAiCompatible
                    ? "https://api.siliconflow.cn/v1 或 http://127.0.0.1:8000/v1"
                    : isDeepSeek
                      ? DEEPSEEK_BASE_URL
                      : "留空使用厂商默认官方地址"
                }
                className="text-xs font-mono"
              />
            </div>

            {/* API Keys */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  <span>API 密钥 (支持多 Key 换行轮询)</span>
                  <span className="text-destructive">*</span>
                </label>
              </div>
              <textarea
                value={draft.apiKey}
                onChange={(e) => updateDraft({ apiKey: e.target.value })}
                placeholder={"sk-...\nsk-..."}
                rows={3}
                className="w-full p-2.5 rounded-lg border border-input bg-background font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">
                填入多个 Key 时将自动进行并发轮询与故障重试
              </p>
            </div>

            {/* Thinking Levels (OpenAI Compatibility) */}
            {isOpenAiCompatible && (
              <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Brain className="size-3.5 text-primary" />
                    <span>思考预算级别 (Thinking Levels)</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {OPENAI_THINKING_LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleAddThinkingLevel(lvl)}
                        className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-card hover:bg-muted border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        +{lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(draft.thinkingLevels ?? []).map((lvl) => (
                    <Badge
                      key={lvl}
                      variant="secondary"
                      className="gap-1 text-xs font-mono pr-1"
                    >
                      <span>{lvl}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveThinkingLevel(lvl)}
                        className="hover:text-destructive p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  {(draft.thinkingLevels?.length ?? 0) === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      未配置思考级别（适用于不需要 thinking 参数的常规大模型）
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Models Configuration */}
            <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">支持的模型映射</span>
                  <p className="text-[11px] text-muted-foreground">
                    共配置 {draft.models.length} 个模型。可手动填入或直接从上游拉取
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDiscoveryOpen(true)}
                  disabled={busy}
                  className="h-7 text-xs gap-1.5"
                >
                  <RefreshCw className="size-3" />
                  <span>探测拉取模型</span>
                </Button>
              </div>

              {/* Models List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1">
                {draft.models.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={m.name}
                      onChange={(e) => handleUpdateModel(idx, { name: e.target.value })}
                      placeholder="模型名称 (如 gpt-4o)"
                      className="text-xs font-mono flex-1 h-8"
                    />
                    <Input
                      value={m.alias ?? ""}
                      onChange={(e) => handleUpdateModel(idx, { alias: e.target.value })}
                      placeholder="客户端别名 (可选)"
                      className="text-xs font-mono flex-1 h-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveModel(idx)}
                      className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddModel}
                  className="h-7 text-xs gap-1 w-full border border-dashed border-border/60 hover:border-border"
                >
                  <Plus className="size-3" />
                  <span>添加模型行</span>
                </Button>
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">路由优先级 (Priority)</label>
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => updateDraft({ priority: e.target.value })}
                placeholder="数值越小越优先，留空为默认"
                className="text-xs font-mono"
              />
            </div>

            {/* Advanced Settings Collapsible */}
            <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="w-full flex items-center justify-between p-3 text-xs font-medium text-foreground hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="size-3.5 text-muted-foreground" />
                  <span>高级与伪装配置</span>
                </div>
                {advancedOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </button>

              {advancedOpen && (
                <div className="p-3 pt-0 border-t border-border/40 space-y-3 mt-3">
                  {/* Prefix */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">模型前缀 (Prefix)</label>
                    <Input
                      value={draft.prefix ?? ""}
                      onChange={(e) => updateDraft({ prefix: e.target.value })}
                      placeholder="例如：deepseek/"
                      className="text-xs font-mono h-8"
                    />
                  </div>

                  {/* Custom Headers */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      自定义 HTTP 请求头 (每行一个 Key: Value)
                    </label>
                    <textarea
                      value={draft.headersText ?? ""}
                      onChange={(e) => updateDraft({ headersText: e.target.value })}
                      placeholder={"X-Team: AI-Core\nAuthorization: Bearer custom_token"}
                      rows={2}
                      className="w-full p-2 rounded-md border border-input bg-background font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>

                  {/* Test Model */}
                  {isOpenAiCompatible && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">健康测试默认模型</label>
                      <Input
                        value={draft.testModel ?? ""}
                        onChange={(e) => updateDraft({ testModel: e.target.value })}
                        placeholder="例如：gpt-4o-mini"
                        className="text-xs font-mono h-8"
                      />
                    </div>
                  )}

                  {/* Excluded Models */}
                  {!isOpenAiCompatible && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">排除模型规则 (每行一个)</label>
                      <textarea
                        value={draft.excludedModelsText ?? ""}
                        onChange={(e) => updateDraft({ excludedModelsText: e.target.value })}
                        placeholder={"*-preview\nmodel-old-*"}
                        rows={2}
                        className="w-full p-2 rounded-md border border-input bg-background font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  )}

                  {/* Claude Cloak Settings */}
                  {isClaude && (
                    <div className="space-y-2 p-2.5 rounded-lg bg-muted/30 border border-border/40">
                      <span className="text-xs font-medium text-foreground block">Claude 伪装配置</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">模式 (Mode)</label>
                          <Input
                            value={draft.cloakMode ?? ""}
                            onChange={(e) => updateDraft({ cloakMode: e.target.value })}
                            placeholder="auto / always / never"
                            className="text-xs h-7"
                          />
                        </div>
                        <div className="flex items-center justify-between p-2 rounded border border-border/30 bg-card">
                          <span className="text-xs">严格模式</span>
                          <Switch
                            checked={Boolean(draft.cloakStrictMode)}
                            onCheckedChange={(checked) =>
                              updateDraft({ cloakStrictMode: checked })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Codex WebSocket */}
                  {isCodex && (
                    <div className="flex items-center justify-between p-2 rounded border border-border/40 bg-muted/20">
                      <div>
                        <span className="text-xs font-medium text-foreground block">WebSocket 链路</span>
                        <span className="text-[11px] text-muted-foreground">开启 Codex WebSocket 长连接转发</span>
                      </div>
                      <Switch
                        checked={Boolean(draft.websockets)}
                        onCheckedChange={(checked) => updateDraft({ websockets: checked })}
                      />
                    </div>
                  )}

                  {/* Disable Cooling */}
                  <div className="flex items-center justify-between p-2 rounded border border-border/40 bg-muted/20">
                    <div>
                      <span className="text-xs font-medium text-foreground block">禁用自动冷却 (Cooling)</span>
                      <span className="text-[11px] text-muted-foreground">提供商遇到限流时不进行退避等待</span>
                    </div>
                    <Switch
                      checked={Boolean(draft.disableCooling)}
                      onCheckedChange={(checked) => updateDraft({ disableCooling: checked })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={busy}
                className="h-8 text-xs"
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy}
                className="h-8 text-xs font-medium"
              >
                {busy ? "正在保存..." : "保存提供商"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Model Discovery Dialog */}
      {discoveryOpen && (
        <ModelDiscoveryDialog
          provider={modelProvider}
          baseUrl={draft.baseUrl}
          apiKey={draft.apiKey.split(/\r?\n/).find((k) => k.trim()) ?? ""}
          customHeaders={
            draft.headersText
              ? Object.fromEntries(
                  draft.headersText
                    .split(/\r?\n/)
                    .filter((l) => l.includes(":"))
                    .map((l) => {
                      const idx = l.indexOf(":")
                      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
                    }),
                )
              : undefined
          }
          initialSelectedModels={draft.models}
          onClose={() => setDiscoveryOpen(false)}
          onApply={(selected) => updateDraft({ models: selected })}
        />
      )}
    </>
  )
}
