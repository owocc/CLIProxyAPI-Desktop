import { useState } from "react"
import { KeyRound, FileKey, Gauge } from "lucide-react"
import { OAuthLoginPage } from "./oauth/OAuthLoginPage"
import { AuthFileManagementPage } from "./oauth/AuthFileManagementPage"
import { QuotaPage } from "./oauth/QuotaPage"

export type OAuthSubpage = "login" | "authFiles" | "quota"

interface SubpageTab {
  id: OAuthSubpage
  label: string
  icon: React.ElementType
}

const subpages: SubpageTab[] = [
  { id: "login", label: "OAuth 登录", icon: KeyRound },
  { id: "authFiles", label: "凭证文件管理", icon: FileKey },
  { id: "quota", label: "配额查询", icon: Gauge },
]

export function OAuthManagementPage() {
  const [activeSubpage, setActiveSubpage] = useState<OAuthSubpage>("login")

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header & Subpage Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">OAuth 授权与配额管理</h1>
          <p className="text-xs text-muted-foreground mt-1">
            原生厂商开发者账号授权、本地凭证集中治理与上游配额实时看板
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border/40 self-start sm:self-auto">
          {subpages.map((tab) => {
            const Icon = tab.icon
            const active = activeSubpage === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubpage(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  active
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content panels */}
      <div>
        {activeSubpage === "login" && <OAuthLoginPage />}
        {activeSubpage === "authFiles" && <AuthFileManagementPage />}
        {activeSubpage === "quota" && <QuotaPage />}
      </div>
    </div>
  )
}
