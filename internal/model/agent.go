package model

const (
	AgentClaudeCode      = "claude-code"
	AgentCodex           = "codex"
	AgentClaudeDesktop   = "claude-desktop"
	AgentOpenCode        = "opencode"
	AgentOpenClaw        = "openclaw"
	AgentHermes          = "hermes"
	AgentDeepSeekHarness = "deepseek-harness"
	AgentZCode           = "zcode"
	AgentKimiCode        = "kimi-code"
	AgentGrokBuild       = "grok-build"
	AgentPi              = "pi"
)

// AgentInfo represents discovery and integration state of an agent client.
type AgentInfo struct {
	Id              string   `json:"id"`
	Name            string   `json:"name"`
	Executable      string   `json:"executable"`
	Format          string   `json:"format"`
	Description     string   `json:"description"`
	CliInstalled    bool     `json:"cliInstalled"`
	ConfigFound     bool     `json:"configFound"`
	Configured      bool     `json:"configured"`
	CurrentModel    string   `json:"currentModel"`
	ConfigPaths     []string `json:"configPaths"`
	SupportedModels []string `json:"supportedModels"`
}

// BackupEntry represents a configuration snapshot made before modifying a client.
type BackupEntry struct {
	Id            string `json:"id"`
	ClientId      string `json:"clientId"`
	CreatedAt     string `json:"createdAt"`
	TimestampUnix int64  `json:"timestampUnix"`
	FilePath      string `json:"filePath"`
}
