import { useState, useEffect, useCallback } from "react"
import { Events } from "@wailsio/runtime"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import {
  GetUsageSummary,
  GetRecentRecords,
  GetDailyTrend,
  TriggerSync,
} from "../../bindings/easycliproxyapi/internal/service/usageservice"
import type {
  UsageSummary,
  UsageRecord,
  DailyTrendPoint,
} from "../../bindings/easycliproxyapi/internal/model/models"
import {
  BarChart3,
  RotateCw,
  Coins,
  Cpu,
  Clock,
  Layers,
  Database,
  Calendar,
} from "lucide-react"

export function UsageRecordsPage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [records, setRecords] = useState<UsageRecord[]>([])
  const [trends, setTrends] = useState<DailyTrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [sum, recs, tr] = await Promise.all([
        GetUsageSummary(),
        GetRecentRecords(50, 0),
        GetDailyTrend(7),
      ])
      setSummary(sum)
      setRecords(recs || [])
      setTrends(tr || [])
    } catch (err) {
      console.error("Failed to load usage data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    // Listen to real-time update event from Go collector
    const unbind = Events.On("usage-records-updated", () => {
      loadData()
    })

    const timer = setInterval(() => {
      loadData()
    }, 10000)

    return () => {
      unbind()
      clearInterval(timer)
    }
  }, [loadData])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await TriggerSync()
      await loadData()
    } finally {
      setSyncing(false)
    }
  }

  const formatNumber = (n?: number | number) => {
    if (n === undefined || n === null) return "0"
    return new Intl.NumberFormat().format(n)
  }

  const formatCost = (c?: number) => {
    if (!c) return "$0.0000"
    return `$${c.toFixed(4)}`
  }

  // Find max requests in trends for relative bar height
  const maxTrendRequests = Math.max(...trends.map((t) => t.requests), 1)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">用量账本与统计</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RESP 协议长连接采集 + SQLite 嵌入式存储，Token 消耗精确计量与模型计价
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-1.5 text-xs h-8"
          >
            <RotateCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "同步中..." : "刷新采集"}</span>
          </Button>
        </div>
      </div>

      {/* Top 4 Metrics Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>今日 / 总请求数</span>
              <BarChart3 className="size-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatNumber(Number(summary?.todayRequests))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              累计 {formatNumber(Number(summary?.totalRequests))} 次调用
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>今日 / 累计费用</span>
              <Coins className="size-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-500">
              {formatCost(summary?.todayCost)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              累计 {formatCost(summary?.totalCost)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Prompt Tokens</span>
              <Cpu className="size-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {formatNumber(Number(summary?.totalPromptTokens))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">输入上下文总计</p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Completion Tokens</span>
              <Layers className="size-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {formatNumber(Number(summary?.totalCompletionTokens))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">输出补全总计</p>
          </CardContent>
        </Card>
      </div>

      {/* 7 Days Trend Visualizer */}
      {trends.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span>近 7 天调用趋势</span>
            </CardTitle>
            <CardDescription>按日期汇总的请求频次与 Token 消耗走势</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2 pt-2 text-center">
              {trends.map((t) => {
                const heightPercent = Math.max(12, (t.requests / maxTrendRequests) * 100)
                return (
                  <div key={t.date} className="flex flex-col items-center gap-2">
                    <div className="w-full h-24 bg-muted/30 rounded-lg flex items-end p-1.5">
                      <div
                        className="w-full bg-primary/80 hover:bg-primary rounded transition-all"
                        style={{ height: `${heightPercent}%` }}
                        title={`${t.date}: ${t.requests} 次请求, ${formatNumber(t.totalTokens)} tokens`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate w-full">
                      {t.date.slice(5)}
                    </span>
                    <span className="text-[11px] font-medium">{t.requests} 次</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Requests Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <span>实时调用明细</span>
              </CardTitle>
              <CardDescription>最近 50 次通过代理转发的真实模型请求</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {records.length} 条记录
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              加载用量明细中...
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
              暂无请求记录。启动内核并在智能体客户端中发起 AI 对话后，用量将实时记录入库。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="py-2.5 px-3 font-medium">请求时间</th>
                    <th className="py-2.5 px-3 font-medium">模型 (Model)</th>
                    <th className="py-2.5 px-3 font-medium">供应商</th>
                    <th className="py-2.5 px-3 font-medium text-right">输入 / 输出 Tokens</th>
                    <th className="py-2.5 px-3 font-medium text-right">耗时</th>
                    <th className="py-2.5 px-3 font-medium text-center">状态</th>
                    <th className="py-2.5 px-3 font-medium text-right">费用估算</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        {r.timeFormatted}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                        {r.model || "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {r.provider || "default"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                        <span>{formatNumber(r.promptTokens)}</span>
                        <span className="text-muted-foreground/50 mx-1">/</span>
                        <span className="text-foreground">{formatNumber(r.completionTokens)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground flex items-center justify-end gap-1">
                        <Clock className="size-3" />
                        <span>{r.durationMs > 0 ? `${r.durationMs}ms` : "—"}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={r.statusCode >= 200 && r.statusCode < 300 ? "success" : "destructive"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {r.statusCode || 200}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-500 font-medium">
                        {formatCost(r.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
