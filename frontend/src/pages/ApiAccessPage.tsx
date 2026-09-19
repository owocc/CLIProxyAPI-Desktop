import { useState, useEffect } from "react"
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
import {
  GetApiKeys,
  SaveApiKeys,
} from "../../bindings/easycliproxyapi/internal/service/configservice"
import type { ApiKeyEntry } from "../../bindings/easycliproxyapi/internal/model/models"
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
} from "lucide-react"

export function ApiAccessPage() {
  const { port } = useCoreRuntime()
  const rootBase = `http://127.0.0.1:${port}`

  const [keys, setKeys] = useState<ApiKeyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newRemark, setNewRemark] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({})

  const loadKeys = async () => {
    setLoading(true)
    try {
      const k = await GetApiKeys()
      setKeys(k || [])
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [])

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

  const handleAddKey = async () => {
    const keyVal = newKey.trim()
    if (!keyVal) {
      setError("API Key 不能为空")
      return
    }

    // Validation: 0x21..=0x7e, no spaces
    for (let i = 0; i < keyVal.length; i++) {
      const code = keyVal.charCodeAt(i)
      if (code < 0x21 || code > 0x7e) {
        setError("API Key 只能包含可见 ASCII 字符且不能有空格")
        return
      }
    }

    if (keyVal.includes("your-api-key")) {
      setError("不能使用模板占位符作为 API Key")
      return
    }

    if (keys.some((k) => k.apiKey === keyVal)) {
      setError("已存在相同的 API Key")
      return
    }

    const updated = [...keys, { apiKey: keyVal, remark: newRemark.trim() }]
    setSaving(true)
    setError(null)
    try {
      await SaveApiKeys(updated)
      setKeys(updated)
      setNewKey("")
      setNewRemark("")
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async (targetKey: string) => {
    const updated = keys.filter((k) => k.apiKey !== targetKey)
    setSaving(true)
    setError(null)
    try {
      await SaveApiKeys(updated)
      setKeys(updated)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  const sampleKey = keys.length > 0 ? keys[0].apiKey : "123456"
  const curlExample = `curl ${rootBase}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API 访问与端点</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理直连客户端鉴权所需的 API 访问密钥与多协议标准端点
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* API Keys Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                <span>访问密钥列表 (API Keys)</span>
              </CardTitle>
              <CardDescription className="mt-1">
                客户端连接本地服务时在 Authorization: Bearer 中填写的密钥
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
                onClick={handleAddKey}
                disabled={saving || !newKey.trim()}
                className="gap-1.5 text-xs h-8"
              >
                <Plus className="size-3.5" />
                添加密钥
              </Button>
            </div>
          </div>

          {/* Keys list */}
          <div className="space-y-2">
            {loading ? (
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
                        onClick={() => handleDeleteKey(k.apiKey)}
                        disabled={saving}
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
              <span>标准服务接口</span>
            </CardTitle>
            <CardDescription>与标准 OpenAI / Anthropic 协议对齐的路径</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block mb-1">
                OpenAI Compatible Base URL
              </span>
              <code className="font-mono font-medium select-all block">
                {rootBase}/v1
              </code>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block mb-1">
                Anthropic Base URL (Claude Code 等)
              </span>
              <code className="font-mono font-medium select-all block">
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
  )
}
