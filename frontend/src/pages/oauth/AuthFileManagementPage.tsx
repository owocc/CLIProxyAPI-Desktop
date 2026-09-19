import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  FolderOpen,
  Import,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Layers,
  FileCode,
} from "lucide-react"
import antigravityIcon from "../../assets/icons/antigravity.svg"
import claudeIcon from "../../assets/icons/claude.svg"
import codexIcon from "../../assets/icons/codex.svg"
import grokIcon from "../../assets/icons/grok.svg"
import devinIcon from "../../assets/icons/devin.svg"
import kimiIcon from "../../assets/icons/kimi-light.svg"
import {
  formatDate,
  managementApi,
  readBoolean,
  readString,
  responseList,
} from "../../services/managementApi"
import {
  authFileName,
  dedupeAuthFiles,
  isRuntimeOnlyAuthFile,
  normalizeAuthFilePriorityInput,
  parseAuthFilePriority,
  type AuthFileRecord,
} from "../../services/authFiles"
import {
  oauthModelsFromPayload,
  type OAuthModelDefinition,
} from "../../services/oauthModels"
import {
  loadOAuthModelSettings,
  saveOAuthModelSettings,
  type OAuthModelSettings,
} from "../../services/oauthModelSettings"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { Switch } from "../../components/ui/switch"
import { Input } from "../../components/ui/input"

const providerIcons: Record<string, string> = {
  antigravity: antigravityIcon,
  claude: claudeIcon,
  codex: codexIcon,
  kimi: kimiIcon,
  xai: grokIcon,
  devin: devinIcon,
}

const normalizeProviderKey = (file: AuthFileRecord): string => {
  const value = readString(file, "provider", "type", "account_type").toLowerCase().replace(/_/g, "-")
  if (value === "anthropic") return "claude"
  if (value === "anti-gravity") return "antigravity"
  if (value === "cognition") return "devin"
  if (value === "grok" || value === "x-ai") return "xai"
  return value || "other"
}

export function AuthFileManagementPage() {
  const [files, setFiles] = useState<AuthFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled" | "runtime">("all")
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null)

  // Dialogs state
  const [viewModelsFile, setViewModelsFile] = useState<AuthFileRecord | null>(null)
  const [modelsList, setModelsList] = useState<OAuthModelDefinition[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const [excludeModelsFile, setExcludeModelsFile] = useState<AuthFileRecord | null>(null)
  const [excludeSettings, setExcludeSettings] = useState<OAuthModelSettings | null>(null)
  const [loadingExclude, setLoadingExclude] = useState(false)
  const [savingExclude, setSavingExclude] = useState(false)
  const [customExcludeInput, setCustomExcludeInput] = useState("")

  const [deleteTarget, setDeleteTarget] = useState<AuthFileRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Priority inline edit state
  const [editingPriorityName, setEditingPriorityName] = useState<string | null>(null)
  const [editingPriorityValue, setEditingPriorityValue] = useState("")
  const [savingPriority, setSavingPriority] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const showNotification = (type: "success" | "error" | "info", text: string) => {
    setNotice({ type, text })
    setTimeout(() => {
      setNotice((cur) => (cur?.text === text ? null : cur))
    }, 4000)
  }

  const loadAuthFiles = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    try {
      const payload = await managementApi.get("/auth-files")
      const rawList = responseList<AuthFileRecord>(payload, "files")
      const deduped = dedupeAuthFiles(rawList)
      setFiles(deduped)
    } catch (err: any) {
      showNotification("error", `获取凭证列表失败: ${err?.message || err}`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAuthFiles()
  }, [loadAuthFiles])

  // File Upload
  const handleUploadFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return

    setRefreshing(true)
    let successCount = 0
    let failCount = 0
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i]
      try {
        await managementApi.uploadAuthFile(file)
        successCount++
      } catch (err) {
        console.error("Upload error for", file.name, err)
        failCount++
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = ""
    await loadAuthFiles(true)

    if (failCount === 0) {
      showNotification("success", `成功导入 ${successCount} 个凭证文件`)
    } else {
      showNotification("info", `导入完成: ${successCount} 个成功，${failCount} 个失败`)
    }
  }

  // Toggle Disabled Status
  const handleToggleStatus = async (file: AuthFileRecord) => {
    const name = authFileName(file)
    const currentDisabled = readBoolean(file, "disabled")
    try {
      await managementApi.patch("/auth-files/status", {
        name,
        disabled: !currentDisabled,
      })
      await loadAuthFiles(true)
      showNotification("success", `已${currentDisabled ? "启用" : "停用"}凭据: ${name}`)
    } catch (err: any) {
      showNotification("error", `修改状态失败: ${err?.message || err}`)
    }
  }

  // Save Priority
  const handleSavePriority = async (file: AuthFileRecord) => {
    const name = authFileName(file)
    const num = normalizeAuthFilePriorityInput(editingPriorityValue)
    if (num === null) {
      showNotification("error", "优先级必须是有效整数")
      return
    }

    setSavingPriority(true)
    try {
      await managementApi.patch("/auth-files/fields", {
        name,
        priority: num,
      })
      setEditingPriorityName(null)
      await loadAuthFiles(true)
      showNotification("success", `优先级已更新为 ${num}`)
    } catch (err: any) {
      showNotification("error", `修改优先级失败: ${err?.message || err}`)
    } finally {
      setSavingPriority(false)
    }
  }

  // View Models Dialog
  const handleOpenViewModels = async (file: AuthFileRecord) => {
    setViewModelsFile(file)
    setLoadingModels(true)
    try {
      const name = authFileName(file)
      const res = await managementApi.get("/auth-files/models", { name })
      setModelsList(oauthModelsFromPayload(res))
    } catch (err: any) {
      showNotification("error", `加载可用模型失败: ${err?.message || err}`)
    } finally {
      setLoadingModels(false)
    }
  }

  // Excluded Models Dialog
  const handleOpenExcludeModels = async (file: AuthFileRecord) => {
    setExcludeModelsFile(file)
    setLoadingExclude(true)
    try {
      const name = authFileName(file)
      const provider = normalizeProviderKey(file)
      const settings = await loadOAuthModelSettings({
        scope: "credential",
        name,
        provider,
        label: name,
      })
      setExcludeSettings(settings)
    } catch (err: any) {
      showNotification("error", `加载模型排除配置失败: ${err?.message || err}`)
    } finally {
      setLoadingExclude(false)
    }
  }

  const handleSaveExcludeSettings = async () => {
    if (!excludeSettings) return
    setSavingExclude(true)
    try {
      await saveOAuthModelSettings(excludeSettings, excludeSettings.excludedRules)
      setExcludeModelsFile(null)
      showNotification("success", "模型排除规则已更新")
    } catch (err: any) {
      showNotification("error", `保存排除规则失败: ${err?.message || err}`)
    } finally {
      setSavingExclude(false)
    }
  }

  const handleAddCustomExcludeRule = () => {
    const val = customExcludeInput.trim().toLowerCase()
    if (!val || !excludeSettings) return
    if (!excludeSettings.excludedRules.includes(val)) {
      setExcludeSettings({
        ...excludeSettings,
        excludedRules: [...excludeSettings.excludedRules, val],
      })
    }
    setCustomExcludeInput("")
  }

  const handleRemoveExcludeRule = (rule: string) => {
    if (!excludeSettings) return
    setExcludeSettings({
      ...excludeSettings,
      excludedRules: excludeSettings.excludedRules.filter((r) => r !== rule),
    })
  }

  // Delete Credential
  const handleDeleteCredential = async () => {
    if (!deleteTarget) return
    const name = authFileName(deleteTarget)
    setDeleting(true)
    try {
      await managementApi.delete("/auth-files", { query: { name } })
      setDeleteTarget(null)
      await loadAuthFiles(true)
      showNotification("success", `已删除凭据: ${name}`)
    } catch (err: any) {
      showNotification("error", `删除凭证失败: ${err?.message || err}`)
    } finally {
      setDeleting(false)
    }
  }

  // Filtered List
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const name = authFileName(file).toLowerCase()
      const provider = normalizeProviderKey(file)
      const disabled = readBoolean(file, "disabled")
      const isRuntime = isRuntimeOnlyAuthFile(file)

      if (search.trim()) {
        const query = search.trim().toLowerCase()
        if (!name.includes(query) && !provider.includes(query)) return false
      }

      if (providerFilter !== "all" && provider !== providerFilter) {
        return false
      }

      if (statusFilter === "enabled" && disabled) return false
      if (statusFilter === "disabled" && !disabled) return false
      if (statusFilter === "runtime" && !isRuntime) return false

      return true
    })
  }, [files, search, providerFilter, statusFilter])

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-xs">
        <div>
          <h2 className="text-base font-semibold tracking-tight">认证凭据管理</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            管理保存在内核的 OAuth 授权凭据文件、设置权重优先级与账号级模型黑名单
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFiles}
            accept=".json"
            multiple
            className="hidden"
          />
          <Button
            size="sm"
            variant="default"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs gap-1.5"
          >
            <Import className="size-3.5" /> 导入凭据
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => managementApi.openAuthFilesDirectory()}
            className="h-8 text-xs gap-1.5"
          >
            <FolderOpen className="size-3.5" /> 凭证目录
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => managementApi.openCoreLogsDirectory()}
            className="h-8 text-xs gap-1.5"
          >
            <FileCode className="size-3.5" /> 日志目录
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadAuthFiles(true)}
            disabled={refreshing}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="刷新凭证列表"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Floating Notice */}
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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索凭据文件名、厂商..."
            className="pl-8 h-8 text-xs bg-card/60"
          />
        </div>

        {/* Provider Select */}
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="text-xs bg-card/60 border border-border rounded-lg px-2.5 h-8 focus:outline-hidden font-medium"
        >
          <option value="all">所有厂商</option>
          <option value="codex">Codex</option>
          <option value="claude">Claude</option>
          <option value="antigravity">Antigravity</option>
          <option value="kimi">Kimi</option>
          <option value="xai">xAI</option>
          <option value="devin">Devin</option>
          <option value="vertex">Vertex</option>
          <option value="aistudio">AI Studio</option>
        </select>

        {/* Status Select */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="text-xs bg-card/60 border border-border rounded-lg px-2.5 h-8 focus:outline-hidden font-medium"
        >
          <option value="all">全部状态</option>
          <option value="enabled">仅已启用</option>
          <option value="disabled">仅已停用</option>
          <option value="runtime">运行时凭据</option>
        </select>
      </div>

      {/* Table Card */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>正在加载凭据列表...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">未找到匹配的凭据文件</p>
            <p className="text-[11px]">可在上方点击“导入凭据”添加 .json 凭据，或通过“OAuth 登录”直接获取</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border/40 text-[11px] text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-4">凭据名称 / 来源</th>
                  <th className="py-2.5 px-4">厂商</th>
                  <th className="py-2.5 px-4">优先级 (权重)</th>
                  <th className="py-2.5 px-4">更新时间</th>
                  <th className="py-2.5 px-4 text-center">状态</th>
                  <th className="py-2.5 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredFiles.map((file) => {
                  const name = authFileName(file)
                  const provider = normalizeProviderKey(file)
                  const isRuntime = isRuntimeOnlyAuthFile(file)
                  const disabled = readBoolean(file, "disabled")
                  const priority = parseAuthFilePriority(file.priority) ?? 0
                  const icon = providerIcons[provider]
                  const isEditingPriority = editingPriorityName === name

                  return (
                    <tr
                      key={name}
                      className={`hover:bg-muted/20 transition-colors ${
                        disabled ? "opacity-60 bg-muted/10" : ""
                      }`}
                    >
                      {/* Name / Source */}
                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xs" title={name}>
                            {name}
                          </span>
                          {isRuntime && (
                            <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-600 border-sky-500/30">
                              内存运行时
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Provider Badge */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {icon && <img src={icon} alt="" className="size-4 object-contain" />}
                          <span className="capitalize text-muted-foreground">{provider}</span>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4">
                        {isEditingPriority ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              value={editingPriorityValue}
                              onChange={(e) => setEditingPriorityValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSavePriority(file)
                                if (e.key === "Escape") setEditingPriorityName(null)
                              }}
                              className="h-6 w-16 text-xs px-1 font-mono"
                              autoFocus
                            />
                            <button
                              disabled={savingPriority}
                              onClick={() => handleSavePriority(file)}
                              className="text-emerald-500 hover:text-emerald-600"
                              title="保存"
                            >
                              <Check className="size-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingPriorityName(null)}
                              className="text-muted-foreground hover:text-foreground"
                              title="取消"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPriorityName(name)
                              setEditingPriorityValue(String(priority))
                            }}
                            className="font-mono text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
                            title="点击修改优先级（整数，支持负数）"
                          >
                            {priority}
                          </button>
                        )}
                      </td>

                      {/* Updated Date */}
                      <td className="py-3 px-4 text-muted-foreground">
                        {formatDate(file.modtime || file.updated_at || file.last_refresh)}
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="py-3 px-4 text-center">
                        <Switch
                          checked={!disabled}
                          onCheckedChange={() => handleToggleStatus(file)}
                          className="scale-75"
                        />
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenViewModels(file)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title="查看该凭据可用模型"
                          >
                            <Layers className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenExcludeModels(file)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title="配置模型排除规则"
                          >
                            <Settings2 className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isRuntime}
                            onClick={() => setDeleteTarget(file)}
                            className="h-7 px-2 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                            title={isRuntime ? "运行时凭据无法直接删除" : "删除此凭据文件"}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Models Dialog */}
      {viewModelsFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">可用模型清单</h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {authFileName(viewModelsFile)}
                </p>
              </div>
              <button
                onClick={() => setViewModelsFile(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {loadingModels ? (
                <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>正在拉取可用模型...</span>
                </div>
              ) : modelsList.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  未返回具体模型（或已应用全部排除规则）
                </div>
              ) : (
                modelsList.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 rounded-lg bg-muted/40 flex items-center justify-between font-mono"
                  >
                    <span>{m.id}</span>
                    {m.displayName && (
                      <span className="text-muted-foreground text-[11px]">{m.displayName}</span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border/40">
              <Button size="sm" variant="outline" onClick={() => setViewModelsFile(null)} className="h-8 text-xs">
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Excluded Models Dialog */}
      {excludeModelsFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">账号级模型排除</h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {authFileName(excludeModelsFile)}
                </p>
              </div>
              <button
                onClick={() => setExcludeModelsFile(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              被排除的模型将不会路由至此凭据（支持精确模型名或通配符，如 <code>claude-3-opus*</code>）
            </p>

            {loadingExclude ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>加载排除规则...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Add rule input */}
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder="输入排除规则 (如 gpt-4o* 或精确名)"
                    value={customExcludeInput}
                    onChange={(e) => setCustomExcludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCustomExcludeRule()
                    }}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddCustomExcludeRule}
                    className="h-8 text-xs whitespace-nowrap"
                  >
                    添加规则
                  </Button>
                </div>

                {/* Rules List */}
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {(!excludeSettings?.excludedRules || excludeSettings.excludedRules.length === 0) ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      当前未配置任何排除规则
                    </div>
                  ) : (
                    excludeSettings.excludedRules.map((rule) => (
                      <div
                        key={rule}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/40 font-mono text-xs"
                      >
                        <span>{rule}</span>
                        <button
                          onClick={() => handleRemoveExcludeRule(rule)}
                          className="text-muted-foreground hover:text-destructive"
                          title="移除规则"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExcludeModelsFile(null)}
                className="h-8 text-xs"
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={savingExclude}
                onClick={handleSaveExcludeSettings}
                className="h-8 text-xs"
              >
                {savingExclude ? <Loader2 className="size-3.5 animate-spin" /> : "保存规则"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-destructive/30 bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="size-5 shrink-0" />
              <h3 className="font-semibold text-base text-foreground">确认删除凭据文件？</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              即将永久删除凭据文件{" "}
              <strong className="text-foreground font-mono">{authFileName(deleteTarget)}</strong>
              。删除后该账号将停止提供服务。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="h-8 text-xs"
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={handleDeleteCredential}
                className="h-8 text-xs gap-1.5"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
