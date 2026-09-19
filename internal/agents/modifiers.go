package agents

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

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
