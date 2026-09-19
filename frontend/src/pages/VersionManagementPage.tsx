import { useState } from "react"
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
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"
import {
  Download,
  RotateCw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  FileCode,
  HardDrive,
} from "lucide-react"
import type { ReleaseInfo } from "../../bindings/easycliproxyapi/internal/model/models"

const downloadSources = [
  { id: "github", label: "GitHub 官方 (直连)" },
  { id: "gh-proxy", label: "GhProxy 镜像 (推荐国内)" },
  { id: "gh-fast", label: "GhFast 镜像 (备用高速)" },
]

export function VersionManagementPage() {
  const {
    status,
    installTask,
    checkLatest,
    installVersion,
    cancelInstall,
    refreshStatus,
  } = useCoreRuntime()

  const [selectedSource, setSelectedSource] = useState("gh-proxy")
  const [checking, setChecking] = useState(false)
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const isInstalling = installTask?.running ?? false
  const currentVersion = status?.currentVersion

  const handleCheckLatest = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      const rel = await checkLatest(selectedSource)
      setLatestRelease(rel)
    } catch (err: any) {
      setCheckError(err?.message || String(err))
    } finally {
      setChecking(false)
    }
  }

  const handleInstall = async (version: string) => {
    try {
      await installVersion(version, selectedSource)
    } catch (err) {
      console.error("Install failed:", err)
    }
  }

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return "0 MB"
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">内核版本管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          下载、安装、更新 CLIProxyAPI 独立二进制内核并切换多网络下载镜像
        </p>
      </div>

      {/* Installation progress banner if active */}
      {isInstalling && (
        <Card className="border-primary/40 bg-primary/5 shadow-md animate-in fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="size-4 text-primary animate-bounce" />
                <span>正在安装内核: {installTask?.phase}</span>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelInstall}
                className="gap-1 text-xs h-7"
              >
                <XCircle className="size-3.5" />
                取消
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={installTask?.percentage ?? 0} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{installTask?.phase}</span>
              <span>
                {installTask?.totalBytes && installTask.totalBytes > 0 ? (
                  <>
                    {formatBytes(installTask.downloadedBytes)} /{" "}
                    {formatBytes(installTask.totalBytes)} (
                    {Math.round(installTask.percentage)}%)
                  </>
                ) : (
                  `${Math.round(installTask?.percentage ?? 0)}%`
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task Error */}
      {installTask?.error && !isInstalling && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">安装失败</div>
            <div className="text-xs opacity-90 mt-1">{installTask.error}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Installation Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">本机安装态</CardTitle>
              {currentVersion ? (
                <Badge variant="success">已安装 v{currentVersion}</Badge>
              ) : (
                <Badge variant="destructive">未检测到内核</Badge>
              )}
            </div>
            <CardDescription>当前系统本地存储的代理内核信息</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2 text-xs">
              <div className="flex items-start justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Layers className="size-3.5" /> 版本号
                </span>
                <span className="font-mono font-medium">
                  {currentVersion ? `v${currentVersion}` : "未安装"}
                </span>
              </div>

              <div className="flex items-start justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <HardDrive className="size-3.5" /> 安装目录
                </span>
                <span className="font-mono truncate max-w-[200px]" title={status?.installDir}>
                  {status?.installDir}
                </span>
              </div>

              <div className="flex items-start justify-between py-1.5">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <FileCode className="size-3.5" /> 可执行文件
                </span>
                <span className="font-mono truncate max-w-[200px]" title={status?.binaryPath ?? "—"}>
                  {status?.binaryPath ?? "—"}
                </span>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStatus}
              className="w-full gap-1.5 text-xs"
            >
              <RotateCw className="size-3.5" />
              刷新检测
            </Button>
          </CardFooter>
        </Card>

        {/* Check Releases & Install */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">发现最新版本</CardTitle>
            <CardDescription>从远程下载源获取官方发布的最新内核</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                下载加速镜像源
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {downloadSources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSource(s.id)}
                    className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg border text-left transition-all ${
                      selectedSource === s.id
                        ? "border-primary bg-primary/5 text-foreground font-medium shadow-xs"
                        : "border-border/60 hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span>{s.label}</span>
                    {selectedSource === s.id && (
                      <CheckCircle2 className="size-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {checkError && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {checkError}
              </div>
            )}

            {latestRelease && (
              <div className="p-3.5 rounded-lg border border-border/60 bg-muted/30 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    发现版本: v{latestRelease.version}
                  </span>
                  {currentVersion === latestRelease.version ? (
                    <Badge variant="outline" className="text-[10px]">已是最新</Badge>
                  ) : (
                    <Badge variant="success" className="text-[10px]">可更新</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-3" />
                  <span>发布时间: {new Date(latestRelease.publishedAt).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={checking || isInstalling}
              onClick={handleCheckLatest}
              className="flex-1 gap-1.5 text-xs"
            >
              <RotateCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "检查中..." : "检查更新"}
            </Button>

            {latestRelease && (
              <Button
                variant="default"
                size="sm"
                disabled={isInstalling}
                onClick={() => handleInstall(latestRelease.version)}
                className="flex-1 gap-1.5 text-xs"
              >
                <Download className="size-3.5" />
                {currentVersion === latestRelease.version ? "重新安装" : "安装此版本"}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Release Notes */}
      {latestRelease?.releaseNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">v{latestRelease.version} 更新日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted/40 border border-border/40 font-mono text-xs max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {latestRelease.releaseNotes}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
