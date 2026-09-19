import { useState, useEffect } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import {
  ListAgents,
  ApplyAgentConfig,
  RestoreAgentConfig,
  ListBackups,
  RestoreSpecificBackup,
} from "../../bindings/easycliproxyapi/internal/service/agentservice"
import type {
  AgentInfo,
  BackupEntry,
} from "../../bindings/easycliproxyapi/internal/model/models"
import {
  Bot,
  Sparkles,
  RotateCcw,
  History,
  FileCode,
  Terminal,
  Check,
  AlertCircle,
  X,
} from "lucide-react"

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [actionSuccess, setActionSuccess] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  // Backup dialog state
  const [activeBackupClient, setActiveBackupClient] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)

  const loadAgents = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await ListAgents()
      if (list) {
        setAgents(list)
        // Set default selected model
        const modelMap: Record<string, string> = {}
        for (const a of list) {
          if (a.currentModel) {
            modelMap[a.id] = a.currentModel
          } else if (a.supportedModels && a.supportedModels.length > 0) {
            modelMap[a.id] = a.supportedModels[0]
          }
        }
        setSelectedModels(modelMap)
      }
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handleApply = async (client: AgentInfo) => {
    const chosenModel = selectedModels[client.id] || ""
    setActionLoading((prev) => ({ ...prev, [client.id]: true }))
    setError(null)
    try {
      await ApplyAgentConfig(client.id, chosenModel)
      setActionSuccess((prev) => ({ ...prev, [client.id]: "配置成功" }))
      await loadAgents()
      setTimeout(() => {
        setActionSuccess((prev) => {
          const next = { ...prev }
          delete next[client.id]
          return next
        })
      }, 3000)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setActionLoading((prev) => ({ ...prev, [client.id]: false }))
    }
  }

  const handleRestore = async (client: AgentInfo) => {
    setActionLoading((prev) => ({ ...prev, [client.id]: true }))
    setError(null)
    try {
      await RestoreAgentConfig(client.id)
      setActionSuccess((prev) => ({ ...prev, [client.id]: "已还原备份" }))
      await loadAgents()
      setTimeout(() => {
        setActionSuccess((prev) => {
          const next = { ...prev }
          delete next[client.id]
          return next
        })
      }, 3000)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setActionLoading((prev) => ({ ...prev, [client.id]: false }))
    }
  }

  const openBackupsDialog = async (clientId: string) => {
    setActiveBackupClient(clientId)
    setLoadingBackups(true)
    try {
      const list = await ListBackups(clientId)
      setBackups(list || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingBackups(false)
    }
  }

  const handleRestoreSpecific = async (backupId: string) => {
    if (!activeBackupClient) return
    try {
      await RestoreSpecificBackup(activeBackupClient, backupId)
      setActiveBackupClient(null)
      await loadAgents()
    } catch (err: any) {
      setError(err?.message || String(err))
    }
  }

  const configuredCount = agents.filter((a) => a.configured).length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">智能体客户端编排</h1>
          <p className="text-sm text-muted-foreground mt-1">
            一键安全改写第三方客户端配置，直连本地代理（写前自动备份，支持秒级逆序回滚）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 py-1 px-3">
            <Sparkles className="size-3 text-primary" />
            <span>已接入 {configuredCount} / {agents.length} 款智能体</span>
          </Badge>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          正在探测本机安装与配置状态...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((client) => {
            const isConfigured = client.configured
            const isBusy = actionLoading[client.id] ?? false
            const successMsg = actionSuccess[client.id]

            return (
              <Card
                key={client.id}
                className={`flex flex-col justify-between transition-all ${
                  isConfigured
                    ? "border-emerald-500/40 bg-emerald-500/5 shadow-xs"
                    : "hover:border-primary/40"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center ${
                          isConfigured
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        <Bot className="size-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{client.name}</CardTitle>
                        <span className="text-[11px] text-muted-foreground">
                          {client.description}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant={
                        isConfigured
                          ? "success"
                          : client.configFound
                          ? "outline"
                          : "secondary"
                      }
                      className="text-[10px] shrink-0"
                    >
                      {isConfigured
                        ? "已接入代理"
                        : client.configFound
                        ? "已装未配置"
                        : "待接入"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 flex-1 text-xs">
                  {/* CLI status & Format */}
                  <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-border/40">
                    <span className="flex items-center gap-1">
                      <Terminal className="size-3" />
                      CLI: <code>{client.executable}</code>
                    </span>
                    <span className="font-mono text-[10px]">
                      格式: {client.format}
                    </span>
                  </div>

                  {/* Target Model Selection */}
                  <div className="space-y-1">
                    <label className="text-muted-foreground text-[11px] font-medium">
                      目标驱动模型
                    </label>
                    <select
                      className="w-full h-8 px-2.5 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      value={selectedModels[client.id] || ""}
                      onChange={(e) =>
                        setSelectedModels((prev) => ({
                          ...prev,
                          [client.id]: e.target.value,
                        }))
                      }
                    >
                      {client.supportedModels?.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Config path preview */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <FileCode className="size-3" /> 托管文件路径
                    </span>
                    <div
                      className="font-mono text-[10px] text-muted-foreground/80 truncate p-1.5 rounded bg-muted/40"
                      title={client.configPaths?.[0] || ""}
                    >
                      {client.configPaths?.[0] || "未指定"}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 flex items-center gap-2 border-t border-border/40">
                  <Button
                    variant={isConfigured ? "outline" : "default"}
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleApply(client)}
                    className="flex-1 text-xs h-7 gap-1"
                  >
                    {isBusy ? (
                      "写入中..."
                    ) : successMsg ? (
                      <>
                        <Check className="size-3 text-emerald-500" />
                        {successMsg}
                      </>
                    ) : isConfigured ? (
                      "更新配置"
                    ) : (
                      "一键接入"
                    )}
                  </Button>

                  {isConfigured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => handleRestore(client)}
                      className="text-xs h-7 text-muted-foreground hover:text-foreground"
                      title="还原到接入前配置"
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openBackupsDialog(client.id)}
                    className="text-xs h-7 text-muted-foreground hover:text-foreground"
                    title="查看历史备份"
                  >
                    <History className="size-3" />
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Backups Dialog / Sheet */}
      {activeBackupClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">配置历史备份</h3>
                <p className="text-xs text-muted-foreground">
                  客户端 {activeBackupClient} 的事务化还原快照
                </p>
              </div>
              <button
                onClick={() => setActiveBackupClient(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {loadingBackups ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  正在读取历史备份...
                </div>
              ) : backups.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  暂无历史备份记录。每次点击"一键接入"前均会自动生成快照。
                </div>
              ) : (
                backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs"
                  >
                    <div>
                      <div className="font-mono text-xs font-medium">
                        {b.createdAt}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[220px]">
                        {b.id}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreSpecific(b.id)}
                      className="text-xs h-6 px-2 gap-1"
                    >
                      <RotateCcw className="size-3" />
                      还原
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveBackupClient(null)}
                className="text-xs"
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
