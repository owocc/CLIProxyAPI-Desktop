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
	Installed       bool     `json:"installed"`
	CliInstalled    bool     `json:"cliInstalled"`
	Version         string   `json:"version"`
	CliVersion      string   `json:"cliVersion"`
	AppVersion      string   `json:"appVersion"`
	ExecutablePath  string   `json:"executablePath"`
	ConfigFound     bool     `json:"configFound"`
	Configured      bool     `json:"configured"`
	CurrentModel    string   `json:"currentModel"`
	ConfigPaths     []string `json:"configPaths"`
	SupportedModels []string `json:"supportedModels"`
	Warnings        []string `json:"warnings"`
}

// BackupEntry represents a configuration snapshot made before modifying a client.
type BackupEntry struct {
	Id            string `json:"id"`
	ClientId      string `json:"clientId"`
	CreatedAt     string `json:"createdAt"`
	TimestampUnix int64  `json:"timestampUnix"`
	FilePath      string `json:"filePath"`
}

// ClaudeCodeConfig represents fine-grained configuration for Claude Code.
type ClaudeCodeConfig struct {
	OpusModel          string `json:"opusModel"`
	SonnetModel        string `json:"sonnetModel"`
	HaikuModel         string `json:"haikuModel"`
	Opus1M             bool   `json:"opus1M"`
	Sonnet1M           bool   `json:"sonnet1M"`
	Haiku1M            bool   `json:"haiku1M"`
	MaxContextTokens   int    `json:"maxContextTokens"`
	AutoCompactPct     int    `json:"autoCompactPct"`
	DisableAutoCompact bool   `json:"disableAutoCompact"`
	CustomMapping      bool   `json:"customMapping"`
}

// CodexConfig represents configuration for Codex CLI.
type CodexConfig struct {
	Model      string `json:"model"`
	AuthMethod string `json:"authMethod"` // "apikey" or "oauth"
}

// AgentDetail represents the detailed configuration state of a selected agent.
type AgentDetail struct {
	Id         string            `json:"id"`
	ClaudeCode *ClaudeCodeConfig `json:"claudeCode,omitempty"`
	Codex      *CodexConfig      `json:"codex,omitempty"`
	Model      string            `json:"model"`
	Configured bool              `json:"configured"`
}

