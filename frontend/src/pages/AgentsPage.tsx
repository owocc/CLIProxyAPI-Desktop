import { useState, useEffect, useCallback, useMemo } from "react"
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Bot,
  Terminal,
  RotateCcw,
  Play,
  ShieldCheck,
  Zap,
} from "lucide-react"

import claudeIcon from "../assets/icons/claude.svg"
import codexIcon from "../assets/icons/codex.svg"
import deepseekIcon from "../assets/icons/deepseek.svg"
import opencodeIcon from "../assets/icons/opencode.svg"
import openclawIcon from "../assets/icons/openclaw.svg"
import hermesIcon from "../assets/icons/hermes.png"
import zcodeIcon from "../assets/icons/zcode.png"
import kimiIcon from "../assets/icons/kimi-light.svg"
import grokIcon from "../assets/icons/grok.svg"
import piIcon from "../assets/icons/pi-logo-on-light.svg"

import {
  ListAgents,
  ApplyAgentConfig,
  ApplyClaudeCodeConfig,
  ApplyCodexConfig,
  CloseAgentConfig,
  GetAgentDetail,
  LaunchAgent,
  GetAvailableModels,
  ListBackups,
  RestoreSpecificBackup,
  GetCodexNativeStatus,
  RestoreCodexOfficialConfig,
} from "../../bindings/easycliproxyapi/internal/service/agentservice"
import type {
  AgentInfo,
  BackupEntry,
  CodexNativeStatus,
} from "../../bindings/easycliproxyapi/internal/model/models"

import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Switch } from "../components/ui/switch"
import { Input } from "../components/ui/input"
import { Skeleton } from "../components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"

const clientIcons: Record<string, string> = {
  "claude-code": claudeIcon,
  "claude-desktop": claudeIcon,
  "codex": codexIcon,
  "deepseek-harness": deepseekIcon,
  "opencode": opencodeIcon,
  "openclaw": openclawIcon,
  "hermes": hermesIcon,
  "zcode": zcodeIcon,
  "kimi-code": kimiIcon,
  "grok-build": grokIcon,
  "pi": piIcon,
}

const DEFAULT_MODELS = [
  "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "gpt-4o",
  "gpt-4o-mini",
  "o1",
  "o3-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-3.8-flash-high",
  "deepseek-r1",
  "deepseek-v3",
]

const DEFAULT_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    executable: "claude",
    format: "JSON",
    description: "Anthropic 官方终端智能体",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    warnings: [],
  },
  {
    id: "codex",
    name: "Codex",
    executable: "codex",
    format: "TOML",
    description: "OpenAI Codex CLI 智能体",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: ["gpt-4o", "o1", "o3-mini", "claude-3-7-sonnet-20250219", "deepseek-r1"],
    warnings: [],
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    executable: "app",
    format: "JSON",
    description: "Anthropic 官方桌面客户端",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"],
    warnings: [],
  },
  {
    id: "opencode",
    name: "OpenCode",
    executable: "opencode",
    format: "JSON5",
    description: "开源轻量 AI 编程助理",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: DEFAULT_MODELS,
    warnings: [],
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    executable: "openclaw",
    format: "JSON5",
    description: "OpenClaw 智能体系统",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: DEFAULT_MODELS,
    warnings: [],
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    executable: "hermes",
    format: "YAML",
    description: "Hermes 自动化智能体框架",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: DEFAULT_MODELS,
    warnings: [],
  },
  {
    id: "deepseek-harness",
    name: "DeepSeek Harness",
    executable: "dsh",
    format: "YAML",
    description: "DeepSeek 官方评测测试套件",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: ["deepseek-r1", "deepseek-v3"],
    warnings: [],
  },
  {
    id: "zcode",
    name: "ZCode",
    executable: "zcode",
    format: "JSON",
    description: "ZCode 编程套件",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: DEFAULT_MODELS,
    warnings: [],
  },
  {
    id: "kimi-code",
    name: "Kimi Code",
    executable: "kimi",
    format: "TOML",
    description: "Moonshot Kimi Code 编程工具",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: ["kimi-k1.5", "deepseek-r1", "claude-3-7-sonnet-20250219"],
    warnings: [],
  },
  {
    id: "grok-build",
    name: "Grok Build",
    executable: "grok",
    format: "TOML",
    description: "xAI Grok 构建工具",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: ["grok-2", "deepseek-r1"],
    warnings: [],
  },
  {
    id: "pi",
    name: "Pi Coding Agent",
    executable: "pi",
    format: "JSON",
    description: "Pi 编程客户端",
    installed: false,
    cliInstalled: false,
    version: "",
    cliVersion: "",
    appVersion: "",
    executablePath: "",
    configFound: false,
    configured: false,
    currentModel: "",
    configPaths: [],
    supportedModels: DEFAULT_MODELS,
    warnings: [],
  },
]

interface ClaudeDraft {
  opus: string
  sonnet: string
  haiku: string
  opus1M: boolean
  sonnet1M: boolean
  haiku1M: boolean
  maxContextTokens: number
  autoCompactPct: number
  disableAutoCompact: boolean
  customMapping: boolean
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>(DEFAULT_AGENTS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSubpage, setActiveSubpage] = useState<"core" | "management">("core")
  const [initialLoading, setInitialLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [listFilter, setListFilter] = useState<"installed" | "uninstalled" | "all">("installed")
  const [models, setModels] = useState<string[]>(DEFAULT_MODELS)
  const [codexNativeStatus, setCodexNativeStatus] = useState<CodexNativeStatus | null>(null)

  // Claude Code draft
  const [claudeDraft, setClaudeDraft] = useState<ClaudeDraft>({
    opus: "claude-3-opus-20240229",
    sonnet: "claude-3-7-sonnet-20250219",
    haiku: "claude-3-5-haiku-20241022",
    opus1M: false,
    sonnet1M: false,
    haiku1M: false,
    maxContextTokens: 200000,
    autoCompactPct: 90,
    disableAutoCompact: false,
    customMapping: false,
  })

  // Codex draft
  const [codexModel, setCodexModel] = useState<string>("gpt-4o")
  const [codexAuthMethod, setCodexAuthMethod] = useState<"apikey" | "oauth">("apikey")

  // Standard model for other agents
  const [standardModel, setStandardModel] = useState<string>("claude-3-7-sonnet-20250219")

  // Backups
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)

  // Actions state
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null)

  const showNotification = (type: "success" | "error" | "info", text: string) => {
    setNotice({ type, text })
    setTimeout(() => {
      setNotice((cur) => (cur?.text === text ? null : cur))
    }, 4000)
  }

  // Derived installed & configured counts
  const installedAgents = useMemo(() => agents.filter((a) => a.installed), [agents])
  const uninstalledAgents = useMemo(() => agents.filter((a) => !a.installed), [agents])
  const configuredCount = useMemo(() => agents.filter((a) => a.configured).length, [agents])

  // Filtered displayed list in the sidebar
  const displayedAgents = useMemo(() => {
    if (listFilter === "installed") {
      return installedAgents
    }
    if (listFilter === "uninstalled") {
      return uninstalledAgents
    }
    return agents
  }, [listFilter, installedAgents, uninstalledAgents, agents])

  const selectedAgent = useMemo(() => {
    if (!selectedId) return null
    return agents.find((a) => a.id === selectedId) || null
  }, [agents, selectedId])

  // Handle filter change with auto-selection of active client in new list
  const handleFilterChange = (val: "installed" | "uninstalled" | "all") => {
    setListFilter(val)
    let nextList = agents
    if (val === "installed") nextList = installedAgents
    else if (val === "uninstalled") nextList = uninstalledAgents

    // If currently selected agent is not in the new filtered list, unselect so user chooses from the new view
    if (selectedId && !nextList.some((a) => a.id === selectedId)) {
      setSelectedId(null)
    }
  }

  // Load detail for a selected agent
  const loadAgentDetail = useCallback(async (id: string) => {
    try {
      const detail = await GetAgentDetail(id)
      if (id === "claude-code" && detail.claudeCode) {
        const cc = detail.claudeCode
        setClaudeDraft({
          opus: cc.opusModel || "claude-3-opus-20240229",
          sonnet: cc.sonnetModel || "claude-3-7-sonnet-20250219",
          haiku: cc.haikuModel || "claude-3-5-haiku-20241022",
          opus1M: cc.opus1M || false,
          sonnet1M: cc.sonnet1M || false,
          haiku1M: cc.haiku1M || false,
          maxContextTokens: cc.maxContextTokens || 200000,
          autoCompactPct: cc.autoCompactPct || 90,
          disableAutoCompact: cc.disableAutoCompact || false,
          customMapping: cc.customMapping || false,
        })
      } else if (id === "codex" && detail.codex) {
        setCodexModel(detail.codex.model || "gpt-4o")
        setCodexAuthMethod(detail.codex.authMethod === "oauth" ? "oauth" : "apikey")
      } else {
        setStandardModel(detail.model || "claude-3-7-sonnet-20250219")
      }
    } catch (e) {
      console.warn("Failed to load agent detail", e)
    }
  }, [])

  // Load all agents and models
  const loadAgents = useCallback(
    async (preferredId?: string | null) => {
      setDetecting(true)
      try {
        const [list, modelList, codexStatus] = await Promise.all([
          ListAgents().catch(() => null),
          GetAvailableModels().catch(() => null),
          GetCodexNativeStatus().catch(() => null),
        ])

        let activeList = DEFAULT_AGENTS
        if (list && list.length > 0) {
          setAgents(list)
          activeList = list
        }
        if (modelList && modelList.length > 0) {
          setModels(modelList)
        }
        if (codexStatus) {
          setCodexNativeStatus(codexStatus)
        }

        const targetId = preferredId || selectedId
        if (targetId && activeList.some((a) => a.id === targetId)) {
          await loadAgentDetail(targetId)
        }
      } catch (err: any) {
        showNotification("error", `探测客户端失败: ${err?.message || err}`)
      } finally {
        setDetecting(false)
        setInitialLoading(false)
      }
    },
    [loadAgentDetail, selectedId]
  )

  useEffect(() => {
    loadAgents()
    // Run once on mount; subsequent reloads triggered by user action
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When selected agent changes (without triggering full list re-detection)
  const handleSelectAgent = (id: string) => {
    setSelectedId(id)
    loadAgentDetail(id)
  }

  // Load backups when switching to management tab
  useEffect(() => {
    if (activeSubpage === "management" && selectedId) {
      setLoadingBackups(true)
      ListBackups(selectedId)
        .then((b) => setBackups(b || []))
        .catch(() => setBackups([]))
        .finally(() => setLoadingBackups(false))
    }
  }, [activeSubpage, selectedId])

  // Context 1M toggle reaction
  const handleToggle1M = (role: "opus" | "sonnet" | "haiku", val: boolean) => {
    setClaudeDraft((prev) => {
      const next = { ...prev }
      if (role === "opus") next.opus1M = val
      if (role === "sonnet") next.sonnet1M = val
      if (role === "haiku") next.haiku1M = val

      // If any 1M is checked, auto bump to 1M context
      if (next.opus1M || next.sonnet1M || next.haiku1M) {
        if (next.maxContextTokens < 1000000) {
          next.maxContextTokens = 1000000
        }
      } else {
        if (next.maxContextTokens === 1000000) {
          next.maxContextTokens = 200000
        }
      }
      return next
    })
  }

  // Save / Apply configuration
  const handleApplyConfig = async () => {
    if (!selectedAgent || !selectedId) return
    setBusy(true)
    try {
      if (selectedId === "claude-code") {
        await ApplyClaudeCodeConfig({
          opusModel: claudeDraft.opus,
          sonnetModel: claudeDraft.sonnet,
          haikuModel: claudeDraft.haiku,
          opus1M: claudeDraft.opus1M,
          sonnet1M: claudeDraft.sonnet1M,
          haiku1M: claudeDraft.haiku1M,
          maxContextTokens: claudeDraft.maxContextTokens,
          autoCompactPct: claudeDraft.autoCompactPct,
          disableAutoCompact: claudeDraft.disableAutoCompact,
          customMapping: claudeDraft.customMapping,
        })
      } else if (selectedId === "codex") {
        await ApplyCodexConfig({
          model: codexModel,
          authMethod: codexAuthMethod,
        })
      } else {
        await ApplyAgentConfig(selectedId, standardModel)
      }

      showNotification("success", `已成功更新 ${selectedAgent.name} 配置！`)
      await loadAgents(selectedId)
    } catch (err: any) {
      showNotification("error", `写入配置失败: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  // Close / Remove configuration
  const handleCloseConfig = async () => {
    if (!selectedAgent || !selectedId) return
    setBusy(true)
    try {
      await CloseAgentConfig(selectedId)
      showNotification("success", `已关闭 ${selectedAgent.name} 的代理配置`)
      await loadAgents(selectedId)
    } catch (err: any) {
      showNotification("error", `关闭配置失败: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  // Launch Agent
  const handleLaunchAgent = async () => {
    if (!selectedAgent || !selectedId) return
    try {
      await LaunchAgent(selectedId)
      showNotification("success", `已启动 ${selectedAgent.name}`)
    } catch (err: any) {
      showNotification("error", `启动客户端失败: ${err?.message || err}`)
    }
  }

  // Codex official reset
  const handleCodexOfficialReset = async () => {
    setBusy(true)
    try {
      await RestoreCodexOfficialConfig()
      showNotification("success", "Codex 已重置为官方登录配置")
      await loadAgents(selectedId)
    } catch (err: any) {
      showNotification("error", `重置失败: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  // Restore specific backup
  const handleRestoreBackup = async (fileName: string) => {
    if (!selectedId) return
    setBusy(true)
    try {
      await RestoreSpecificBackup(selectedId, fileName)
      showNotification("success", "已成功从备份恢复配置")
      await loadAgents(selectedId)
    } catch (err: any) {
      showNotification("error", `恢复备份失败: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">智能体配置</h1>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="secondary" className="text-xs py-0.5 px-2 gap-1 font-normal">
                <ShieldCheck className="size-3.5 text-emerald-500" />
                <span>已安装 {installedAgents.length} / {agents.length}</span>
              </Badge>
              {configuredCount > 0 && (
                <Badge variant="success" className="text-xs py-0.5 px-2 gap-1 font-normal">
                  <Zap className="size-3.5" />
                  <span>已接入 {configuredCount} 款</span>
                </Badge>
              )}
              {detecting && (
                <Badge variant="outline" className="text-[11px] py-0.5 px-2 gap-1 text-muted-foreground animate-pulse">
                  <RefreshCw className="size-3 animate-spin text-primary" />
                  <span>正在检测中...</span>
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            原生智能体客户端一键路由与上下文精细化控制（写前事务化备份，支持秒级逆序回滚）
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAgents(selectedId)}
          disabled={detecting || busy}
          className="h-8 text-xs gap-1.5 shrink-0"
          title="重新检测本机安装状态与配置"
        >
          <RefreshCw className={`size-3.5 ${detecting ? "animate-spin text-primary" : ""}`} />
          <span>{detecting ? "检测中..." : "重新检测"}</span>
        </Button>
      </div>

      {/* Notice notification */}
      {notice && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
            notice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : notice.type === "error"
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-primary/10 border-primary/20 text-primary"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Main Two-Column Master-Detail Layout */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Left Master Sidebar */}
        <div className="w-full md:w-68 shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Bot className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-foreground truncate">本机客户端</h2>
                <p className="text-[10px] text-muted-foreground truncate">
                  {detecting ? "正在检测..." : "选择管理的智能体"}
                </p>
              </div>
            </div>

            {/* Select Filter Component */}
            <div className="w-[110px] shrink-0">
              {initialLoading ? (
                <Skeleton className="h-7 w-full rounded-lg" />
              ) : (
                <Select
                  value={listFilter}
                  onValueChange={(val) => {
                    if (val) handleFilterChange(val as "installed" | "uninstalled" | "all")
                  }}
                >
                  <SelectTrigger className="h-7 text-[11px] px-2 py-0 bg-background/90 border-border/60">
                    <SelectValue placeholder="筛选...">
                      {(val: string | null) => {
                        if (val === "installed") return `已安装 (${installedAgents.length})`
                        if (val === "uninstalled") return `未安装 (${uninstalledAgents.length})`
                        return `全部 (${agents.length})`
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end" className="w-[130px]">
                    <SelectItem value="installed">
                      已安装 ({installedAgents.length})
                    </SelectItem>
                    <SelectItem value="uninstalled">
                      未安装 ({uninstalledAgents.length})
                    </SelectItem>
                    <SelectItem value="all">
                      全部 ({agents.length})
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Empty Prompt if displayed list is empty */}
          {displayedAgents.length === 0 && !detecting && (
            <div className="p-3 rounded-xl border border-dashed border-border/60 bg-muted/20 text-center space-y-1">
              <p className="text-xs text-muted-foreground">
                {listFilter === "installed"
                  ? "未检测到已安装的客户端"
                  : listFilter === "uninstalled"
                    ? "暂无未安装客户端"
                    : "暂无客户端"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {listFilter === "installed"
                  ? "可切换为“全部”查看所有客户端"
                  : "可切换为“已安装”查看当前就绪的客户端"}
              </p>
            </div>
          )}

          {/* Agent list items or skeleton */}
          {initialLoading ? (
            <div className="space-y-1.5 animate-in fade-in-50 duration-200">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between w-full p-2.5 rounded-xl border border-border/40 bg-card/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Skeleton className="size-7 rounded-lg shrink-0" />
                    <div className="space-y-1.5 min-w-0">
                      <Skeleton className="h-3.5 w-24 rounded-xs" />
                      <Skeleton className="h-2.5 w-16 rounded-xs" />
                    </div>
                  </div>
                  <Skeleton className="size-2 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {displayedAgents.map((client) => {
                const active = selectedId === client.id
                const icon = clientIcons[client.id] || clientIcons["claude-code"]
                const isConfigured = client.configured
                const isInstalled = client.installed

                let statusText = "未安装"
                if (isConfigured) {
                  statusText = `已配置 · ${client.currentModel || "CPA"}`
                } else if (isInstalled) {
                  statusText = `已安装 · ${client.version ? client.version.slice(0, 14) : "就绪"}`
                } else if (client.configFound) {
                  statusText = "仅有配置"
                }

                return (
                  <button
                    key={client.id}
                    onClick={() => handleSelectAgent(client.id)}
                    className={`flex items-center justify-between w-full p-2.5 rounded-xl border text-left transition-all ${
                      active
                        ? "bg-card border-border shadow-xs"
                        : "border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-7 rounded-lg bg-muted/60 p-1 flex items-center justify-center shrink-0 border border-border/30">
                        <img src={icon} alt="" className="size-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-foreground truncate">{client.name}</p>
                          {isInstalled && (
                            <span className="text-[9px] px-1 py-0.2 rounded-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                              已装
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{statusText}</p>
                      </div>
                    </div>

                    {/* Status Indicator Dot */}
                    <div
                      className={`size-2 rounded-full shrink-0 ${
                        isConfigured
                          ? "bg-emerald-500 ring-2 ring-emerald-500/20"
                          : isInstalled
                            ? "bg-emerald-500/70"
                            : client.configFound
                              ? "bg-amber-500/60"
                              : "bg-muted-foreground/30"
                      }`}
                      title={
                        isConfigured
                          ? "已接入代理"
                          : isInstalled
                            ? "已安装"
                            : client.configFound
                              ? "仅有配置"
                              : "未安装"
                      }
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Detail Panel - Only shown when an agent is selected */}
        {selectedAgent ? (
          <div className="flex-1 w-full space-y-6">
            {/* Tabs: 基础配置 / 配置管理 */}
            <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border/40 w-fit">
              <button
                onClick={() => setActiveSubpage("core")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeSubpage === "core"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                基础配置
              </button>
              <button
                onClick={() => setActiveSubpage("management")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeSubpage === "management"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                配置管理
              </button>
            </div>

            {/* Subpage: 基础配置 */}
            {activeSubpage === "core" && (
              <div className="space-y-6">
                {/* Top Status Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                      <ShieldCheck className={`size-3.5 ${selectedAgent.installed ? "text-emerald-500" : "text-muted-foreground"}`} />
                      安装状态
                    </span>
                    <p
                      className={`text-sm font-semibold ${
                        selectedAgent.installed
                          ? "text-emerald-600 dark:text-emerald-400"
                          : selectedAgent.configFound
                            ? "text-amber-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      {selectedAgent.installed
                        ? "已检测到客户端"
                        : selectedAgent.configFound
                          ? "只检测到配置文件"
                          : "未检测到客户端安装"}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Terminal className="size-3.5" /> 客户端版本
                    </span>
                    <p
                      className="text-sm font-semibold font-mono text-foreground truncate"
                      title={selectedAgent.version || selectedAgent.executablePath}
                    >
                      {selectedAgent.version || (selectedAgent.installed ? "已就绪" : "—")}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Zap className={`size-3.5 ${selectedAgent.configured ? "text-emerald-500" : "text-muted-foreground"}`} />
                      代理接入
                    </span>
                    <p
                      className={`text-sm font-semibold ${
                        selectedAgent.configured ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      }`}
                    >
                      {selectedAgent.configured ? "已接入本地代理" : "未接入代理"}
                    </p>
                  </div>
                </div>

                {/* Warnings alert if any */}
                {selectedAgent.warnings && selectedAgent.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>{selectedAgent.warnings.join("；")}</span>
                  </div>
                )}

                {/* Per-Agent Granular Configuration Block */}
                <Card className="border border-border/60 shadow-xs">
                  <CardHeader className="pb-4 border-b border-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {selectedAgent.id === "claude-code"
                            ? "Claude Code 模型 → 上游模型"
                            : `${selectedAgent.name} 模型 → 上游模型`}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedAgent.id === "claude-code"
                            ? "分别为不同任务角色选择上游模型，并统一配置上下文窗口与自动压缩。"
                            : `为 ${selectedAgent.name} 智能体指定驱动模型及网关接入参数。`}
                        </p>
                      </div>

                      {/* Top right switch for Claude Code */}
                      {selectedAgent.id === "claude-code" && (
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span className="text-xs text-muted-foreground font-medium">使用模型别名</span>
                          <Switch
                            checked={claudeDraft.customMapping}
                            onCheckedChange={(val) =>
                              setClaudeDraft((prev) => ({ ...prev, customMapping: val }))
                            }
                            className="scale-90"
                          />
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-6 space-y-6">
                    {/* Claude Code Configuration Area */}
                    {selectedAgent.id === "claude-code" && (
                      <div className="space-y-6">
                        {/* Context and Auto Compact Box */}
                        <div className="p-4 rounded-xl bg-muted/40 border border-border/40 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                          {/* Max Context Tokens */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">最大窗口</label>
                            <Input
                              type="number"
                              min={100000}
                              max={1000000}
                              step={1000}
                              value={claudeDraft.maxContextTokens}
                              onChange={(e) =>
                                setClaudeDraft((prev) => ({
                                  ...prev,
                                  maxContextTokens: Number(e.target.value) || 200000,
                                }))
                              }
                              className="h-8 font-mono text-xs bg-background"
                            />
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              Claude Code 默认 200000；请勿超过上游模型实际支持的窗口。
                            </p>
                          </div>

                          {/* Auto Compact Percentage */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">触发压缩百分比</label>
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                value={claudeDraft.autoCompactPct}
                                disabled={claudeDraft.disableAutoCompact}
                                onChange={(e) =>
                                  setClaudeDraft((prev) => ({
                                    ...prev,
                                    autoCompactPct: Number(e.target.value) || 90,
                                  }))
                                }
                                className="h-8 font-mono text-xs bg-background"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              默认 90%；调低后会更早自动压缩。
                            </p>
                          </div>

                          {/* Disable Auto Compact */}
                          <div className="flex items-center justify-between p-3 rounded-lg bg-background/60 border border-border/30">
                            <div>
                              <p className="text-xs font-medium text-foreground">禁止自动压缩</p>
                              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                开启后仅允许用户通过 /compact 手动压缩。
                              </p>
                            </div>
                            <Switch
                              checked={claudeDraft.disableAutoCompact}
                              onCheckedChange={(val) =>
                                setClaudeDraft((prev) => ({ ...prev, disableAutoCompact: val }))
                              }
                            />
                          </div>
                        </div>

                        {/* 3 Role Mappings Cards: Opus, Sonnet, Haiku */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {/* Opus */}
                          <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-foreground">Opus</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-muted-foreground">1M</span>
                                <Switch
                                  checked={claudeDraft.opus1M}
                                  onCheckedChange={(val) => handleToggle1M("opus", val)}
                                  className="scale-75"
                                />
                              </div>
                            </div>
                            <select
                              value={claudeDraft.opus}
                              onChange={(e) =>
                                setClaudeDraft((prev) => ({ ...prev, opus: e.target.value }))
                              }
                              className="w-full h-8 text-xs font-mono bg-background border border-input rounded-md px-2 focus:outline-hidden"
                            >
                              {models.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Sonnet */}
                          <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-foreground">Sonnet</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-muted-foreground">1M</span>
                                <Switch
                                  checked={claudeDraft.sonnet1M}
                                  onCheckedChange={(val) => handleToggle1M("sonnet", val)}
                                  className="scale-75"
                                />
                              </div>
                            </div>
                            <select
                              value={claudeDraft.sonnet}
                              onChange={(e) =>
                                setClaudeDraft((prev) => ({ ...prev, sonnet: e.target.value }))
                              }
                              className="w-full h-8 text-xs font-mono bg-background border border-input rounded-md px-2 focus:outline-hidden"
                            >
                              {models.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Haiku */}
                          <div className="p-3.5 rounded-xl border border-border/50 bg-card space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-foreground">Haiku</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-muted-foreground">1M</span>
                                <Switch
                                  checked={claudeDraft.haiku1M}
                                  onCheckedChange={(val) => handleToggle1M("haiku", val)}
                                  className="scale-75"
                                />
                              </div>
                            </div>
                            <select
                              value={claudeDraft.haiku}
                              onChange={(e) =>
                                setClaudeDraft((prev) => ({ ...prev, haiku: e.target.value }))
                              }
                              className="w-full h-8 text-xs font-mono bg-background border border-input rounded-md px-2 focus:outline-hidden"
                            >
                              {models.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Codex Configuration Area */}
                    {selectedAgent.id === "codex" && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">目标驱动模型</label>
                          <select
                            value={codexModel}
                            onChange={(e) => setCodexModel(e.target.value)}
                            className="w-full h-8 text-xs font-mono bg-background border border-input rounded-md px-2.5 focus:outline-hidden"
                          >
                            {models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Connection Auth Method */}
                        <div className="p-3 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-foreground">认证连接方式</p>
                            <p className="text-[10px] text-muted-foreground">
                              {codexAuthMethod === "oauth"
                                ? "使用官方 ChatGPT OAuth 授权令牌（支持官方模型）"
                                : "使用本地网关通用 API Key 访问"}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 p-0.5 bg-background rounded-lg border border-border/60">
                            <button
                              type="button"
                              onClick={() => setCodexAuthMethod("apikey")}
                              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                                codexAuthMethod === "apikey"
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              API Key
                            </button>
                            <button
                              type="button"
                              onClick={() => setCodexAuthMethod("oauth")}
                              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                                codexAuthMethod === "oauth"
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              OAuth
                            </button>
                          </div>
                        </div>

                        {/* Codex Official Native OAuth Controls */}
                        {codexNativeStatus && (
                          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between">
                            <div className="space-y-0.5">
                              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                <Zap className="size-3.5 text-primary" /> Codex 官方登录态
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {codexNativeStatus.accountEmail
                                  ? `当前账号: ${codexNativeStatus.accountEmail}`
                                  : "恢复官方配置以重新登录 ChatGPT 账号"}
                              </p>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCodexOfficialReset}
                              disabled={busy}
                              className="h-7 text-xs"
                            >
                              重置官方登录
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Other Agents Configuration Area */}
                    {selectedAgent.id !== "claude-code" && selectedAgent.id !== "codex" && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">目标驱动模型</label>
                          <select
                            value={standardModel}
                            onChange={(e) => setStandardModel(e.target.value)}
                            className="w-full h-8 text-xs font-mono bg-background border border-input rounded-md px-2.5 focus:outline-hidden"
                          >
                            {models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Action buttons row: 关闭配置修改 / 更新配置 */}
                    <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/40">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || !selectedAgent.configured}
                        onClick={handleCloseConfig}
                        className="h-8 px-4 text-xs"
                      >
                        关闭配置修改
                      </Button>

                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={busy}
                        onClick={handleApplyConfig}
                        className="h-8 px-5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                      >
                        {busy ? "正在写入..." : "更新配置"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Launch Control Section (运行控制) */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-semibold text-foreground">运行控制</h3>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLaunchAgent}
                      disabled={!selectedAgent.installed}
                      className="h-8 text-xs gap-1.5 font-mono"
                      title={selectedAgent.installed ? `启动 ${selectedAgent.name}` : "未检测到客户端安装"}
                    >
                      <Play className="size-3 fill-current" />
                      启动 {selectedAgent.name}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Subpage: 配置管理 */}
            {activeSubpage === "management" && (
              <div className="space-y-4">
                <Card className="border border-border/60 shadow-xs">
                  <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">历史备份快照</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        每次改写前自动创建的事务化快照，可随时秒级还原
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-2">
                    {loadingBackups ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">正在拉取历史备份...</div>
                    ) : backups.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">暂无历史备份记录</div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {backups.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-muted/30 text-xs"
                          >
                            <div className="space-y-0.5">
                              <p className="font-medium text-foreground">{b.createdAt}</p>
                              <p className="font-mono text-[10px] text-muted-foreground truncate max-w-sm">
                                {b.filePath}
                              </p>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestoreBackup(b.id)}
                              disabled={busy}
                              className="h-7 text-xs gap-1"
                            >
                              <RotateCcw className="size-3" />
                              恢复
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 w-full min-h-[460px] flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-border/60 bg-card/20 text-center">
            <div className="size-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center mb-3.5 shadow-2xs">
              <Bot
                className={`size-7 ${
                  initialLoading ? "text-primary animate-pulse" : "text-muted-foreground/60"
                }`}
              />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {initialLoading ? "正在检测本机智能体客户端..." : "请选择需要配置的智能体"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {initialLoading
                ? "正在探测本机安装的智能体和运行环境，检测完成后请在左侧选择客户端"
                : "请从左侧列表中选择一个智能体客户端，以查看其安装状态并配置代理模型及上下文策略"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
