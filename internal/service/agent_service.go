package service

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/agents"
	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
)

type AgentService struct {
	app           *application.App
	configManager *config.ConfigManager
}

func NewAgentService(cm *config.ConfigManager) *AgentService {
	return &AgentService{
		configManager: cm,
	}
}

func (as *AgentService) SetApp(app *application.App) {
	as.app = app
}

// ListAgents returns discovery status for all supported agent targets.
func (as *AgentService) ListAgents() []model.AgentInfo {
	results := make([]model.AgentInfo, 0, len(agents.AllClientIds))
	for _, id := range agents.AllClientIds {
		results = append(results, agents.DiscoverAgent(id))
	}
	return results
}

// GetAgent returns discovery status for a single agent.
func (as *AgentService) GetAgent(id string) (model.AgentInfo, error) {
	for _, valid := range agents.AllClientIds {
		if valid == id {
			return agents.DiscoverAgent(id), nil
		}
	}
	return model.AgentInfo{}, fmt.Errorf("未知智能体目标: %s", id)
}

// ApplyAgentConfig configures the specified client with transaction and backup.
func (as *AgentService) ApplyAgentConfig(id string, modelName string) error {
	cfg, err := as.configManager.LoadGuiConfig()
	if err != nil {
		return fmt.Errorf("读取当前配置失败: %w", err)
	}

	port := cfg.Port
	if port <= 0 {
		port = DefaultPort
	}

	apiKey := "123456"
	if len(cfg.ApiKeys) > 0 && cfg.ApiKeys[0].ApiKey != "" {
		apiKey = cfg.ApiKeys[0].ApiKey
	}

	return agents.ApplyWithTransaction(id, modelName, port, apiKey)
}

// RestoreAgentConfig restores the latest backup for the specified client.
func (as *AgentService) RestoreAgentConfig(id string) error {
	return agents.RestoreLatestBackup(id)
}

// ListBackups returns all configuration backups for the specified client.
func (as *AgentService) ListBackups(id string) ([]model.BackupEntry, error) {
	return agents.ListBackups(id)
}

// RestoreSpecificBackup restores a specific historical backup.
func (as *AgentService) RestoreSpecificBackup(id string, backupFileName string) error {
	return agents.RestoreBackup(id, backupFileName)
}

// CheckCodexOAuthLogin checks if Codex has official OAuth credentials.
func (as *AgentService) CheckCodexOAuthLogin() (bool, error) {
	return agents.CheckCodexOAuthLogin("")
}

// RestoreCodexOfficialConfig resets Codex configuration to official native OpenAI mode.
func (as *AgentService) RestoreCodexOfficialConfig() error {
	return agents.RestoreCodexOfficialConfig("")
}

// CloseCodexConfigModification removes CPA proxy settings from Codex config.toml.
func (as *AgentService) CloseCodexConfigModification() error {
	return agents.CloseCodexConfigModification("")
}

// GetCodexNativeStatus retrieves the status of Codex native mode and authentication.
func (as *AgentService) GetCodexNativeStatus() (model.CodexNativeStatus, error) {
	return agents.GetCodexNativeStatus("")
}

// GetAgentDetail returns detailed configuration parameters for an agent client.
func (as *AgentService) GetAgentDetail(id string) (model.AgentDetail, error) {
	return agents.GetAgentDetail(id)
}

// ApplyClaudeCodeConfig applies fine-grained Claude Code configuration.
func (as *AgentService) ApplyClaudeCodeConfig(options model.ClaudeCodeConfig) error {
	cfg, err := as.configManager.LoadGuiConfig()
	if err != nil {
		return fmt.Errorf("读取当前配置失败: %w", err)
	}
	port := cfg.Port
	if port <= 0 {
		port = DefaultPort
	}
	apiKey := "123456"
	if len(cfg.ApiKeys) > 0 && cfg.ApiKeys[0].ApiKey != "" {
		apiKey = cfg.ApiKeys[0].ApiKey
	}
	return agents.ApplyClaudeCodeDetailed(options, port, apiKey)
}

// ApplyCodexConfig applies fine-grained Codex configuration.
func (as *AgentService) ApplyCodexConfig(options model.CodexConfig) error {
	cfg, err := as.configManager.LoadGuiConfig()
	if err != nil {
		return fmt.Errorf("读取当前配置失败: %w", err)
	}
	port := cfg.Port
	if port <= 0 {
		port = DefaultPort
	}
	apiKey := "123456"
	if len(cfg.ApiKeys) > 0 && cfg.ApiKeys[0].ApiKey != "" {
		apiKey = cfg.ApiKeys[0].ApiKey
	}
	return agents.ApplyCodexDetailed(options, port, apiKey)
}

// CloseAgentConfig removes CPA proxy configuration from the client.
func (as *AgentService) CloseAgentConfig(id string) error {
	return agents.CloseAgentConfig(id)
}

// LaunchAgent opens the agent client in system terminal or opens the app.
func (as *AgentService) LaunchAgent(id string) error {
	return agents.LaunchAgent(id)
}

// GetAvailableModels returns the list of candidate upstream models for agent selection.
func (as *AgentService) GetAvailableModels() []string {
	return []string{
		"claude-3-7-sonnet-20250219",
		"claude-3-5-sonnet-20241022",
		"claude-3-5-haiku-20241022",
		"claude-3-opus-20240229",
		"gpt-4o",
		"gpt-4o-mini",
		"o1",
		"o3-mini",
		"gemini-2.5-pro",
		"gemini-2.5-flash",
		"gemini-3.8-flash-high",
		"deepseek-r1",
		"deepseek-v3",
	}
}

