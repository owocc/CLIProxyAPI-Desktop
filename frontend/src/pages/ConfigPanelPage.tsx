import { useState, useEffect } from "react"
import { useCoreRuntime } from "../context/CoreRuntimeContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Switch } from "../components/ui/switch"
import {
  GetGuiConfig,
  SaveGuiConfig,
} from "../../bindings/easycliproxyapi/internal/service/configservice"
import type { GuiConfigFile } from "../../bindings/easycliproxyapi/internal/model/models"
import {
  Sliders,
  FileText,
  RotateCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Network,
  RotateCcw,
} from "lucide-react"

export function ConfigPanelPage() {
  const { restart, status } = useCoreRuntime()

  const [config, setConfig] = useState<GuiConfigFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const cfg = await GetGuiConfig()
      setConfig(cfg)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      await SaveGuiConfig(config)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        正在读取配置文件...
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">内核与应用配置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            双向保注释管理 config.yaml 核心运行参数与桌面端 config.toml 权威设置
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="size-3.5" /> 保存成功
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadConfig}
            disabled={saving}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="size-3.5" /> 重置
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 text-xs shadow-sm"
          >
            <Save className="size-3.5" /> {saving ? "保存中..." : "保存配置"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Network Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="size-4 text-primary" />
              <span>核心网络参数</span>
            </CardTitle>
            <CardDescription>端口、绑定地址与局域网访问</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">服务监听端口</label>
              <Input
                type="number"
                value={config.port}
                onChange={(e) =>
                  setConfig({ ...config, port: parseInt(e.target.value) || 8317 })
                }
                className="font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground">默认 8317</span>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">绑定地址 (Host)</label>
              <Input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                className="font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                本地 127.0.0.1 或 局域网 0.0.0.0
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">上游代理地址 (Proxy URL)</label>
              <Input
                type="text"
                placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                value={config.proxyUrl || ""}
                onChange={(e) => setConfig({ ...config, proxyUrl: e.target.value })}
                className="font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                内核请求各 AI 厂商时所走的网络代理
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Runtime Options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sliders className="size-4 text-primary" />
              <span>运行与重试策略</span>
            </CardTitle>
            <CardDescription>控制内核转发策略与容错重试</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="font-medium text-foreground">调试模式 (Debug)</div>
                <div className="text-muted-foreground text-[11px]">
                  在启动日志中打印详细协议调试信息
                </div>
              </div>
              <Switch
                checked={config.debug}
                onCheckedChange={(checked) => setConfig({ ...config, debug: checked })}
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="font-medium text-foreground">商用模式 (Commercial Mode)</div>
                <div className="text-muted-foreground text-[11px]">启用商用接入防护中间件</div>
              </div>
              <Switch
                checked={config.commercialMode}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, commercialMode: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="font-medium text-foreground">用量统计采集</div>
                <div className="text-muted-foreground text-[11px]">
                  启用内置 RESP 队列并向 SQLite 汇聚用量
                </div>
              </div>
              <Switch
                checked={config.usageStatisticsEnabled}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, usageStatisticsEnabled: checked })
                }
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="font-medium text-foreground">请求重试次数</label>
              <Input
                type="number"
                value={config.requestRetry}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    requestRetry: parseInt(e.target.value) || 0,
                  })
                }
                className="font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Log File Settings */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span>日志与存储管理</span>
            </CardTitle>
            <CardDescription>内核运行日志与错误保留配置</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
              <div>
                <div className="font-medium text-foreground">写入日志文件</div>
                <div className="text-muted-foreground text-[11px]">记录日志至 oauth/logs/</div>
              </div>
              <Switch
                checked={config.loggingToFile}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, loggingToFile: checked })
                }
              />
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
              <label className="font-medium text-foreground">最大日志大小 (MB)</label>
              <Input
                type="number"
                value={config.logsMaxTotalSizeMb}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    logsMaxTotalSizeMb: parseInt(e.target.value) || 0,
                  })
                }
                className="font-mono text-xs"
              />
              <span className="text-[10px] text-muted-foreground">0 为不限制</span>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
              <label className="font-medium text-foreground">错误日志轮转数量</label>
              <Input
                type="number"
                value={config.errorLogsMaxFiles}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    errorLogsMaxFiles: parseInt(e.target.value) || 10,
                  })
                }
                className="font-mono text-xs"
              />
              <span className="text-[10px] text-muted-foreground">保留最多份数</span>
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-4">
            <span>修改核心网络参数后，需重启内核以加载新配置</span>
            {status?.running && (
              <Button
                variant="outline"
                size="sm"
                onClick={restart}
                className="gap-1.5 text-xs h-7"
              >
                <RotateCw className="size-3" /> 重启内核生效
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
