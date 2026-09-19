import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react"
import {
  StartOAuthLogin,
  GetOAuthStatus,
  SubmitOAuthCallback,
  ListOAuthBrowsers,
  OpenOAuthUrl,
} from "../../../bindings/easycliproxyapi/internal/service/oauthservice"
import type {
  OAuthBrowserOption,
  OAuthStartResult,
} from "../../../bindings/easycliproxyapi/internal/model/models"
import {
  changedOAuthAuthFileNames,
  snapshotAuthFiles,
  type AuthFileSnapshot,
  type AuthFileRecord,
} from "../../services/authFiles"
import { managementApi, responseList } from "../../services/managementApi"
import { createOAuthLoginSuccessCache } from "../../services/oauthLoginState"
import { validateDevinCallback } from "../../services/devinOAuth"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import {
  ProviderGradientIcon,
  PROVIDER_GRADIENTS,
  type SupportedProviderId,
} from "../../components/ProviderGradientIcon"

export type OAuthProviderId = SupportedProviderId
export type OAuthFlowStatus = "idle" | "waiting" | "success" | "error"

interface OAuthProviderState {
  url?: string
  state?: string
  status: OAuthFlowStatus
  error?: string
  polling?: boolean
  callbackUrl?: string
  callbackSubmitting?: boolean
  callbackStatus?: "success" | "error"
  callbackError?: string
  copied?: boolean
}

const PROVIDER_LIST: { id: OAuthProviderId; title: string }[] = [
  { id: "codex", title: "Codex" },
  { id: "claude", title: "Claude" },
  { id: "antigravity", title: "Antigravity" },
  { id: "kimi", title: "Kimi" },
  { id: "xai", title: "xAI (Grok)" },
  { id: "devin", title: "Devin" },
]

const OAUTH_CALLBACK_SUPPORTED = new Set<OAuthProviderId>([
  "codex",
  "claude",
  "antigravity",
  "xai",
  "devin",
])

const OAUTH_POLL_INTERVAL_MS = 3000
const OAUTH_POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes timeout
const OAUTH_BROWSER_STORAGE_KEY = "easy-cli-proxy-api.oauth-browser.v3"
const NO_AUTO_OPEN_BROWSER_ID = "none"
const oauthLoginSuccessCache = createOAuthLoginSuccessCache<OAuthProviderId>()

const resolveOAuthBrowserSelection = (
  available: OAuthBrowserOption[],
  preferred: string,
): string => {
  if (preferred === NO_AUTO_OPEN_BROWSER_ID) return preferred
  if (available.some((b) => b.id === preferred)) return preferred
  return (
    available.find((b) => b.id !== "default")?.id ??
    available.find((b) => b.id === "default")?.id ??
    NO_AUTO_OPEN_BROWSER_ID
  )
}

const loadOAuthBrowserPreference = (): string => {
  try {
    return window.localStorage.getItem(OAUTH_BROWSER_STORAGE_KEY)?.trim() || ""
  } catch {
    return ""
  }
}

export function OAuthLoginPage() {
  const [states, setStates] = useState<Partial<Record<OAuthProviderId, OAuthProviderState>>>({})
  const [browsers, setBrowsers] = useState<OAuthBrowserOption[]>([])
  const [browsersLoading, setBrowsersLoading] = useState(true)
  const [selectedBrowser, setSelectedBrowser] = useState(loadOAuthBrowserPreference)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const pollingTimers = useRef<Partial<Record<OAuthProviderId, number>>>({})
  const pollingRequests = useRef<Partial<Record<OAuthProviderId, boolean>>>({})
  const pollingSessions = useRef<Partial<Record<OAuthProviderId, string>>>({})
  const pollingStartTimes = useRef<Partial<Record<OAuthProviderId, number>>>({})
  const credentialSnapshots = useRef<Partial<Record<OAuthProviderId, AuthFileSnapshot>>>({})

  // Load installed browsers on mount
  useEffect(() => {
    let active = true
    ListOAuthBrowsers()
      .then((available) => {
        if (!active) return
        const list = available || [{ id: "default", label: "系统默认浏览器" }]
        setBrowsers(list)
        setSelectedBrowser((cur) => resolveOAuthBrowserSelection(list, cur))
      })
      .catch(() => {
        if (!active) return
        const fallback = [{ id: "default", label: "系统默认浏览器" }]
        setBrowsers(fallback)
        setSelectedBrowser((cur) => resolveOAuthBrowserSelection(fallback, cur))
      })
      .finally(() => {
        if (active) setBrowsersLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Persist selected browser
  useEffect(() => {
    try {
      window.localStorage.setItem(OAUTH_BROWSER_STORAGE_KEY, selectedBrowser)
    } catch {}
  }, [selectedBrowser])

  const browserLabelMap = useMemo(() => {
    const map: Record<string, string> = {
      none: "不自动唤起 (手动复制)",
    }
    browsers.forEach((b) => {
      map[b.id] = b.label
    })
    return map
  }, [browsers])

  const showNotification = (type: "info" | "success" | "error", text: string) => {
    setNotice({ type, text })
    setTimeout(() => {
      setNotice((cur) => (cur?.text === text ? null : cur))
    }, 4500)
  }

  const updateProviderState = useCallback(
    (provider: OAuthProviderId, next: Partial<OAuthProviderState>) => {
      setStates((current) => ({
        ...current,
        [provider]: {
          status: "idle",
          ...(current[provider] ?? {}),
          ...next,
        },
      }))
    },
    [],
  )

  const clearPollingTimer = useCallback((provider: OAuthProviderId) => {
    const timer = pollingTimers.current[provider]
    if (timer !== undefined) window.clearInterval(timer)
    delete pollingSessions.current[provider]
    delete pollingTimers.current[provider]
    delete pollingRequests.current[provider]
    delete pollingStartTimes.current[provider]
  }, [])

  const captureCredentialSnapshot = useCallback(async (provider: OAuthProviderId) => {
    try {
      const payload = await managementApi.get("/auth-files")
      credentialSnapshots.current[provider] = snapshotAuthFiles(responseList<AuthFileRecord>(payload, "files"))
    } catch (e) {
      console.warn("Failed to capture credential snapshot", e)
    }
  }, [])

  const applyDefaultCredentialPriority = useCallback(async (provider: OAuthProviderId) => {
    const before = credentialSnapshots.current[provider]
    delete credentialSnapshots.current[provider]
    if (!before) return

    try {
      const payload = await managementApi.get("/auth-files")
      const names = changedOAuthAuthFileNames(before, responseList<AuthFileRecord>(payload, "files"), provider)
      await Promise.all(
        names.map((name) =>
          managementApi.patch("/auth-files/fields", {
            name,
            priority: 0,
          }),
        ),
      )
    } catch (e) {
      console.warn("Failed to apply default credential priority", e)
    }
  }, [])

  const completeProviderAuth = useCallback(
    (provider: OAuthProviderId) => {
      clearPollingTimer(provider)
      oauthLoginSuccessCache.mark(provider)
      updateProviderState(provider, {
        url: undefined,
        state: undefined,
        status: "idle",
        error: undefined,
        polling: false,
        callbackUrl: "",
        callbackSubmitting: false,
        callbackStatus: undefined,
        callbackError: undefined,
      })
      const config = PROVIDER_GRADIENTS[provider]
      showNotification("success", `${config?.name || provider} 授权登录成功！凭证已在本地就绪。`)
    },
    [clearPollingTimer, updateProviderState],
  )

  const startPolling = useCallback(
    (provider: OAuthProviderId, state: string) => {
      clearPollingTimer(provider)
      pollingSessions.current[provider] = state
      pollingStartTimes.current[provider] = Date.now()

      const checkStatus = async () => {
        if (pollingRequests.current[provider]) return
        if (pollingSessions.current[provider] !== state) return

        // Check 10-minute timeout
        const startTime = pollingStartTimes.current[provider] || Date.now()
        if (Date.now() - startTime > OAUTH_POLL_TIMEOUT_MS) {
          clearPollingTimer(provider)
          updateProviderState(provider, {
            status: "error",
            error: "授权轮询超时（超过 10 分钟），请点击重新授权",
            polling: false,
          })
          return
        }

        pollingRequests.current[provider] = true
        try {
          const result = await GetOAuthStatus(state)
          if (pollingSessions.current[provider] !== state) return

          const status = result.status?.toLowerCase()
          if (status === "ok") {
            await applyDefaultCredentialPriority(provider)
            completeProviderAuth(provider)
            return
          }

          if (status === "error") {
            clearPollingTimer(provider)
            updateProviderState(provider, {
              status: "error",
              error: result.error || "授权失败",
              polling: false,
            })
            return
          }
        } catch (err: any) {
          console.warn("Polling error for", provider, err)
        } finally {
          delete pollingRequests.current[provider]
        }
      }

      pollingTimers.current[provider] = window.setInterval(checkStatus, OAUTH_POLL_INTERVAL_MS)
      void checkStatus()
    },
    [applyDefaultCredentialPriority, clearPollingTimer, completeProviderAuth, updateProviderState],
  )

  const handleStartLogin = async (provider: OAuthProviderId) => {
    clearPollingTimer(provider)
    updateProviderState(provider, {
      status: "waiting",
      error: undefined,
      polling: true,
      callbackError: undefined,
      callbackStatus: undefined,
    })

    await captureCredentialSnapshot(provider)

    try {
      const res: OAuthStartResult = await StartOAuthLogin(provider, selectedBrowser)
      const url = res.url
      const state = res.state ?? undefined

      updateProviderState(provider, {
        url,
        state,
        status: "waiting",
        polling: true,
      })

      if (!res.opened && res.openError) {
        showNotification("info", `自动打开浏览器失败: ${res.openError}，请手动点击打开或复制链接。`)
      }

      if (!state) {
        updateProviderState(provider, {
          status: "error",
          error: "内核未返回会话 state，无法进行自动状态轮询",
          polling: false,
        })
        return
      }

      startPolling(provider, state)
    } catch (err: any) {
      clearPollingTimer(provider)
      updateProviderState(provider, {
        status: "error",
        error: err?.message || String(err),
        polling: false,
      })
    }
  }

  const handleCancelLogin = (provider: OAuthProviderId) => {
    clearPollingTimer(provider)
    const cur = states[provider]
    if (cur?.state) {
      managementApi.delete(`/oauth-session?state=${encodeURIComponent(cur.state)}`).catch(() => {})
    }
    updateProviderState(provider, {
      status: "idle",
      polling: false,
      error: undefined,
      callbackError: undefined,
    })
  }

  const handleRefresh = async (provider: OAuthProviderId) => {
    const cur = states[provider]
    if (cur?.state) {
      try {
        await managementApi.delete(`/oauth-session?state=${encodeURIComponent(cur.state)}`)
      } catch (e) {
        console.warn("Cancel old session warning", e)
      }
    }
    await handleStartLogin(provider)
  }

  const handleCopyLink = async (provider: OAuthProviderId, url?: string) => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      updateProviderState(provider, { copied: true })
      showNotification("success", "授权链接已复制到剪贴板")
      setTimeout(() => {
        updateProviderState(provider, { copied: false })
      }, 2000)
    } catch {
      showNotification("error", "复制失败，请手动选择复制")
    }
  }

  const handleOpenBrowser = async (url?: string) => {
    if (!url) return
    try {
      await OpenOAuthUrl(url, selectedBrowser)
    } catch (e: any) {
      showNotification("error", `打开浏览器失败: ${e?.message || e}`)
    }
  }

  const handleSubmitCallback = async (provider: OAuthProviderId) => {
    const cur = states[provider]
    const input = (cur?.callbackUrl || "").trim()
    if (!input) {
      showNotification("error", "请先粘贴回调链接")
      return
    }

    if (provider === "devin") {
      const devinValidation = validateDevinCallback(input, cur?.state)
      if (devinValidation === "invalid") {
        updateProviderState(provider, { callbackError: "回调链接格式不合法" })
        return
      }
      if (devinValidation === "state_mismatch") {
        updateProviderState(provider, {
          callbackError: "回调 state 与当前登录会话不匹配，请使用最新授权链接完成登录",
        })
        return
      }
    }

    updateProviderState(provider, { callbackSubmitting: true, callbackError: undefined })
    try {
      await SubmitOAuthCallback(provider, input)
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: "success",
        callbackError: undefined,
      })
      showNotification("success", "回调链接已提交，等待内核验证...")
    } catch (e: any) {
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: "error",
        callbackError: e?.message || String(e),
      })
    }
  }

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingTimers.current).forEach((timer) => {
        if (timer !== undefined) window.clearInterval(timer)
      })
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Top Banner / Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xs">
        <div>
          <h2 className="text-base font-semibold tracking-tight">OAuth 登录中心</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            在此完成上游厂商账号授权，凭证将保存在本地并在内核中自动轮换
          </p>
        </div>

        {/* Browser Selector */}
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">浏览器唤起:</span>
          <Select
            disabled={browsersLoading}
            value={selectedBrowser}
            onValueChange={(val) => {
              if (val) setSelectedBrowser(val)
            }}
          >
            <SelectTrigger className="w-[185px] sm:w-[210px] bg-background/80">
              <SelectValue placeholder="选择唤起浏览器...">
                {(val: string | null) => (val && browserLabelMap[val]) || val || "选择唤起浏览器..."}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {browsers.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.label}
                </SelectItem>
              ))}
              <SelectItem value="none">不自动唤起 (手动复制)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Floating Notice */}
      {notice && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 shadow-2xs ${
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

      {/* 2-Column Responsive Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PROVIDER_LIST.map((p) => {
          const config = PROVIDER_GRADIENTS[p.id]
          const s = states[p.id] || { status: "idle" }
          const isWaiting = s.status === "waiting"
          const isError = s.status === "error"
          const supportCallback = OAUTH_CALLBACK_SUPPORTED.has(p.id)

          return (
            <div
              key={p.id}
              className={`group relative rounded-3xl border transition-all duration-300 overflow-hidden flex flex-col justify-between p-6 sm:p-7 min-h-[260px] ${config.bgLight} ${config.bgDark} ${config.borderLight} ${config.borderDark} hover:shadow-xl hover:shadow-black/5 hover:border-border/80`}
            >
              {/* Right Side: Provider Icon (approx 1/3 extends outside the card boundary) */}
              <div className="absolute -right-12 sm:-right-16 top-1/2 -translate-y-1/2 pointer-events-none select-none opacity-85 dark:opacity-75 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100">
                <ProviderGradientIcon provider={p.id} size={180} />
              </div>

              {/* Title & Description starting directly from top-left (max-width 60% as requested) */}
              <div className="relative z-10 max-w-[60%]">
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2.5 text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {config.desc}
                </p>
              </div>

              {/* Error badge if start failed */}
              {isError && s.error && !isWaiting && (
                <div
                  className="relative z-20 mt-3 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span className="flex-1 break-all">{s.error}</span>
                  <button
                    type="button"
                    onClick={() => updateProviderState(p.id, { error: undefined, status: "idle" })}
                    className="text-destructive/70 hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Bottom Action: "授权登录 →" button (only clicking this button triggers login) */}
              <div className="relative z-10 pt-6 mt-auto flex items-center">
                <button
                  type="button"
                  disabled={isWaiting}
                  onClick={() => handleStartLogin(p.id)}
                  className="group/btn inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>授权登录</span>
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
                </button>
              </div>

              {/* In-Flight Authorization Sheet: Covers bottom 90% of card, leaving top 10% whitespace */}
              {isWaiting && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-x-0 bottom-0 h-[90%] z-30 rounded-t-3xl bg-background/95 dark:bg-card/95 backdrop-blur-md border-t border-border/80 shadow-2xl p-4 sm:p-5 flex flex-col justify-between animate-in slide-in-from-bottom duration-300 overflow-hidden"
                >
                  {/* Top Bar inside popup */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-border/40 shrink-0">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-primary">
                      <Loader2 className="size-4 animate-spin shrink-0" />
                      <span>正在等待 {p.title} 浏览器授权...</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelLogin(p.id)}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="取消当前授权"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Main content area: action buttons & manual callback */}
                  <div className="space-y-3 py-1 text-xs flex-1 flex flex-col justify-center">
                    {/* Action buttons: 打开、复制、刷新 */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={!s.url}
                        onClick={() => handleOpenBrowser(s.url)}
                        className="flex-1 h-8 text-xs gap-1.5 font-medium shadow-xs"
                      >
                        <ExternalLink className="size-3.5" />
                        <span>打开浏览器</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!s.url}
                        onClick={() => handleCopyLink(p.id, s.url)}
                        className="flex-1 h-8 text-xs gap-1.5 font-medium bg-background/60"
                      >
                        {s.copied ? (
                          <>
                            <Check className="size-3.5 text-emerald-500" />
                            <span className="text-emerald-500">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            <span>复制链接</span>
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRefresh(p.id)}
                        className="h-8 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                        title="取消旧会话并重新获取授权链接"
                      >
                        <RefreshCw className="size-3.5" />
                        <span className="hidden sm:inline">刷新</span>
                      </Button>
                    </div>

                    {/* Devin Special Hint */}
                    {p.id === "devin" && (
                      <div className="p-2 rounded-lg bg-muted/40 text-[11px] text-muted-foreground leading-relaxed">
                        若无法自动跳转，请复制浏览器完整 URL 粘贴在下方回调栏中。
                      </div>
                    )}

                    {/* Manual Callback Paste Input */}
                    {supportCallback && (
                      <div className="space-y-1.5 pt-2 border-t border-border/40">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                          <span>手动填写回调链接:</span>
                          {s.callbackStatus === "success" && (
                            <span className="text-emerald-500 flex items-center gap-1 font-medium">
                              <Check className="size-3" /> 已提交
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="http://127.0.0.1:.../?code=..."
                            value={s.callbackUrl || ""}
                            onChange={(e) =>
                              updateProviderState(p.id, {
                                callbackUrl: e.target.value,
                                callbackError: undefined,
                              })
                            }
                            className="h-8 text-xs font-mono bg-background/80"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={s.callbackSubmitting || !(s.callbackUrl || "").trim()}
                            onClick={() => handleSubmitCallback(p.id)}
                            className="h-8 px-3 text-xs whitespace-nowrap font-medium"
                          >
                            {s.callbackSubmitting ? <Loader2 className="size-3 animate-spin" /> : "提交"}
                          </Button>
                        </div>
                        {s.callbackError && (
                          <p className="text-[10px] text-destructive break-all">{s.callbackError}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Footer inside sheet */}
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
                    <span>完成授权后将自动检测并同步凭证</span>
                    <button
                      type="button"
                      onClick={() => handleCancelLogin(p.id)}
                      className="text-xs hover:text-destructive transition-colors font-medium cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
