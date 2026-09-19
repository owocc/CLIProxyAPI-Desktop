import { useState } from "react"
import { CoreRuntimeProvider } from "./context/CoreRuntimeContext"
import { ThemeProvider } from "./context/ThemeContext"
import { AppShell, type AppPageId } from "./layouts/AppShell"
import { HomePage } from "./pages/HomePage"
import { VersionManagementPage } from "./pages/VersionManagementPage"
import { AgentsPage } from "./pages/AgentsPage"
import { OAuthManagementPage } from "./pages/OAuthManagementPage"
import { ApiAccessPage } from "./pages/ApiAccessPage"
import { UsageRecordsPage } from "./pages/UsageRecordsPage"
import { ConfigPanelPage } from "./pages/ConfigPanelPage"
import { AppSettingsPage } from "./pages/AppSettingsPage"

export function App() {
  const [activePage, setActivePage] = useState<AppPageId>("home")

  const renderContent = () => {
    switch (activePage) {
      case "home":
        return <HomePage onNavigate={setActivePage} />
      case "versions":
        return <VersionManagementPage />
      case "agents":
        return <AgentsPage />
      case "oauth":
        return <OAuthManagementPage />
      case "api":
        return <ApiAccessPage />
      case "usage":
        return <UsageRecordsPage />
      case "config":
        return <ConfigPanelPage />
      case "settings":
        return <AppSettingsPage />
      default:
        return <HomePage onNavigate={setActivePage} />
    }
  }

  return (
    <ThemeProvider>
      <CoreRuntimeProvider>
        <AppShell activePage={activePage} onNavigate={setActivePage}>
          {renderContent()}
        </AppShell>
      </CoreRuntimeProvider>
    </ThemeProvider>
  )
}

export default App
