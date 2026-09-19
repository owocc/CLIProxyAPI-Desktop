package agents

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	toml "github.com/pelletier/go-toml/v2"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
)

// ApplyConfig modifies the client's configuration file to point to EasyCLIProxyAPI.
func ApplyConfig(clientId string, modelName string, port int, apiKey string) error {
	paths := ResolveConfigPaths(clientId)
	if len(paths) == 0 {
		return fmt.Errorf("未找到客户端 %s 的配置路径", clientId)
	}

	targetPath := paths[0]
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	if apiKey == "" {
		apiKey = "123456"
	}
	if port <= 0 {
		port = 8317
	}

	rootBase := fmt.Sprintf("http://127.0.0.1:%d", port)
	openaiBase := fmt.Sprintf("%s/v1", rootBase)

	switch clientId {
	case model.AgentClaudeCode:
		return applyClaudeCode(targetPath, rootBase, apiKey, modelName)
	case model.AgentCodex:
		return applyCodex(targetPath, openaiBase, apiKey, modelName)
	case model.AgentOpenCode:
		return applyOpenCode(targetPath, openaiBase, apiKey, modelName)
	case model.AgentOpenClaw:
		return applyOpenClaw(targetPath, openaiBase, apiKey, modelName)
	case model.AgentKimiCode:
		return applyKimiCode(targetPath, openaiBase, apiKey, modelName)
	case model.AgentGrokBuild:
		return applyGrokBuild(targetPath, openaiBase, apiKey, modelName)
	default:
		// Default generic JSON/TOML update
		return applyGeneric(targetPath, openaiBase, apiKey, modelName)
	}
}

func applyClaudeCode(path, rootBase, apiKey, modelName string) error {
	var data map[string]any = make(map[string]any)

	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &data)
	}

	envObj, ok := data["env"].(map[string]any)
	if !ok || envObj == nil {
		envObj = make(map[string]any)
		data["env"] = envObj
	}

	// Remove direct API key to avoid conflicts
	delete(envObj, "ANTHROPIC_API_KEY")

	// Set managed base URL and auth token
	envObj["ANTHROPIC_BASE_URL"] = rootBase
	envObj["ANTHROPIC_AUTH_TOKEN"] = apiKey

	if modelName != "" {
		envObj["ANTHROPIC_MODEL"] = modelName
		envObj["ANTHROPIC_DEFAULT_SONNET_MODEL"] = modelName
		envObj["ANTHROPIC_DEFAULT_OPUS_MODEL"] = modelName
		envObj["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = modelName
	}

	outBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 Claude Code 配置失败: %w", err)
	}

	return config.WriteFileAtomic(path, outBytes, 0644)
}

func applyCodex(path, openaiBase, apiKey, modelName string) error {
	var data map[string]any = make(map[string]any)

	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		_ = toml.Unmarshal(raw, &data)
	}

	data["model_provider"] = "cpa-gui"
	if modelName != "" {
		data["model"] = modelName
	}

	providers, ok := data["model_providers"].(map[string]any)
	if !ok || providers == nil {
		providers = make(map[string]any)
		data["model_providers"] = providers
	}

	providers["cpa-gui"] = map[string]any{
		"name":                      "cpa-gui",
		"base_url":                  openaiBase,
		"wire_api":                  "responses",
		"experimental_bearer_token": apiKey,
		"requires_openai_auth":      false,
	}

	outBytes, err := toml.Marshal(data)
	if err != nil {
		return fmt.Errorf("序列化 Codex 配置失败: %w", err)
	}

	return config.WriteFileAtomic(path, outBytes, 0644)
}

func applyOpenCode(path, openaiBase, apiKey, modelName string) error {
	var data map[string]any = make(map[string]any)

	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &data)
	}

	providers, ok := data["provider"].(map[string]any)
	if !ok || providers == nil {
		providers = make(map[string]any)
		data["provider"] = providers
	}

	providers["cpa-gui"] = map[string]any{
		"npm":  "@ai-sdk/openai-compatible",
		"name": "cpa-gui",
		"options": map[string]any{
			"baseURL": openaiBase,
			"apiKey":  apiKey,
		},
	}

	if modelName != "" {
		data["model"] = fmt.Sprintf("cpa-gui/%s", modelName)
	}

	outBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return config.WriteFileAtomic(path, outBytes, 0644)
}

func applyOpenClaw(path, openaiBase, apiKey, modelName string) error {
	var data map[string]any = make(map[string]any)

	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &data)
	}

	data["models"] = map[string]any{
		"mode": "merge",
		"providers": map[string]any{
			"cpa-gui": map[string]any{
				"baseURL": openaiBase,
				"apiKey":  apiKey,
			},
		},
	}

	if modelName != "" {
		data["agents"] = map[string]any{
			"defaults": map[string]any{
				"model": map[string]any{
					"primary": fmt.Sprintf("cpa-gui/%s", modelName),
				},
			},
		}
	}

	outBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return config.WriteFileAtomic(path, outBytes, 0644)
}

func applyKimiCode(path, openaiBase, apiKey, modelName string) error {
	var data map[string]any = make(map[string]any)

	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		_ = toml.Unmarshal(raw, &data)
	}

	if modelName != "" {
		data["default_model"] = fmt.Sprintf("cpa-gui/%s", modelName)
	}

	providers, ok := data["providers"].(map[string]any)
	if !ok || providers == nil {
		providers = make(map[string]any)
		data["providers"] = providers
	}

	providers["cpa-gui"] = map[string]any{
		"base_url": openaiBase,
		"api_key":  apiKey,
	}

	outBytes, err := toml.Marshal(data)
	if err != nil {
		return err
	}
	return config.WriteFileAtomic(path, outBytes, 0644)
}

func applyGrokBuild(path, openaiBase, apiKey, modelName string) error {
	return applyKimiCode(path, openaiBase, apiKey, modelName)
}

func applyGeneric(path, openaiBase, apiKey, modelName string) error {
	ext := filepath.Ext(path)
	if ext == ".toml" {
		return applyKimiCode(path, openaiBase, apiKey, modelName)
	}
	return applyOpenCode(path, openaiBase, apiKey, modelName)
}

// ApplyClaudeCodeDetailed writes full granular Claude Code configuration into settings.json.
func ApplyClaudeCodeDetailed(options model.ClaudeCodeConfig, port int, apiKey string) error {
	paths := ResolveConfigPaths(model.AgentClaudeCode)
	if len(paths) == 0 {
		return fmt.Errorf("未找到 Claude Code 配置路径")
	}
	targetPath := paths[0]
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	if apiKey == "" {
		apiKey = "123456"
	}
	if port <= 0 {
		port = 8317
	}
	rootBase := fmt.Sprintf("http://127.0.0.1:%d", port)

	var data map[string]any = make(map[string]any)
	if raw, err := os.ReadFile(targetPath); err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &data)
	}

	envObj, ok := data["env"].(map[string]any)
	if !ok || envObj == nil {
		envObj = make(map[string]any)
		data["env"] = envObj
	}

	delete(envObj, "ANTHROPIC_API_KEY")

	envObj["ANTHROPIC_BASE_URL"] = rootBase
	envObj["ANTHROPIC_AUTH_TOKEN"] = apiKey

	opus := options.OpusModel
	if opus == "" {
		opus = "claude-3-opus-20240229"
	}
	if options.Opus1M && !strings.HasSuffix(opus, "[1m]") {
		opus = opus + "[1m]"
	}

	sonnet := options.SonnetModel
	if sonnet == "" {
		sonnet = "claude-3-7-sonnet-20250219"
	}
	if options.Sonnet1M && !strings.HasSuffix(sonnet, "[1m]") {
		sonnet = sonnet + "[1m]"
	}

	haiku := options.HaikuModel
	if haiku == "" {
		haiku = "claude-3-5-haiku-20241022"
	}
	if options.Haiku1M && !strings.HasSuffix(haiku, "[1m]") {
		haiku = haiku + "[1m]"
	}

	envObj["ANTHROPIC_MODEL"] = sonnet
	envObj["ANTHROPIC_DEFAULT_SONNET_MODEL"] = sonnet
	envObj["ANTHROPIC_DEFAULT_OPUS_MODEL"] = opus
	envObj["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = haiku
	envObj["ANTHROPIC_DEFAULT_FABLE_MODEL"] = sonnet
	envObj["CLAUDE_CODE_SUBAGENT_MODEL"] = haiku
	envObj["CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY"] = "1"

	maxCtx := options.MaxContextTokens
	if maxCtx <= 0 {
		if options.Opus1M || options.Sonnet1M || options.Haiku1M {
			maxCtx = 1000000
		} else {
			maxCtx = 200000
		}
	}
	envObj["CLAUDE_CODE_MAX_CONTEXT_TOKENS"] = fmt.Sprintf("%d", maxCtx)

	compactPct := options.AutoCompactPct
	if compactPct <= 0 || compactPct > 100 {
		compactPct = 90
	}
	envObj["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] = fmt.Sprintf("%d", compactPct)

	if options.DisableAutoCompact {
		envObj["DISABLE_AUTO_COMPACT"] = "1"
	} else {
		delete(envObj, "DISABLE_AUTO_COMPACT")
	}

	data["model"] = sonnet

	outBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 Claude Code 配置失败: %w", err)
	}

	return config.WriteFileAtomic(targetPath, outBytes, 0644)
}

// ApplyCodexDetailed configures Codex with model and auth method.
func ApplyCodexDetailed(options model.CodexConfig, port int, apiKey string) error {
	paths := ResolveConfigPaths(model.AgentCodex)
	if len(paths) == 0 {
		return fmt.Errorf("未找到 Codex 配置路径")
	}
	targetPath := paths[0]
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	if apiKey == "" {
		apiKey = "123456"
	}
	if port <= 0 {
		port = 8317
	}
	openaiBase := fmt.Sprintf("http://127.0.0.1:%d/v1", port)

	var data map[string]any = make(map[string]any)
	if raw, err := os.ReadFile(targetPath); err == nil && len(raw) > 0 {
		_ = toml.Unmarshal(raw, &data)
	}

	data["model_provider"] = "cpa-gui"
	if options.Model != "" {
		data["model"] = options.Model
	}

	providers, ok := data["model_providers"].(map[string]any)
	if !ok || providers == nil {
		providers = make(map[string]any)
		data["model_providers"] = providers
	}

	providers["cpa-gui"] = map[string]any{
		"name":                      "cpa-gui",
		"base_url":                  openaiBase,
		"wire_api":                  "responses",
		"experimental_bearer_token": apiKey,
		"requires_openai_auth":      (options.AuthMethod == "oauth"),
	}

	outBytes, err := toml.Marshal(data)
	if err != nil {
		return fmt.Errorf("序列化 Codex 配置失败: %w", err)
	}

	return config.WriteFileAtomic(targetPath, outBytes, 0644)
}

// CloseAgentConfig removes CPA proxy modifications and restores clean configuration.
func CloseAgentConfig(clientId string) error {
	paths := ResolveConfigPaths(clientId)
	if len(paths) == 0 {
		return nil
	}
	targetPath := paths[0]
	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		return nil
	}

	switch clientId {
	case model.AgentClaudeCode:
		var data map[string]any
		raw, err := os.ReadFile(targetPath)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil
		}
		if env, ok := data["env"].(map[string]any); ok {
			for _, key := range []string{
				"ANTHROPIC_BASE_URL",
				"ANTHROPIC_API_KEY",
				"ANTHROPIC_AUTH_TOKEN",
				"ANTHROPIC_MODEL",
				"ANTHROPIC_DEFAULT_HAIKU_MODEL",
				"ANTHROPIC_DEFAULT_SONNET_MODEL",
				"ANTHROPIC_DEFAULT_OPUS_MODEL",
				"ANTHROPIC_DEFAULT_FABLE_MODEL",
				"CLAUDE_CODE_SUBAGENT_MODEL",
				"CLAUDE_CODE_MAX_CONTEXT_TOKENS",
				"CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY",
				"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
				"DISABLE_AUTO_COMPACT",
				"CLAUDE_CODE_EFFORT_LEVEL",
			} {
				delete(env, key)
			}
			if len(env) == 0 {
				delete(data, "env")
			}
		}
		outBytes, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return err
		}
		return config.WriteFileAtomic(targetPath, outBytes, 0644)

	case model.AgentCodex:
		return CloseCodexConfigModification("")

	case model.AgentOpenCode:
		var data map[string]any
		raw, err := os.ReadFile(targetPath)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil
		}
		if providers, ok := data["provider"].(map[string]any); ok {
			delete(providers, "cpa-gui")
		}
		if m, ok := data["model"].(string); ok && strings.HasPrefix(m, "cpa-gui/") {
			delete(data, "model")
		}
		outBytes, _ := json.MarshalIndent(data, "", "  ")
		return config.WriteFileAtomic(targetPath, outBytes, 0644)

	case model.AgentOpenClaw:
		var data map[string]any
		raw, err := os.ReadFile(targetPath)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil
		}
		if models, ok := data["models"].(map[string]any); ok {
			if providers, ok := models["providers"].(map[string]any); ok {
				delete(providers, "cpa-gui")
			}
		}
		outBytes, _ := json.MarshalIndent(data, "", "  ")
		return config.WriteFileAtomic(targetPath, outBytes, 0644)

	default:
		raw, err := os.ReadFile(targetPath)
		if err != nil {
			return nil
		}
		if strings.HasSuffix(targetPath, ".toml") {
			var data map[string]any
			if err := toml.Unmarshal(raw, &data); err == nil {
				delete(data, "model_provider")
				if providers, ok := data["model_providers"].(map[string]any); ok {
					delete(providers, "cpa-gui")
				}
				outBytes, _ := toml.Marshal(data)
				_ = config.WriteFileAtomic(targetPath, outBytes, 0644)
			}
		}
		return nil
	}
}

// GetAgentDetail parses current fine-grained configuration for the specified client.
func GetAgentDetail(clientId string) (model.AgentDetail, error) {
	detail := model.AgentDetail{
		Id: clientId,
	}

	paths := ResolveConfigPaths(clientId)
	configured, currentModel := inspectConfigured(clientId, paths)
	detail.Configured = configured
	detail.Model = currentModel

	if len(paths) == 0 {
		return detail, nil
	}
	targetPath := paths[0]
	raw, err := os.ReadFile(targetPath)
	if err != nil {
		return detail, nil
	}

	switch clientId {
	case model.AgentClaudeCode:
		var parsed struct {
			Model string            `json:"model"`
			Env   map[string]string `json:"env"`
		}
		_ = json.Unmarshal(raw, &parsed)
		env := parsed.Env
		if env == nil {
			env = make(map[string]string)
		}

		opus := env["ANTHROPIC_DEFAULT_OPUS_MODEL"]
		if opus == "" {
			opus = "claude-3-opus-20240229"
		}
		sonnet := env["ANTHROPIC_DEFAULT_SONNET_MODEL"]
		if sonnet == "" {
			sonnet = env["ANTHROPIC_MODEL"]
			if sonnet == "" {
				sonnet = "claude-3-7-sonnet-20250219"
			}
		}
		haiku := env["ANTHROPIC_DEFAULT_HAIKU_MODEL"]
		if haiku == "" {
			haiku = "claude-3-5-haiku-20241022"
		}

		maxCtx, _ := strconv.Atoi(env["CLAUDE_CODE_MAX_CONTEXT_TOKENS"])
		if maxCtx <= 0 {
			maxCtx = 200000
		}

		autoCompact, _ := strconv.Atoi(env["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"])
		if autoCompact <= 0 {
			autoCompact = 90
		}

		disableAutoCompact := env["DISABLE_AUTO_COMPACT"] == "1"

		opus1M := strings.HasSuffix(opus, "[1m]")
		sonnet1M := strings.HasSuffix(sonnet, "[1m]")
		haiku1M := strings.HasSuffix(haiku, "[1m]")

		detail.ClaudeCode = &model.ClaudeCodeConfig{
			OpusModel:          strings.TrimSuffix(opus, "[1m]"),
			SonnetModel:        strings.TrimSuffix(sonnet, "[1m]"),
			HaikuModel:         strings.TrimSuffix(haiku, "[1m]"),
			Opus1M:             opus1M,
			Sonnet1M:           sonnet1M,
			Haiku1M:            haiku1M,
			MaxContextTokens:   maxCtx,
			AutoCompactPct:     autoCompact,
			DisableAutoCompact: disableAutoCompact,
			CustomMapping:      opus1M || sonnet1M || haiku1M || maxCtx >= 1000000,
		}

	case model.AgentCodex:
		var parsed struct {
			Model          string `toml:"model"`
			ModelProviders map[string]struct {
				RequiresOpenAIAuth bool `toml:"requires_openai_auth"`
			} `toml:"model_providers"`
		}
		_ = toml.Unmarshal(raw, &parsed)
		authMethod := "apikey"
		if cpa, ok := parsed.ModelProviders["cpa-gui"]; ok && cpa.RequiresOpenAIAuth {
			authMethod = "oauth"
		}
		detail.Codex = &model.CodexConfig{
			Model:      parsed.Model,
			AuthMethod: authMethod,
		}
	}

	return detail, nil
}

// LaunchAgent launches the agent CLI in a terminal window or launches the desktop app.
func LaunchAgent(clientId string) error {
	home := UserHomeDir()
	exePath := FindAgentExecutable(clientId, home)
	appPath := FindDesktopAppInstallation(clientId, home)

	if exePath == "" && appPath == "" {
		return fmt.Errorf("未检测到该客户端的安装程序")
	}

	if clientId == model.AgentClaudeDesktop || (exePath == "" && appPath != "") {
		if runtime.GOOS == "darwin" && appPath != "" {
			return exec.Command("open", appPath).Start()
		}
		if runtime.GOOS == "windows" && exePath != "" {
			return exec.Command(exePath).Start()
		}
	}

	if exePath != "" {
		switch runtime.GOOS {
		case "darwin":
			cmdLine := fmt.Sprintf("cd '%s' && exec '%s'", home, exePath)
			script := fmt.Sprintf(`tell application "Terminal"
activate
do script "%s"
end tell`, strings.ReplaceAll(cmdLine, `"`, `\"`))
			return exec.Command("osascript", "-e", script).Start()

		case "windows":
			return exec.Command("cmd", "/c", "start", "cmd", "/k", fmt.Sprintf("cd /d %s && call \"%s\"", home, exePath)).Start()

		default:
			for _, term := range []string{"x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "kitty", "alacritty", "xterm"} {
				if p, err := exec.LookPath(term); err == nil {
					return exec.Command(p, "-e", exePath).Start()
				}
			}
			return exec.Command(exePath).Start()
		}
	}

	return nil
}
