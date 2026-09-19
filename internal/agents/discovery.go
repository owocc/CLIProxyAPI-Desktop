package agents

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	toml "github.com/pelletier/go-toml/v2"

	"easycliproxyapi/internal/model"
)

// UserHomeDir returns current user's home directory.
func UserHomeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return home
}

// ResolveConfigPaths resolves the list of configuration file paths for a client.
func ResolveConfigPaths(clientId string) []string {
	home := UserHomeDir()

	switch clientId {
	case model.AgentClaudeCode:
		primary := filepath.Join(home, ".claude", "settings.json")
		fallback := filepath.Join(home, ".claude", "claude.json")
		if _, err := os.Stat(fallback); err == nil {
			if _, errP := os.Stat(primary); os.IsNotExist(errP) {
				return []string{fallback}
			}
		}
		return []string{primary}

	case model.AgentCodex:
		codexHome := os.Getenv("CODEX_HOME")
		if codexHome == "" {
			codexHome = filepath.Join(home, ".codex")
		}
		return []string{filepath.Join(codexHome, "config.toml")}

	case model.AgentClaudeDesktop:
		if runtime.GOOS == "darwin" {
			return []string{
				filepath.Join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
			}
		} else if runtime.GOOS == "windows" {
			appData := os.Getenv("APPDATA")
			if appData == "" {
				appData = filepath.Join(home, "AppData", "Roaming")
			}
			return []string{
				filepath.Join(appData, "Claude", "claude_desktop_config.json"),
			}
		} else {
			return []string{
				filepath.Join(home, ".config", "Claude", "claude_desktop_config.json"),
			}
		}

	case model.AgentOpenCode:
		if custom := os.Getenv("OPENCODE_CONFIG"); custom != "" {
			return []string{custom}
		}
		xdg := os.Getenv("XDG_CONFIG_HOME")
		if xdg == "" {
			xdg = filepath.Join(home, ".config")
		}
		return []string{filepath.Join(xdg, "opencode", "opencode.json")}

	case model.AgentOpenClaw:
		return []string{filepath.Join(home, ".openclaw", "openclaw.json")}

	case model.AgentHermes:
		hermesHome := os.Getenv("HERMES_HOME")
		if hermesHome == "" {
			hermesHome = filepath.Join(home, ".hermes")
		}
		return []string{filepath.Join(hermesHome, "config.yaml")}

	case model.AgentDeepSeekHarness:
		dshHome := os.Getenv("DSH_HOME")
		if dshHome == "" {
			dshHome = filepath.Join(home, ".dsh")
		}
		return []string{
			filepath.Join(dshHome, "settings.yaml"),
			filepath.Join(dshHome, ".credentials.yaml"),
		}

	case model.AgentZCode:
		return []string{
			filepath.Join(home, ".zcode", "v2", "config.json"),
			filepath.Join(home, ".zcode", "cli", "config.json"),
		}

	case model.AgentKimiCode:
		kimiHome := os.Getenv("KIMI_CODE_HOME")
		if kimiHome == "" {
			kimiHome = filepath.Join(home, ".kimi-code")
		}
		return []string{filepath.Join(kimiHome, "config.toml")}

	case model.AgentGrokBuild:
		grokHome := os.Getenv("GROK_HOME")
		if grokHome == "" {
			grokHome = filepath.Join(home, ".grok")
		}
		return []string{filepath.Join(grokHome, "config.toml")}

	case model.AgentPi:
		piHome := os.Getenv("PI_CODING_AGENT_DIR")
		if piHome == "" {
			piHome = filepath.Join(home, ".pi", "agent")
		}
		return []string{filepath.Join(piHome, "cliproxyapi.json")}

	default:
		return nil
	}
}

// DiscoverAgent inspects current client environment and returns its AgentInfo.
func DiscoverAgent(clientId string) model.AgentInfo {
	var (
		name        string
		exeName     string
		format      string
		desc        string
		models      []string
	)

	defaultModels := []string{
		"claude-3-7-sonnet-20250219",
		"claude-3-5-sonnet-20241022",
		"claude-3-5-haiku-20241022",
		"gpt-4o",
		"deepseek-r1",
		"deepseek-v3",
	}

	switch clientId {
	case model.AgentClaudeCode:
		name = "Claude Code"
		exeName = "claude"
		format = "JSON"
		desc = "Anthropic 官方终端智能体"
		models = []string{
			"claude-3-7-sonnet-20250219",
			"claude-3-5-sonnet-20241022",
			"claude-3-5-haiku-20241022",
			"claude-3-opus-20240229",
		}

	case model.AgentCodex:
		name = "Codex"
		exeName = "codex"
		format = "TOML"
		desc = "OpenAI Codex CLI 智能体"
		models = []string{"gpt-4o", "o1", "o3-mini", "claude-3-7-sonnet-20250219", "deepseek-r1"}

	case model.AgentClaudeDesktop:
		name = "Claude Desktop"
		exeName = "app"
		format = "JSON"
		desc = "Anthropic 官方桌面客户端"
		models = []string{"claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"}

	case model.AgentOpenCode:
		name = "OpenCode"
		exeName = "opencode"
		format = "JSON5"
		desc = "开源轻量 AI 编程助理"
		models = defaultModels

	case model.AgentOpenClaw:
		name = "OpenClaw"
		exeName = "openclaw"
		format = "JSON5"
		desc = "OpenClaw 智能体系统"
		models = defaultModels

	case model.AgentHermes:
		name = "Hermes Agent"
		exeName = "hermes"
		format = "YAML"
		desc = "Hermes 自动化智能体框架"
		models = defaultModels

	case model.AgentDeepSeekHarness:
		name = "DeepSeek Harness"
		exeName = "dsh"
		format = "YAML"
		desc = "DeepSeek 官方评测测试套件"
		models = []string{"deepseek-r1", "deepseek-v3"}

	case model.AgentZCode:
		name = "ZCode"
		exeName = "zcode"
		format = "JSON"
		desc = "ZCode 编程套件"
		models = defaultModels

	case model.AgentKimiCode:
		name = "Kimi Code"
		exeName = "kimi"
		format = "TOML"
		desc = "Moonshot Kimi Code 编程工具"
		models = []string{"kimi-k1.5", "deepseek-r1", "claude-3-7-sonnet-20250219"}

	case model.AgentGrokBuild:
		name = "Grok Build"
		exeName = "grok"
		format = "TOML"
		desc = "xAI Grok 构建工具"
		models = []string{"grok-2", "deepseek-r1"}

	case model.AgentPi:
		name = "Pi Coding Agent"
		exeName = "pi"
		format = "JSON"
		desc = "Pi 编程客户端"
		models = defaultModels
	}

	// 1. Check if CLI is in PATH
	cliInstalled := false
	if exeName != "app" && exeName != "" {
		if _, err := exec.LookPath(exeName); err == nil {
			cliInstalled = true
		}
	} else if exeName == "app" {
		// Claude desktop exists if config directory or app bundle exists
		cliInstalled = true
	}

	// 2. Check config files
	configPaths := ResolveConfigPaths(clientId)
	configFound := false
	for _, p := range configPaths {
		if _, err := os.Stat(p); err == nil {
			configFound = true
			break
		}
	}

	// 3. Inspect if currently configured to CPA
	configured, currentModel := inspectConfigured(clientId, configPaths)

	return model.AgentInfo{
		Id:              clientId,
		Name:            name,
		Executable:      exeName,
		Format:          format,
		Description:     desc,
		CliInstalled:    cliInstalled,
		ConfigFound:     configFound,
		Configured:      configured,
		CurrentModel:    currentModel,
		ConfigPaths:     configPaths,
		SupportedModels: models,
	}
}

func inspectConfigured(clientId string, paths []string) (bool, string) {
	if len(paths) == 0 {
		return false, ""
	}
	targetPath := paths[0]
	data, err := os.ReadFile(targetPath)
	if err != nil {
		return false, ""
	}

	contentStr := string(data)

	switch clientId {
	case model.AgentClaudeCode:
		var parsed struct {
			Env struct {
				BaseUrl   string `json:"ANTHROPIC_BASE_URL"`
				Model     string `json:"ANTHROPIC_MODEL"`
				AuthToken string `json:"ANTHROPIC_AUTH_TOKEN"`
			} `json:"env"`
		}
		if err := json.Unmarshal(data, &parsed); err == nil {
			if strings.Contains(parsed.Env.BaseUrl, "127.0.0.1") || strings.Contains(parsed.Env.BaseUrl, "localhost") {
				return true, parsed.Env.Model
			}
		}

	case model.AgentCodex:
		var parsed struct {
			ModelProvider string `toml:"model_provider"`
			Model         string `toml:"model"`
		}
		if err := toml.Unmarshal(data, &parsed); err == nil {
			if parsed.ModelProvider == "cpa-gui" {
				return true, parsed.Model
			}
		}

	case model.AgentOpenCode:
		if strings.Contains(contentStr, "cpa-gui") {
			return true, ""
		}

	default:
		if strings.Contains(contentStr, "cpa-gui") || strings.Contains(contentStr, "127.0.0.1") {
			return true, ""
		}
	}

	return false, ""
}

// AllClientIds lists all 11 supported agent targets in order.
var AllClientIds = []string{
	model.AgentClaudeCode,
	model.AgentCodex,
	model.AgentClaudeDesktop,
	model.AgentOpenCode,
	model.AgentOpenClaw,
	model.AgentHermes,
	model.AgentDeepSeekHarness,
	model.AgentZCode,
	model.AgentKimiCode,
	model.AgentGrokBuild,
	model.AgentPi,
}
