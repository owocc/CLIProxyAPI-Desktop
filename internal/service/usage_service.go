package service

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
	"easycliproxyapi/internal/usage"
)

type UsageService struct {
	app           *application.App
	storage       *usage.Storage
	collector     *usage.Collector
	configManager *config.ConfigManager
}

func NewUsageService(cm *config.ConfigManager) (*UsageService, error) {
	storage, err := usage.NewStorage("")
	if err != nil {
		return nil, err
	}

	us := &UsageService{
		storage:       storage,
		configManager: cm,
	}

	us.collector = usage.NewCollector(storage, func(count int) {
		us.emitEvent("usage-records-updated", count)
	})

	// Initial port config
	if cm != nil {
		if cfg, err := cm.LoadGuiConfig(); err == nil {
			us.collector.UpdateConfig(cfg.Port, cfg.ManagementSecretKey)
		}
	}

	us.collector.Start()
	return us, nil
}

func (us *UsageService) SetApp(app *application.App) {
	us.app = app
}

func (us *UsageService) emitEvent(name string, data any) {
	app := us.app
	if app == nil {
		app = application.Get()
	}
	if app != nil && app.Event != nil {
		app.Event.Emit(name, data)
	}
}

// GetUsageSummary returns the aggregated usage metrics.
func (us *UsageService) GetUsageSummary() (model.UsageSummary, error) {
	return us.storage.GetSummary()
}

// GetRecentRecords returns a paginated list of recent requests.
func (us *UsageService) GetRecentRecords(limit int, offset int) ([]model.UsageRecord, error) {
	return us.storage.GetRecentRecords(limit, offset)
}

// GetDailyTrend returns daily aggregated data for the last N days.
func (us *UsageService) GetDailyTrend(days int) ([]model.DailyTrendPoint, error) {
	return us.storage.GetDailyTrend(days)
}

// TriggerSync updates collector configuration and syncs records.
func (us *UsageService) TriggerSync() error {
	if us.configManager != nil {
		if cfg, err := us.configManager.LoadGuiConfig(); err == nil {
			us.collector.UpdateConfig(cfg.Port, cfg.ManagementSecretKey)
		}
	}
	return nil
}

// Teardown closes background collector and database.
func (us *UsageService) Teardown() {
	if us.collector != nil {
		us.collector.Stop()
	}
	if us.storage != nil {
		_ = us.storage.Close()
	}
}
