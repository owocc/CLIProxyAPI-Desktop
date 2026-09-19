package service

import (
	"context"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
)

type ConfigService struct {
	app     *application.App
	manager *config.ConfigManager
	watcher *config.FileWatcher
}

func NewConfigService() *ConfigService {
	cs := &ConfigService{
		manager: config.NewConfigManager(),
	}

	w, err := config.NewFileWatcher(func(changedFiles []string) {
		cs.emitEvent("config-files-changed", changedFiles)
	})
	if err == nil {
		cs.watcher = w
		cs.watcher.Start(context.Background())
	}

	return cs
}

func (cs *ConfigService) SetApp(app *application.App) {
	cs.app = app
}

func (cs *ConfigService) Manager() *config.ConfigManager {
	return cs.manager
}

func (cs *ConfigService) emitEvent(name string, data any) {
	app := cs.app
	if app == nil {
		app = application.Get()
	}
	if app != nil && app.Event != nil {
		app.Event.Emit(name, data)
	}
}

// GetGuiConfig returns the complete config.toml.
func (cs *ConfigService) GetGuiConfig() (model.GuiConfigFile, error) {
	return cs.manager.LoadGuiConfig()
}

// SaveGuiConfig persists the complete config.toml and synchronizes to config.yaml.
func (cs *ConfigService) SaveGuiConfig(cfg model.GuiConfigFile) error {
	err := cs.manager.SaveGuiConfig(cfg)
	if err == nil {
		cs.emitEvent("gui-config-changed", cfg)
	}
	return err
}

// GetGuiSettings returns only the GUI/desktop settings portion.
func (cs *ConfigService) GetGuiSettings() (model.GuiSettings, error) {
	cfg, err := cs.manager.LoadGuiConfig()
	if err != nil {
		return model.GuiSettings{}, err
	}
	return cfg.GuiSettings, nil
}

// SaveGuiSettings updates only the GUI/desktop settings portion.
func (cs *ConfigService) SaveGuiSettings(settings model.GuiSettings) error {
	cfg, err := cs.manager.LoadGuiConfig()
	if err != nil {
		return err
	}
	cfg.GuiSettings = settings
	return cs.manager.SaveGuiConfig(cfg)
}

// GetCoreSettings returns the core settings portion.
func (cs *ConfigService) GetCoreSettings() (model.CoreSettings, error) {
	cfg, err := cs.manager.LoadGuiConfig()
	if err != nil {
		return model.CoreSettings{}, err
	}
	return cfg.CoreSettings, nil
}

// SaveCoreSettings updates only the core settings portion.
func (cs *ConfigService) SaveCoreSettings(settings model.CoreSettings) error {
	cfg, err := cs.manager.LoadGuiConfig()
	if err != nil {
		return err
	}
	cfg.CoreSettings = settings
	return cs.manager.SaveGuiConfig(cfg)
}

// GetApiKeys returns the list of API keys.
func (cs *ConfigService) GetApiKeys() ([]model.ApiKeyEntry, error) {
	cfg, err := cs.manager.LoadGuiConfig()
	if err != nil {
		return nil, err
	}
	return cfg.ApiKeys, nil
}

// SaveApiKeys updates the list of API keys.
func (cs *ConfigService) SaveApiKeys(keys []model.ApiKeyEntry) error {
	cfg, err := cs.manager.LoadGuiConfig()
	if err != nil {
		return err
	}
	cfg.ApiKeys = keys
	return cs.manager.SaveGuiConfig(cfg)
}

// Teardown cleans up resources on shutdown.
func (cs *ConfigService) Teardown() {
	if cs.watcher != nil {
		cs.watcher.Stop()
	}
}
