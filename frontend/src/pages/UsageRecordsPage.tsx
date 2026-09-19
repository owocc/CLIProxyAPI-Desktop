import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Database } from "lucide-react"

export function UsageRecordsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">用量账本与统计</h1>
        <p className="text-sm text-muted-foreground mt-1">
          通过 RESP 协议订阅内核实时流并落盘 SQLite，提供 Token 计价与调用追踪
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">今日总请求数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Prompt Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Completion Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <span>用量数据存储</span>
          </CardTitle>
          <CardDescription>SQLite 纯 Go 嵌入式数据库</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded-lg">
            暂无请求记录。启动内核并连接客户端后，用量数据将自动采集并记录至此处。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
