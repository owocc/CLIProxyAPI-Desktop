import { useState, useEffect, useCallback, useMemo } from "react"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { Switch } from "../components/ui/switch"
import {
  GetApiKeys,
  SaveApiKeys,
} from "../../bindings/easycliproxyapi/internal/service/configservice"
import {
  ResolveApiAccessRemarks,
  SaveApiAccessRemark,
} from "../../bindings/easycliproxyapi/internal/service/providerservice"
import type { ApiKeyEntry } from "../../bindings/easycliproxyapi/internal/model/models"
import {
  managementApi,
  responseList,
  isRecord,
  readString,
  readNumber,
  readBoolean,
} from "../services/managementApi"
import {
  DEEPSEEK_BASE_URL,
  modelsFromRecord,
  type ModelOption,
} from "../services/modelService"
import {
  ApiProviderDialog,
  type ProviderCategory,
  type ProviderDraft,
} from "../components/api-access/ApiProviderDialog"
import { ProviderHealthDialog } from "../components/api-access/ProviderHealthDialog"
import {
  Network,
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  Code2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Activity,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
} from "lucide-react"

export type ApiAccessTab = "providers" | "client-keys"

export type ProviderSection =
  | "gemini-api-key"
  | "codex-api-key"
  | "claude-api-key"
  | "openai-compatibility"

interface ProviderCategoryDefinition {
  id: ProviderCategory
  section: ProviderSection
  label: string
  iconLabel: string
  openAi: boolean
  desc: string
}

const CATEGORY_DEFINITIONS: ProviderCategoryDefinition[] = [
  {
    id: "openai-compatibility",
    section: "openai-compatibility",
    label: "OpenAI 兼容 (自定义)",
    iconLabel: "🤖",
    openAi: true,
    desc: "支持硅基流动、DeepSeek、Moonshot、Groq、Ollama 等任意兼容协议的自定义提供商",
  },
  {
    id: "deepseek",
    section: "codex-api-key",
    label: "DeepSeek (官方)",
    iconLabel: "⚡",
    openAi: false,
    desc: "DeepSeek 官方 API 渠道，支持 V3/R1 全系模型直连与流式推理",
  },
  {
    id: "claude-api-key",
    section: "claude-api-key",
    label: "Claude API Key",
    iconLabel: "🟧",
    openAi: false,
    desc: "Anthropic Claude 原生 API 密钥接入，支持防封伪装与上下文优化",
  },
  {
    id: "codex-api-key",
    section: "codex-api-key",
    label: "Codex API Key",
    iconLabel: "🟩",
    openAi: false,
    desc: "OpenAI 平台官方 API 密钥渠道，支持 WebSocket 与高并发转发",
  },
  {
    id: "gemini-api-key",
    section: "gemini-api-key",
    label: "Gemini API Key",
    iconLabel: "🔷",
    openAi: false,
    desc: "Google AI Studio / Gemini API 密钥，畅享超长上下文与多模态模型",
  },
]

interface ProviderRow {
  section: ProviderSection
  index: number
  record: Record<string, unknown>
  name: string
  apiKey: string
  apiKeys: string[]
  baseUrl: string
  models: ModelOption[]
  disabled: boolean
  priority: number | null
  authIndex: string
  remark: string
}

const isDeepSeekRecord = (record: Record<string, unknown>) => {
  const name = readString(record, "name").trim().toLowerCase()
  const baseUrl = readString(record, "base-url", "baseUrl").trim().toLowerCase()
  return name.includes("deepseek") || /^https?:\/\/api\.deepseek\.com(?:\/|$)/i.test(baseUrl)
}

const providerCategoryMatchesRecord = (
  category: ProviderCategory,
  record: Record<string, unknown>,
  section: ProviderSection,
) => {
  if (category === "deepseek") {
    return section === "codex-api-key" && isDeepSeekRecord(record)
  }
  if (category === "codex-api-key") {
    return section === "codex-api-key" && !isDeepSeekRecord(record)
  }
  if (category === "openai-compatibility") {
    return section === "openai-compatibility"
  }
  return true
}

const rowFromRecord = (
  section: ProviderSection,
  record: Record<string, unknown>,
  index: number,
): ProviderRow => {
  const isOpenAi = section === "openai-compatibility"
  const entries =
    isOpenAi && Array.isArray(record["api-key-entries"])
      ? record["api-key-entries"].filter(isRecord)
      : []
  const entry = entries[0] ?? null
  const apiKeys = entries
    .map((item) => readString(item, "api-key", "apiKey"))
    .filter(Boolean)
  const singleApiKey = readString(record, "api-key", "apiKey")
  const excludedModels = Array.isArray(record["excluded-models"])
    ? record["excluded-models"].map(String)
    : []

  return {
    section,
    index,
    record,
    name: isOpenAi
      ? readString(record, "name") || `自定义提供商 ${index + 1}`
      : section === "claude-api-key"
        ? "Claude API Key"
        : section === "gemini-api-key"
          ? "Gemini API Key"
          : isDeepSeekRecord(record)
            ? "DeepSeek"
            : "Codex API Key",
    apiKey: entry ? readString(entry, "api-key", "apiKey") : singleApiKey,
    apiKeys: entry ? apiKeys : singleApiKey ? [singleApiKey] : [],
    baseUrl: readString(record, "base-url", "baseUrl"),
    models: modelsFromRecord(record.models),
    disabled: isOpenAi
      ? readBoolean(record, "disabled")
      : excludedModels.some((m) => m.trim() === "*"),
    priority: readNumber(record, "priority"),
    authIndex: entry
      ? readString(entry, "auth-index", "authIndex")
      : readString(record, "auth-index", "authIndex"),
    remark: "",
  }
}

export function maskSecret(value: string): string {
  const normalized = value.trim()
  if (!normalized) return "未配置密钥"
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}••••`
  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`
}

export function ApiAccessPage() {
  const { port } = useCoreRuntime()
  const rootBase = `http://127.0.0.1:${port}`

  const [activeTab, setActiveTab] = useState<ApiAccessTab>("providers")

  // State for Upstream Providers (Tab 1)
  const [activeCategory, setActiveCategory] = useState<ProviderCategory>("openai-compatibility")
  const [records, setRecords] = useState<Record<ProviderSection, Record<string, unknown>[]>>({
    "openai-compatibility": [],
    "codex-api-key": [],
    "claude-api-key": [],
    "gemini-api-key": [],
  })
  const [apiAccessRemarks, setApiAccessRemarks] = useState<Record<string, string>>({})
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providerFilter, setProviderFilter] = useState("")
  const [busy, setBusy] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [providerSuccess, setProviderSuccess] = useState<string | null>(null)

  // Dialog States
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<ProviderRow | null>(null)
  const [healthDialogRow, setHealthDialogRow] = useState<ProviderRow | null>(null)

  // State for Client Keys (Tab 2)
  const [keys, setKeys] = useState<ApiKeyEntry[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [keysSaving, setKeysSaving] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newRemark, setNewRemark] = useState("")
  const [keysError, setKeysError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({})

  const activeCategoryDef =
    CATEGORY_DEFINITIONS.find((c) => c.id === activeCategory) ?? CATEGORY_DEFINITIONS[0]

  // Load all upstream providers
  const loadProviders = useCallback(async (showLoading = true) => {
    if (showLoading) setProvidersLoading(true)
    setProviderError(null)
    try {
      const sections: ProviderSection[] = [
        "openai-compatibility",
        "codex-api-key",
        "claude-api-key",
        "gemini-api-key",
      ]
      const results = await Promise.allSettled(
        sections.map(async (sec) => {
          const res = await managementApi.get(`/${sec}`)
          return {
            section: sec,
            records: responseList<Record<string, unknown>>(res, sec),
          }
        }),
      )

      const nextRecords: Record<ProviderSection, Record<string, unknown>[]> = {
        "openai-compatibility": [],
        "codex-api-key": [],
        "claude-api-key": [],
        "gemini-api-key": [],
      }

      results.forEach((r, idx) => {
        const sec = sections[idx]
        if (r.status === "fulfilled") {
          nextRecords[sec] = r.value.records
        }
      })

      setRecords(nextRecords)

      // Fetch remarks
      const allRows = sections.flatMap((sec) =>
        nextRecords[sec].map((rec, i) => rowFromRecord(sec, rec, i)),
      )
      if (allRows.length > 0) {
        try {
          const queries = allRows.map((row) => ({
            providerSection: row.section,
            providerName: readString(row.record, "name"),
            baseUrl: row.baseUrl,
            apiKeys: row.apiKeys,
          }))
          const remarks = await ResolveApiAccessRemarks(queries)
          const remarkMap: Record<string, string> = {}
          allRows.forEach((row, i) => {
            const key = `${row.section}:${row.name}:${row.baseUrl}:${row.apiKeys.join(",")}`
            if (remarks && remarks[i]) {
              remarkMap[key] = remarks[i]
            }
          })
          setApiAccessRemarks(remarkMap)
        } catch {
          // Remarks resolve error non-fatal
        }
      }
    } catch (err: any) {
      setProviderError(err?.message || String(err))
    } finally {
      if (showLoading) setProvidersLoading(false)
    }
  }, [])

  // Load Client Keys
  const loadKeys = async () => {
    setKeysLoading(true)
    try {
      const k = await GetApiKeys()
      setKeys(k || [])
    } catch (err: any) {
      setKeysError(err?.message || String(err))
    } finally {
      setKeysLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
    loadKeys()
  }, [loadProviders])

  // Rows for current active category
  const activeRows = useMemo(() => {
    const list = records[activeCategoryDef.section] || []
    return list
      .map((rec, i) => rowFromRecord(activeCategoryDef.section, rec, i))
      .filter((row) =>
        providerCategoryMatchesRecord(activeCategory, row.record, activeCategoryDef.section),
      )
      .map((row) => {
        const remarkKey = `${row.section}:${row.name}:${row.baseUrl}:${row.apiKeys.join(",")}`
        return {
          ...row,
          remark: apiAccessRemarks[remarkKey] || (row.section === "openai-compatibility" ? row.name : ""),
        }
      })
      .filter((row) => {
        const q = providerFilter.trim().toLowerCase()
        if (!q) return true
        return (
          (row.remark || row.name).toLowerCase().includes(q) ||
          row.baseUrl.toLowerCase().includes(q) ||
          row.apiKey.toLowerCase().includes(q) ||
          row.models.some((m) => m.name.toLowerCase().includes(q))
        )
      })
  }, [activeCategory, activeCategoryDef, records, apiAccessRemarks, providerFilter])

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts: Record<ProviderCategory, number> = {
      "openai-compatibility": 0,
      deepseek: 0,
      "claude-api-key": 0,
      "codex-api-key": 0,
      "gemini-api-key": 0,
    }

    CATEGORY_DEFINITIONS.forEach((def) => {
      const list = records[def.section] || []
      counts[def.id] = list.filter((rec) =>
        providerCategoryMatchesRecord(def.id, rec, def.section),
      ).length
    })

    return counts
  }, [records])

  const showNotification = (msg: string) => {
    setProviderSuccess(msg)
    setTimeout(() => setProviderSuccess(null), 3000)
  }

  // Toggle Provider Enable/Disable
  const handleToggleProvider = async (row: ProviderRow) => {
    setBusy(true)
    setProviderError(null)
    try {
      const latestCfg = await managementApi.get<Record<string, unknown>>("/config")
      const currentSection = Array.isArray(latestCfg[row.section])
        ? (latestCfg[row.section] as Record<string, unknown>[])
        : []

      if (row.section === "openai-compatibility") {
        await managementApi.patch("/openai-compatibility", {
          index: row.index,
          value: { disabled: !row.disabled },
        })
      } else {
        const nextList = currentSection.map((rec, idx) => {
          if (idx !== row.index) return rec
          const excluded = Array.isArray(rec["excluded-models"])
            ? rec["excluded-models"].map(String).filter((m) => m.trim() !== "*")
            : []
          if (!row.disabled) {
            excluded.push("*")
          }
          const next = { ...rec }
          if (excluded.length > 0) next["excluded-models"] = excluded
          else delete next["excluded-models"]
          return next
        })
        await managementApi.put(`/${row.section}`, nextList)
      }

      await loadProviders(false)
      showNotification(row.disabled ? "提供商已重新启用" : "提供商已暂停使用")
    } catch (err: any) {
      setProviderError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  // Delete Provider
  const handleDeleteProvider = async (row: ProviderRow) => {
    if (!window.confirm(`确定要删除提供商【${row.remark || row.name}】吗？`)) {
      return
    }
    setBusy(true)
    setProviderError(null)
    try {
      if (row.section === "openai-compatibility") {
        await managementApi.delete("/openai-compatibility", {
          query: { name: row.name },
        })
      } else {
        await managementApi.delete(`/${row.section}`, {
          query: { "api-key": row.apiKey, "base-url": row.baseUrl },
        })
      }

      // Remove remark
      await SaveApiAccessRemark({
        providerSection: row.section,
        previousRecords: [
          {
            providerName: readString(row.record, "name"),
            baseUrl: row.baseUrl,
            apiKeys: row.apiKeys,
          },
        ],
        records: [],
        allRecords: [],
        remark: "",
      })

      await loadProviders(false)
      showNotification("提供商已成功删除")
    } catch (err: any) {
      setProviderError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  // Move Provider Priority (Reorder)
  const handleMoveProvider = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= activeRows.length) return

    setBusy(true)
    setProviderError(null)
    try {
      const latestCfg = await managementApi.get<Record<string, unknown>>("/config")
      const currentList = Array.isArray(latestCfg[activeCategoryDef.section])
        ? ([...(latestCfg[activeCategoryDef.section] as Record<string, unknown>[])])
        : []

      const sourceRow = activeRows[index]
      const targetRow = activeRows[targetIndex]

      const realSourceIdx = sourceRow.index
      const realTargetIdx = targetRow.index

      if (realSourceIdx >= 0 && realTargetIdx >= 0) {
        const item = currentList.splice(realSourceIdx, 1)[0]
        currentList.splice(realTargetIdx, 0, item)
        await managementApi.put(`/${activeCategoryDef.section}`, currentList)
        await loadProviders(false)
        showNotification("优先级排序已更新")
      }
    } catch (err: any) {
      setProviderError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingRow(null)
    setDialogOpen(true)
  }

  // Open Edit Dialog
  const handleOpenEdit = (row: ProviderRow) => {
    setEditingRow(row)
    setDialogOpen(true)
  }

  // Save Provider from Dialog
  const handleSaveProvider = async (draft: ProviderDraft): Promise<{ success: boolean; error?: string }> => {
    setBusy(true)
    try {
      const section = activeCategoryDef.section
      const isOpenAi = section === "openai-compatibility"
      const parsedKeys = draft.apiKey
        .split(/\r?\n/)
        .map((k) => k.trim())
        .filter(Boolean)

      const latestCfg = await managementApi.get<Record<string, unknown>>("/config")
      const currentList = Array.isArray(latestCfg[section])
        ? ([...(latestCfg[section] as Record<string, unknown>[])])
        : []

      // Build record
      const priorityNum = draft.priority ? Number(draft.priority) : undefined
      const modelsClean = draft.models.filter((m) => m.name.trim()).map((m) => {
        const item: Record<string, unknown> = { name: m.name.trim() }
        if (m.alias?.trim()) item.alias = m.alias.trim()
        if (m.thinking) item.thinking = m.thinking
        return item
      })

      // Custom headers
      let headersMap: Record<string, string> | undefined
      if (draft.headersText?.trim()) {
        headersMap = {}
        draft.headersText.split(/\r?\n/).forEach((l) => {
          const idx = l.indexOf(":")
          if (idx > 0) {
            headersMap![l.slice(0, idx).trim()] = l.slice(idx + 1).trim()
          }
        })
      }

      let newRecords: Record<string, unknown>[] = []

      if (isOpenAi) {
        const item: Record<string, unknown> = {
          name: draft.remark.trim() || draft.name.trim(),
          "base-url": draft.baseUrl.trim(),
          "api-key-entries": parsedKeys.map((k) => ({ "api-key": k })),
          models: modelsClean,
        }
        if (priorityNum != null && Number.isFinite(priorityNum)) item.priority = priorityNum
        if (draft.prefix?.trim()) item.prefix = draft.prefix.trim()
        if (headersMap) item.headers = headersMap
        if (draft.testModel?.trim()) item["test-model"] = draft.testModel.trim()
        if (draft.disableCooling) item["disable-cooling"] = true
        newRecords = [item]
      } else {
        newRecords = parsedKeys.map((k) => {
          const item: Record<string, unknown> = {
            "api-key": k,
            models: modelsClean,
          }
          if (section === "codex-api-key" && activeCategory === "deepseek") {
            item.name = "DeepSeek"
          }
          if (draft.baseUrl.trim()) item["base-url"] = draft.baseUrl.trim()
          if (priorityNum != null && Number.isFinite(priorityNum)) item.priority = priorityNum
          if (draft.prefix?.trim()) item.prefix = draft.prefix.trim()
          if (headersMap) item.headers = headersMap
          if (draft.disableCooling) item["disable-cooling"] = true
          if (draft.websockets && section === "codex-api-key") item.websockets = true
          if (draft.excludedModelsText?.trim()) {
            item["excluded-models"] = draft.excludedModelsText
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          }
          if (section === "claude-api-key" && (draft.cloakMode || draft.cloakStrictMode)) {
            item.cloak = {
              ...(draft.cloakMode ? { mode: draft.cloakMode } : {}),
              ...(draft.cloakStrictMode ? { "strict-mode": true } : {}),
            }
          }
          return item
        })
      }

      let nextFullList: Record<string, unknown>[] = []
      if (editingRow) {
        const targetIndex = editingRow.index
        nextFullList = [
          ...currentList.slice(0, targetIndex),
          ...newRecords,
          ...currentList.slice(targetIndex + 1),
        ]
      } else {
        nextFullList = [...currentList, ...newRecords]
      }

      await managementApi.put(`/${section}`, nextFullList)

      // Save remark
      await SaveApiAccessRemark({
        providerSection: section,
        previousRecords: editingRow
          ? [
              {
                providerName: readString(editingRow.record, "name"),
                baseUrl: editingRow.baseUrl,
                apiKeys: editingRow.apiKeys,
              },
            ]
          : [],
        records: newRecords.map((rec) => ({
          providerName: readString(rec, "name"),
          baseUrl: readString(rec, "base-url", "baseUrl"),
          apiKeys: isOpenAi ? parsedKeys : [readString(rec, "api-key")],
        })),
        allRecords: nextFullList.map((rec) => ({
          providerName: readString(rec, "name"),
          baseUrl: readString(rec, "base-url", "baseUrl"),
          apiKeys: isOpenAi
            ? Array.isArray(rec["api-key-entries"])
              ? (rec["api-key-entries"] as any[]).map((e) => readString(e, "api-key"))
              : []
            : [readString(rec, "api-key")],
        })),
        remark: draft.remark.trim(),
      })

      await loadProviders(false)
      showNotification(editingRow ? "提供商已更新" : "新提供商添加成功")
      setDialogOpen(false)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    } finally {
      setBusy(false)
    }
  }

  // Client Key Management actions
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const toggleShowKey = (key: string) => {
    setShowKeyMap((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const generateRandomKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let res = "sk-cpa-"
    for (let i = 0; i < 24; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewKey(res)
  }

  const handleAddClientKey = async () => {
    const keyVal = newKey.trim()
    if (!keyVal) {
      setKeysError("API Key 不能为空")
      return
    }

    if (keys.some((k) => k.apiKey === keyVal)) {
      setKeysError("已存在相同的 API Key")
      return
    }

    const updated = [...keys, { apiKey: keyVal, remark: newRemark.trim() }]
    setKeysSaving(true)
    setKeysError(null)
    try {
      await SaveApiKeys(updated)
      setKeys(updated)
      setNewKey("")
      setNewRemark("")
    } catch (err: any) {
      setKeysError(err?.message || String(err))
    } finally {
      setKeysSaving(false)
    }
  }

  const handleDeleteClientKey = async (targetKey: string) => {
    const updated = keys.filter((k) => k.apiKey !== targetKey)
    setKeysSaving(true)
    setKeysError(null)
    try {
      await SaveApiKeys(updated)
      setKeys(updated)
    } catch (err: any) {
      setKeysError(err?.message || String(err))
    } finally {
      setKeysSaving(false)
    }
  }

  const sampleKey = keys.length > 0 ? keys[0].apiKey : "123456"
  const curlExample = `curl ${rootBase}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API 接入中心</h1>
          <p className="text-sm text-muted-foreground mt-1">
            统一治理上游大模型提供商（包含自定义 OpenAI 兼容协议）与本地客户端直连密钥
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border/40 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("providers")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === "providers"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
            }`}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>API 提供商接入</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("client-keys")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === "client-keys"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
            }`}
          >
            <KeyRound className="size-3.5 text-primary" />
            <span>本地服务与密钥</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {providerSuccess && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          <span>{providerSuccess}</span>
        </div>
      )}
      {providerError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{providerError}</span>
          </div>
          <button onClick={() => setProviderError(null)} className="text-xs hover:underline">
            关闭
          </button>
        </div>
      )}

      {/* TAB 1: API PROVIDERS (UPSTREAM & CUSTOM) */}
      {activeTab === "providers" && (
        <div className="space-y-4">
          {/* Category Pills & Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_DEFINITIONS.map((def) => {
                const count = categoryCounts[def.id]
                const active = activeCategory === def.id
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => setActiveCategory(def.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                    }`}
                  >
                    <span>{def.iconLabel}</span>
                    <span>{def.label}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] h-4.5 px-1.5 font-mono ${
                        active
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-background/80 text-muted-foreground"
                      }`}
                    >
                      {count}
                    </Badge>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadProviders(true)}
                disabled={providersLoading || busy}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${providersLoading ? "animate-spin" : ""}`} />
                <span>刷新</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenCreate}
                disabled={providersLoading || busy}
                className="h-8 text-xs gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>添加提供商</span>
              </Button>
            </div>
          </div>

          {/* Current Category Description & Filter Bar */}
          <Card className="border-border/60">
            <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{activeCategoryDef.iconLabel}</span>
                    <CardTitle className="text-sm font-semibold">
                      {activeCategoryDef.label}
                    </CardTitle>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {activeRows.length} 个配置项
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {activeCategoryDef.desc}
                  </CardDescription>
                </div>

                {/* Filter search */}
                <div className="relative w-full sm:w-64">
                  <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={providerFilter}
                    onChange={(e) => setProviderFilter(e.target.value)}
                    placeholder="按名称、模型或 URL 过滤..."
                    className="h-8 text-xs pl-8 font-mono bg-background"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {providersLoading ? (
                <div className="py-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="size-5 animate-spin text-primary" />
                  <span>正在读取配置并探测服务状态...</span>
                </div>
              ) : activeRows.length === 0 ? (
                <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg flex flex-col items-center justify-center gap-2">
                  <Layers className="size-8 text-muted-foreground/40" />
                  <span className="font-medium text-foreground">
                    {providerFilter ? "没有找到匹配的提供商" : "当前分类暂未配置任何提供商"}
                  </span>
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    点击右上角的“添加提供商”按钮，填入您的 API 密钥与端点信息即可接入
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenCreate}
                    className="mt-2 text-xs h-8 gap-1.5"
                  >
                    <Plus className="size-3.5" />
                    <span>立即添加</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeRows.map((row, idx) => (
                    <div
                      key={`${row.section}-${row.index}`}
                      className={`p-3.5 rounded-xl border transition-all ${
                        row.disabled
                          ? "bg-muted/30 border-border/40 opacity-70"
                          : "bg-card border-border/70 hover:border-primary/40 shadow-xs"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Provider info */}
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground truncate">
                              {row.remark || row.name}
                            </span>
                            {row.section === "openai-compatibility" && row.remark && row.name !== row.remark && (
                              <span className="text-[11px] text-muted-foreground font-mono">
                                ({row.name})
                              </span>
                            )}
                            {row.priority !== null && (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                优先级: {row.priority}
                              </Badge>
                            )}
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${
                                row.disabled
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              }`}
                            >
                              {row.disabled ? "已暂停" : "正常工作"}
                            </Badge>
                          </div>

                          {/* Base URL and Key */}
                          <div className="flex flex-wrap items-center gap-4 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                              <span className="text-[11px] text-foreground/70">端点:</span>
                              <span className="truncate max-w-xs text-foreground select-all">
                                {row.baseUrl || "默认官方接口"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                              <span className="text-[11px] text-foreground/70">密钥:</span>
                              <code className="text-[11px] select-all">
                                {row.apiKeys.length > 1
                                  ? `${maskSecret(row.apiKey)} (+${row.apiKeys.length - 1} 个备用)`
                                  : maskSecret(row.apiKey)}
                              </code>
                            </div>
                          </div>

                          {/* Models list preview */}
                          {row.models.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-1">
                              <span className="text-[10px] text-muted-foreground mr-1">模型:</span>
                              {row.models.slice(0, 5).map((m) => (
                                <span
                                  key={m.name}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 truncate max-w-xs"
                                  title={m.alias ? `${m.name} -> ${m.alias}` : m.name}
                                >
                                  {m.name}
                                  {m.alias && <span className="text-primary"> ({m.alias})</span>}
                                </span>
                              ))}
                              {row.models.length > 5 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{row.models.length - 5} 更多
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Controls & Operations */}
                        <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40 justify-end">
                          {/* Reorder buttons */}
                          <div className="flex items-center gap-0.5 border border-border/40 rounded-lg p-0.5 bg-muted/20">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMoveProvider(idx, "up")}
                              disabled={busy || idx === 0}
                              className="size-7 text-muted-foreground hover:text-foreground"
                              title="上移优先级"
                            >
                              <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMoveProvider(idx, "down")}
                              disabled={busy || idx === activeRows.length - 1}
                              className="size-7 text-muted-foreground hover:text-foreground"
                              title="下移优先级"
                            >
                              <ArrowDown className="size-3.5" />
                            </Button>
                          </div>

                          {/* Health check button */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setHealthDialogRow(row)}
                            disabled={busy}
                            className="h-8 text-xs gap-1.5"
                          >
                            <Activity className="size-3.5 text-primary" />
                            <span>连通测速</span>
                          </Button>

                          {/* Toggle switch */}
                          <div className="flex items-center gap-1.5 pl-1 pr-2">
                            <Switch
                              checked={!row.disabled}
                              onCheckedChange={() => handleToggleProvider(row)}
                              disabled={busy}
                            />
                          </div>

                          {/* Edit button */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(row)}
                            disabled={busy}
                            className="h-8 text-xs"
                          >
                            编辑
                          </Button>

                          {/* Delete button */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteProvider(row)}
                            disabled={busy}
                            className="size-8 text-muted-foreground hover:text-destructive"
                            title="删除提供商"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: CLIENT ACCESS & KEYS (LOCAL PROXY ENDPOINTS) */}
      {activeTab === "client-keys" && (
        <div className="space-y-6">
          {keysError && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{keysError}</span>
            </div>
          )}

          {/* API Keys Table Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="size-4 text-primary" />
                    <span>本地访问密钥列表 (Client API Keys)</span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    代码助手客户端（如 Claude Code, Cursor, Windsurf）连接本地时填写的鉴权密钥
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {keys.length} 个活跃密钥
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Add new key form */}
              <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 space-y-3">
                <span className="text-xs font-medium text-foreground">添加新密钥</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 relative">
                    <Input
                      type="text"
                      placeholder="输入或生成 API Key (例如 sk-cpa-...)"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="font-mono text-xs pr-20"
                    />
                    <button
                      type="button"
                      onClick={generateRandomKey}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-primary hover:underline"
                    >
                      随机生成
                    </button>
                  </div>
                  <Input
                    type="text"
                    placeholder="可选备注 (例如 Claude 专用)"
                    value={newRemark}
                    onChange={(e) => setNewRemark(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleAddClientKey}
                    disabled={keysSaving || !newKey.trim()}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Plus className="size-3.5" />
                    添加密钥
                  </Button>
                </div>
              </div>

              {/* Keys list */}
              <div className="space-y-2">
                {keysLoading ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    加载密钥中...
                  </div>
                ) : keys.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                    暂未配置 API Key。为保证访问安全，建议至少保留一个密钥。
                  </div>
                ) : (
                  keys.map((k, idx) => {
                    const isRevealed = showKeyMap[k.apiKey] ?? false
                    const displayKey = isRevealed
                      ? k.apiKey
                      : k.apiKey.length > 8
                        ? `${k.apiKey.slice(0, 4)}••••••••${k.apiKey.slice(-4)}`
                        : "••••••••"

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card hover:bg-muted/20 transition-colors"
                      >
                        <div className="space-y-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-foreground select-all">
                              {displayKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleShowKey(k.apiKey)}
                              className="text-muted-foreground hover:text-foreground"
                              title={isRevealed ? "隐藏" : "查看"}
                            >
                              {isRevealed ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </button>
                          </div>
                          {k.remark && (
                            <div className="text-[11px] text-muted-foreground">
                              {k.remark}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(k.apiKey, k.apiKey)}
                            className="size-7"
                            title="复制密钥"
                          >
                            {copiedKey === k.apiKey ? (
                              <Check className="size-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClientKey(k.apiKey)}
                            disabled={keysSaving}
                            className="size-7 text-muted-foreground hover:text-destructive"
                            title="删除密钥"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Protocol Endpoints & Code Snippets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="size-4 text-primary" />
                  <span>标准本地接口端点</span>
                </CardTitle>
                <CardDescription>与标准 OpenAI / Anthropic 协议对齐的路径</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block mb-1">
                    OpenAI Compatible Base URL
                  </span>
                  <code className="font-mono font-medium select-all block text-foreground">
                    {rootBase}/v1
                  </code>
                </div>

                <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block mb-1">
                    Anthropic Base URL (Claude Code 等)
                  </span>
                  <code className="font-mono font-medium select-all block text-foreground">
                    {rootBase}
                  </code>
                </div>
              </CardContent>
            </Card>

            {/* Quick Curl Tester */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="size-4 text-primary" />
                    <span>终端调用示例</span>
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(curlExample, "curl")}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    {copiedKey === "curl" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>复制 cURL</span>
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="p-3 rounded-lg bg-muted/60 font-mono text-[11px] leading-relaxed overflow-x-auto text-muted-foreground select-all">
                  {curlExample}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Provider Add/Edit Dialog */}
      {dialogOpen && (
        <ApiProviderDialog
          category={activeCategory}
          isEditing={Boolean(editingRow)}
          initialDraft={
            editingRow
              ? {
                  name: editingRow.name,
                  apiKey: editingRow.apiKeys.join("\n"),
                  remark: editingRow.remark,
                  baseUrl: editingRow.baseUrl,
                  priority: editingRow.priority != null ? String(editingRow.priority) : "",
                  models: editingRow.models,
                  prefix: readString(editingRow.record, "prefix"),
                  headersText: isRecord(editingRow.record.headers)
                    ? Object.entries(editingRow.record.headers)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join("\n")
                    : "",
                  excludedModelsText: Array.isArray(editingRow.record["excluded-models"])
                    ? editingRow.record["excluded-models"].map(String).filter((m) => m !== "*").join("\n")
                    : "",
                  disableCooling: readBoolean(editingRow.record, "disable-cooling", "disableCooling"),
                  websockets: readBoolean(editingRow.record, "websockets"),
                  testModel: readString(editingRow.record, "test-model", "testModel"),
                  disabled: editingRow.disabled,
                  cloakMode: isRecord(editingRow.record.cloak)
                    ? readString(editingRow.record.cloak, "mode")
                    : "",
                  cloakStrictMode: isRecord(editingRow.record.cloak)
                    ? readBoolean(editingRow.record.cloak, "strict-mode", "strictMode")
                    : false,
                }
              : {
                  name: activeCategory === "deepseek" ? "DeepSeek" : "",
                  apiKey: "",
                  remark: "",
                  baseUrl: activeCategory === "deepseek" ? DEEPSEEK_BASE_URL : "",
                  priority: "",
                  models: [],
                  thinkingLevels: activeCategory === "openai-compatibility" ? [] : undefined,
                }
          }
          busy={busy}
          onClose={() => setDialogOpen(false)}
          onSave={handleSaveProvider}
        />
      )}

      {/* Provider Health Check Dialog */}
      {healthDialogRow && (
        <ProviderHealthDialog
          provider={
            activeCategory === "deepseek"
              ? "deepseek"
              : healthDialogRow.section === "claude-api-key"
                ? "claude"
                : healthDialogRow.section === "codex-api-key"
                  ? "codex"
                  : healthDialogRow.section === "gemini-api-key"
                    ? "gemini"
                    : "openai"
          }
          providerName={healthDialogRow.remark || healthDialogRow.name}
          baseUrl={healthDialogRow.baseUrl}
          apiKeys={healthDialogRow.apiKeys}
          authIndex={healthDialogRow.authIndex}
          customHeaders={
            isRecord(healthDialogRow.record.headers)
              ? Object.fromEntries(
                  Object.entries(healthDialogRow.record.headers).map(([k, v]) => [k, String(v)]),
                )
              : undefined
          }
          configuredModels={healthDialogRow.models}
          onClose={() => setHealthDialogRow(null)}
        />
      )}
    </div>
  )
}
