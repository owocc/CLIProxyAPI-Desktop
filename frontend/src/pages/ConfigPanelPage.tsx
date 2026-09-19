import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Sliders, Folder } from "lucide-react"

export function ConfigPanelPage() {
  const { status, port } = useCoreRuntime()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">内核与应用配置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          托管 config.yaml 核心运行参数与桌面端 config.toml 权威副本（AST 保注释编辑）
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sliders className="size-4 text-primary" />
              <span>核心网络参数</span>
            </CardTitle>
            <CardDescription>监听端口与地址绑定设置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">服务端口</span>
              <span className="font-mono font-medium">{port}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground">监听地址</span>
              <span className="font-mono font-medium">127.0.0.1 (本地)</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">局域网共享 (Allow LAN)</span>
              <span className="font-medium text-muted-foreground">已关闭</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Folder className="size-4 text-primary" />
              <span>配置文件路径</span>
            </CardTitle>
            <CardDescription>各配置权威文件落盘位置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <span className="text-muted-foreground block mb-1">内核 config.yaml:</span>
              <code className="p-2 rounded bg-muted/50 block font-mono break-all text-[11px]">
                {status?.installDir}/config.yaml
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
