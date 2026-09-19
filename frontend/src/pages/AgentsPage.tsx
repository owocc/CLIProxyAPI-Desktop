import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Bot, Sparkles, CheckCircle2 } from "lucide-react"

const clients = [
  { id: "claude-code", name: "Claude Code", cli: "claude", format: "JSON", desc: "Anthropic 官方终端智能体" },
  { id: "codex", name: "Codex", cli: "codex", format: "TOML", desc: "OpenAI Codex CLI 智能体" },
  { id: "claude-desktop", name: "Claude Desktop", cli: "app", format: "JSON", desc: "Anthropic 官方桌面客户端" },
  { id: "opencode", name: "OpenCode", cli: "opencode", format: "JSON5", desc: "开源 AI 编程助理" },
  { id: "openclaw", name: "OpenClaw", cli: "openclaw", format: "JSON5", desc: "OpenClaw 智能体" },
  { id: "hermes", name: "Hermes Agent", cli: "hermes", format: "YAML", desc: "Hermes 自动化智能体" },
  { id: "deepseek-harness", name: "DeepSeek Harness", cli: "dsh", format: "YAML", desc: "DeepSeek 官方测试 Harness" },
  { id: "zcode", name: "ZCode", cli: "zcode", format: "JSON", desc: "ZCode 编程环境" },
  { id: "kimi-code", name: "Kimi Code", cli: "kimi", format: "TOML", desc: "Moonshot Kimi Code 智能体" },
  { id: "grok-build", name: "Grok Build", cli: "grok", format: "TOML", desc: "xAI Grok 智能体" },
  { id: "pi", name: "Pi Coding Agent", cli: "pi", format: "JSON", desc: "Pi 编程客户端" },
]

export function AgentsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">智能体客户端编排</h1>
          <p className="text-sm text-muted-foreground mt-1">
            一键安全改写第三方客户端配置，接入本地代理（写入前自动备份，支持秒级逆序回滚）
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5 py-1">
          <Sparkles className="size-3 text-primary" />
          支持 10+ 款主流智能体
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client) => (
          <Card key={client.id} className="hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="size-4 text-primary" />
                  <span>{client.name}</span>
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {client.format}
                </Badge>
              </div>
              <CardDescription className="text-xs">{client.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>命令: <code>{client.cli}</code></span>
                <span className="text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> 可配置
                </span>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs h-7">
                配置并接入
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
