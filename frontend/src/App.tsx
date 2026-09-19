import { useState } from "react"
import { CoreRuntimeProvider } from "./context/CoreRuntimeContext"
import { AppShell, type AppPageId } from "./layouts/AppShell"
import { HomePage } from "./pages/HomePage"
import { VersionManagementPage } from "./pages/VersionManagementPage"
import { AgentsPage } from "./pages/AgentsPage"
import { ApiAccessPage } from "./pages/ApiAccessPage"
import { UsageRecordsPage } from "./pages/UsageRecordsPage"
import { ConfigPanelPage } from "./pages/ConfigPanelPage"

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
      case "api":
        return <ApiAccessPage />
      case "usage":
        return <UsageRecordsPage />
      case "config":
        return <ConfigPanelPage />
      default:
        return <HomePage onNavigate={setActivePage} />
    }
  }

  return (
    <CoreRuntimeProvider>
      <AppShell activePage={activePage} onNavigate={setActivePage}>
        {renderContent()}
      </AppShell>
    </CoreRuntimeProvider>
  )
}

export default App
