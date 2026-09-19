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
