import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Clock,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react"
import antigravityIcon from "../../assets/icons/antigravity.svg"
import claudeIcon from "../../assets/icons/claude.svg"
import codexIcon from "../../assets/icons/codex.svg"
import grokIcon from "../../assets/icons/grok.svg"
import devinIcon from "../../assets/icons/devin.svg"
import kimiIcon from "../../assets/icons/kimi-light.svg"
import {
  managementApi,
  readBoolean,
  responseList,
} from "../../services/managementApi"
import { authFileName, dedupeAuthFiles, type AuthFileRecord } from "../../services/authFiles"
import {
  loadQuota,
  providerForFile,
  quotaKey,
  type QuotaRow,
  type QuotaState,
} from "../../services/quotaService"
import {
  canResetCodexQuota,
  resetCodexQuotaWithConfirmation,
} from "../../services/quotaActions"
import { useQuotaCache, pruneQuotaCache } from "../../services/quotaCache"
import { formatQuotaReset, useQuotaClock } from "../../services/quotaTime"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Badge } from "../../components/ui/badge"

const providerIcons: Record<string, string> = {
  antigravity: antigravityIcon,
  claude: claudeIcon,
  codex: codexIcon,
  kimi: kimiIcon,
  xai: grokIcon,
  devin: devinIcon,
}

export function QuotaPage() {
  const [files, setFiles] = useState<AuthFileRecord[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [confirmingCodexFile, setConfirmingCodexFile] = useState<AuthFileRecord | null>(null)
  const [resettingCodex, setResettingCodex] = useState(false)
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null)

  const quotaCache = useQuotaCache()
  const clock = useQuotaClock()

  const showNotification = (type: "success" | "error" | "info", text: string) => {
    setNotice({ type, text })
    setTimeout(() => {
      setNotice((cur) => (cur?.text === text ? null : cur))
    }, 4000)
  }

  const loadFilesAndQuotas = useCallback(async (force = false) => {
    if (!force) setLoadingFiles(true)
    else setRefreshingAll(true)

    try {
      const payload = await managementApi.get("/auth-files")
      const rawList = responseList<AuthFileRecord>(payload, "files")
      const deduped = dedupeAuthFiles(rawList).filter((f) => !readBoolean(f, "disabled"))
      setFiles(deduped)

      const validKeys = new Set(deduped.map(quotaKey))
      pruneQuotaCache(validKeys)

      // Query quotas in parallel
      await Promise.allSettled(
        deduped.map(async (file) => {
          if (providerForFile(file)) {
            await loadQuota(file)
          }
        }),
      )
    } catch (err: any) {
      showNotification("error", `获取凭据与额度失败: ${err?.message || err}`)
    } finally {
      setLoadingFiles(false)
      setRefreshingAll(false)
    }
  }, [])

  useEffect(() => {
    loadFilesAndQuotas()
  }, [loadFilesAndQuotas])

  const handleRefreshSingle = async (file: AuthFileRecord) => {
    try {
      await loadQuota(file)
    } catch (e) {
      console.warn("Refresh quota error", e)
    }
  }

  const handleConfirmResetCredit = async () => {
    if (!confirmingCodexFile) return
    setResettingCodex(true)
    try {
      const outcome = await resetCodexQuotaWithConfirmation(confirmingCodexFile, async () => true)
      if (outcome === "success") {
        showNotification("success", "Codex 重置额度已成功消费并刷新！")
      } else if (outcome === "refresh-error") {
        showNotification("info", "重置请求已发送，但刷新失败，请稍后手动刷新")
      } else if (outcome === "error") {
        showNotification("error", "重置请求失败")
      }
    } catch (err: any) {
      showNotification("error", `重置失败: ${err?.message || err}`)
    } finally {
      setResettingCodex(false)
      setConfirmingCodexFile(null)
    }
  }

  const quotaSupportedFiles = useMemo(() => {
    return files.filter((f) => providerForFile(f) !== null)
  }, [files])

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-xs">
        <div>
          <h2 className="text-base font-semibold tracking-tight">上游配额中心</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            实时查询官方订阅额度、重置倒计时与使用状态（代发请求全程不触碰令牌密钥）
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => loadFilesAndQuotas(true)}
          disabled={refreshingAll || loadingFiles}
          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${refreshingAll ? "animate-spin" : ""}`} />
          刷新全部配额
        </Button>
      </div>

      {/* Notice */}
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
          <AlertCircle className="size-4 shrink-0" />
          <span>{notice.text}</span>
        </div>
      )}

      {/* Quota Cards Grid */}
      {loadingFiles ? (
        <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span>正在拉取凭据与配额...</span>
        </div>
      ) : quotaSupportedFiles.length === 0 ? (
        <div className="p-12 rounded-xl border border-border/60 bg-card text-center text-xs text-muted-foreground space-y-1">
          <Gauge className="size-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="font-medium text-foreground">暂无可查询配额的活跃 OAuth 凭据</p>
          <p className="text-[11px]">请先在“OAuth 登录”页面授权或在“凭证文件管理”中启用凭据</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quotaSupportedFiles.map((file) => {
            const name = authFileName(file)
            const provider = providerForFile(file) || "other"
            const icon = providerIcons[provider]
            const key = quotaKey(file)
            const q: QuotaState = quotaCache[key] || { status: "idle", rows: [] }

            const isLoading = q.status === "loading"
            const isError = q.status === "error"
            const hasRows = q.rows && q.rows.length > 0
            const canReset = canResetCodexQuota(file, q)

            return (
              <Card key={key} className="flex flex-col border border-border/60 shadow-xs">
                <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-2.5">
                    {icon && (
                      <div className="size-7 rounded-lg bg-muted/60 p-1 flex items-center justify-center border border-border/30">
                        <img src={icon} alt="" className="size-full object-contain" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-xs font-mono font-semibold line-clamp-1" title={name}>
                        {name}
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground capitalize">{provider}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {q.plan && (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 uppercase">
                        {q.plan}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRefreshSingle(file)}
                      disabled={isLoading}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      title="刷新该账号配额"
                    >
                      <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 pt-1 text-xs">
                  {/* Idle state */}
                  {q.status === "idle" && (
                    <div className="p-4 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                      <span>尚未获取该账号配额</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRefreshSingle(file)}
                        className="h-7 text-xs"
                      >
                        获取配额
                      </Button>
                    </div>
                  )}

                  {/* Error display */}
                  {isError && (
                    <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                        <span className="break-all">{q.error || "获取配额失败"}</span>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRefreshSingle(file)}
                          className="h-6 text-[10px] px-2 text-foreground"
                        >
                          重试
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Loading spinner */}
                  {isLoading && !hasRows && (
                    <div className="p-6 text-center text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <span>正在查询最新额度...</span>
                    </div>
                  )}

                  {/* Quota Rows */}
                  {hasRows && (
                    <div className="space-y-2.5">
                      {q.rows.map((row: QuotaRow, idx: number) => {
                        const percent = row.remainingPercent
                        const hasPercent = percent !== null && Number.isFinite(percent)
                        const resetLabel = formatQuotaReset(row.resetAtMs, row.reset, "zh-CN", clock)

                        // Color badge based on remaining %
                        let barColor = "bg-primary"
                        if (hasPercent) {
                          if (percent >= 50) barColor = "bg-emerald-500"
                          else if (percent >= 20) barColor = "bg-amber-500"
                          else barColor = "bg-destructive"
                        }

                        return (
                          <div key={idx} className="p-2.5 rounded-lg bg-muted/40 border border-border/30 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-foreground">{row.label}</span>
                              <span className="font-mono text-xs font-semibold">
                                {hasPercent ? `${percent.toFixed(1)}%` : "—"}
                              </span>
                            </div>

                            {/* Progress bar */}
                            {hasPercent && (
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${barColor}`}
                                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                />
                              </div>
                            )}

                            {/* Reset countdown & detail */}
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                              {resetLabel ? (
                                <span className="flex items-center gap-1" title="预计重置时刻">
                                  <Clock className="size-3 shrink-0" />
                                  {resetLabel}
                                </span>
                              ) : (
                                <span />
                              )}
                              {row.detail && (
                                <span className="font-mono text-[10px] text-muted-foreground/80">
                                  {row.detail}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Codex Reset Credits Section */}
                  {provider === "codex" && q.resetCredits !== undefined && (
                    <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary shrink-0" />
                        <div>
                          <p className="font-medium text-xs text-foreground">
                            可用主动重置次数: <span className="font-mono text-primary font-bold">{q.resetCredits}</span> 次
                          </p>
                          {q.resetCreditsEarliestExpiry && (
                            <p className="text-[10px] text-muted-foreground">
                              最早到期: {q.resetCreditsEarliestExpiry}
                            </p>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="default"
                        disabled={!canReset || resettingCodex}
                        onClick={() => setConfirmingCodexFile(file)}
                        className="h-7 text-xs gap-1"
                      >
                        <Zap className="size-3" />
                        消耗重置
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Codex Reset Confirmation Modal */}
      {confirmingCodexFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-primary/30 bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-primary">
              <Sparkles className="size-5 shrink-0" />
              <h3 className="font-semibold text-base text-foreground">确认消耗 Codex 重置次数？</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              本操作将立即消耗 <strong className="text-foreground">1 次</strong>官方 ChatGPT 主动重置额度机会，为凭据{" "}
              <code className="text-foreground font-mono">{authFileName(confirmingCodexFile)}</code> 恢复 5 小时限额。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={resettingCodex}
                onClick={() => setConfirmingCodexFile(null)}
                className="h-8 text-xs"
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={resettingCodex}
                onClick={handleConfirmResetCredit}
                className="h-8 text-xs gap-1.5"
              >
                {resettingCodex ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                确认消耗
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
