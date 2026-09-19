import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Network, KeyRound } from "lucide-react"

export function ApiAccessPage() {
  const { port } = useCoreRuntime()
  const rootBase = `http://127.0.0.1:${port}`

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API 访问与端点</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理内核访问密钥、TLS 证书设置以及模型别名映射
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="size-4 text-primary" />
              <span>标准协议端点</span>
            </CardTitle>
            <CardDescription>各厂商 API 兼容的请求入口</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block mb-1">OpenAI 兼容 (/v1/chat/completions)</span>
              <code className="font-mono select-all">{rootBase}/v1</code>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block mb-1">Anthropic 兼容 (/v1/messages)</span>
              <code className="font-mono select-all">{rootBase}</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <span>管理密钥配置</span>
            </CardTitle>
            <CardDescription>管理 API 与 RESP 队列鉴权所需的密钥</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block mb-1">Management Secret Key</span>
              <code className="font-mono select-all text-muted-foreground">已在 config.yaml 中保护</code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
