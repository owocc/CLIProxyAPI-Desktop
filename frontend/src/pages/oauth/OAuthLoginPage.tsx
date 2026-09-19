import { useCallback, useEffect, useRef, useState } from "react"
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import antigravityIcon from "../../assets/icons/antigravity.svg"
import claudeIcon from "../../assets/icons/claude.svg"
import codexIcon from "../../assets/icons/codex.svg"
import grokIcon from "../../assets/icons/grok.svg"
import devinIcon from "../../assets/icons/devin.svg"
import kimiIcon from "../../assets/icons/kimi-light.svg"
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
import {
  createOAuthLoginSuccessCache,
} from "../../services/oauthLoginState"
import { validateDevinCallback } from "../../services/devinOAuth"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../../components/ui/card"
import { Badge } from "../../components/ui/badge"
import { Input } from "../../components/ui/input"

export type OAuthProviderId = "codex" | "claude" | "antigravity" | "kimi" | "xai" | "devin"
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
  refreshing?: boolean
  copied?: boolean
}

const oauthProviders = [
  { id: "codex" as const, name: "Codex OAuth", icon: codexIcon, desc: "OpenAI / ChatGPT 平台原生开发者授权" },
  { id: "claude" as const, name: "Claude OAuth", icon: claudeIcon, desc: "Anthropic Claude Code 官方授权登录" },
  { id: "antigravity" as const, name: "Antigravity OAuth", icon: antigravityIcon, desc: "Google Cloud Code / Gemini 开发者授权" },
  { id: "kimi" as const, name: "Kimi OAuth", icon: kimiIcon, desc: "Moonshot Kimi 网页授权（自动循环接收）" },
  { id: "xai" as const, name: "xAI OAuth", icon: grokIcon, desc: "xAI Grok CLI 订阅授权" },
  { id: "devin" as const, name: "Devin OAuth", icon: devinIcon, desc: "Cognition Devin 代码助手授权" },
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
  const [states, setStates] = useState<Partial<Record<OAuthProviderId, OAuthProviderState>>>(() => {
    return oauthLoginSuccessCache.snapshot().reduce<Partial<Record<OAuthProviderId, OAuthProviderState>>>(
      (acc, provider) => ({ ...acc, [provider]: { status: "success" } }),
      {},
    )
  })

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
        const list = available || [{ id: "default", label: "System Default" }]
        setBrowsers(list)
        setSelectedBrowser((cur) => resolveOAuthBrowserSelection(list, cur))
      })
      .catch((err) => {
        if (!active) return
        const fallback = [{ id: "default", label: "System Default" }]
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

  const showNotification = (type: "info" | "success" | "error", text: string) => {
    setNotice({ type, text })
    setTimeout(() => {
      setNotice((cur) => (cur?.text === text ? null : cur))
    }, 4000)
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
        status: "success",
        error: undefined,
        polling: false,
        callbackUrl: "",
        callbackSubmitting: false,
        callbackStatus: undefined,
        callbackError: undefined,
      })
      showNotification("success", `${provider} 授权登录成功！`)
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

          // In wait state, continue polling
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
    } catch (e) {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-xs">
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
          <select
            disabled={browsersLoading}
            value={selectedBrowser}
            onChange={(e) => setSelectedBrowser(e.target.value)}
            className="text-xs bg-background/80 border border-border rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-primary font-medium"
          >
            {browsers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            <option value="none">不自动唤起 (手动复制)</option>
          </select>
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

      {/* 6 Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {oauthProviders.map((p) => {
          const s = states[p.id] || { status: "idle" }
          const isWaiting = s.status === "waiting"
          const isSuccess = s.status === "success"
          const isError = s.status === "error"
          const supportCallback = OAUTH_CALLBACK_SUPPORTED.has(p.id)

          return (
            <Card
              key={p.id}
              className={`flex flex-col border transition-all ${
                isWaiting
                  ? "border-primary/50 shadow-md shadow-primary/5"
                  : isSuccess
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/60 hover:border-border"
              }`}
            >
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-muted/60 p-1.5 flex items-center justify-center shrink-0 border border-border/30">
                    <img src={p.icon} alt={p.name} className="size-full object-contain" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{p.name}</CardTitle>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{p.desc}</p>
                  </div>
                </div>

                {/* Status Badge */}
                <div>
                  {isSuccess ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[10px]">
                      <Check className="size-3" /> 已完成
                    </Badge>
                  ) : isWaiting ? (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1 text-[10px]">
                      <Loader2 className="size-3 animate-spin" /> 等待授权
                    </Badge>
                  ) : isError ? (
                    <Badge variant="destructive" className="text-[10px]">
                      授权失败
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">
                      未登录
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 pt-1 text-xs">
                {/* Error Message */}
                {s.error && (
                  <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] flex items-start gap-2">
                    <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                    <span className="break-all">{s.error}</span>
                  </div>
                )}

                {/* Devin Special Hint */}
                {p.id === "devin" && isWaiting && (
                  <div className="p-2 rounded bg-muted/40 text-[11px] text-muted-foreground">
                    在浏览器完成 Devin 授权后，若无法自动跳转，请复制浏览器地址栏的完整 URL 粘贴在下方。
                  </div>
                )}

                {/* Waiting State: Link actions */}
                {isWaiting && s.url && (
                  <div className="space-y-2 p-2.5 rounded-lg bg-muted/40 border border-border/40">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                      <span>授权链接</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyLink(p.id, s.url)}
                          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                          title="复制链接"
                        >
                          <Copy className="size-3" />
                          {s.copied ? "已复制" : "复制"}
                        </button>
                        <span>·</span>
                        <button
                          onClick={() => handleOpenBrowser(s.url)}
                          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                          title="在浏览器中打开"
                        >
                          <ExternalLink className="size-3" />
                          打开
                        </button>
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground/80 break-all p-1.5 rounded bg-background/60 select-all max-h-14 overflow-y-auto">
                      {s.url}
                    </div>
                  </div>
                )}

                {/* Manual Callback Paste Input */}
                {isWaiting && supportCallback && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>手动粘贴回调链接</span>
                      {s.callbackStatus === "success" && (
                        <span className="text-emerald-500 flex items-center gap-1">
                          <Check className="size-3" /> 已提交
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        placeholder="http://127.0.0.1:.../?code=..."
                        value={s.callbackUrl || ""}
                        onChange={(e) =>
                          updateProviderState(p.id, {
                            callbackUrl: e.target.value,
                            callbackError: undefined,
                          })
                        }
                        className="h-7 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={s.callbackSubmitting || !(s.callbackUrl || "").trim()}
                        onClick={() => handleSubmitCallback(p.id)}
                        className="h-7 px-2.5 text-xs whitespace-nowrap"
                      >
                        {s.callbackSubmitting ? <Loader2 className="size-3 animate-spin" /> : "提交"}
                      </Button>
                    </div>
                    {s.callbackError && (
                      <p className="text-[10px] text-destructive break-all">{s.callbackError}</p>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant={isSuccess ? "outline" : isWaiting ? "secondary" : "default"}
                  disabled={isWaiting && s.polling}
                  onClick={() => handleStartLogin(p.id)}
                  className="flex-1 h-7 text-xs gap-1.5"
                >
                  {isWaiting ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      等待登录完成...
                    </>
                  ) : isSuccess ? (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      重新授权登录
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-3" />
                      授权登录
                    </>
                  )}
                </Button>

                {isWaiting && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRefresh(p.id)}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="取消旧会话并重开链接"
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
