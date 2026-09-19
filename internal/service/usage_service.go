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

// GetUsageCollectorStatus returns the real-time runtime status of the usage collector.
func (us *UsageService) GetUsageCollectorStatus() (model.CollectorStatus, error) {
	if us.collector == nil {
		return model.CollectorStatus{
			State:   "error",
			Message: "采集器未初始化",
		}, nil
	}
	return us.collector.Status(), nil
}

// GetUsageOverview returns the aggregated metrics and timeline points matching the query.
func (us *UsageService) GetUsageOverview(query model.UsageQuery) (model.UsageOverview, error) {
	return us.storage.LoadOverview(query)
}

// GetUsageAnalysis returns four-dimensional distributions across models, providers, sources, and API keys.
func (us *UsageService) GetUsageAnalysis(query model.UsageQuery) (model.UsageAnalysis, error) {
	return us.storage.LoadAnalysis(query)
}

// GetUsageEvents returns a paginated list of usage records matching the filters.
func (us *UsageService) GetUsageEvents(query model.UsageQuery) (model.UsageEventPage, error) {
	return us.storage.LoadEvents(query)
}

// GetUsagePricing returns pricing breakdown and model coverage.
func (us *UsageService) GetUsagePricing(query model.UsageQuery) (model.UsagePricing, error) {
	return us.storage.LoadPricing(query)
}

// SaveUsageModelPrice saves or updates a custom model price.
func (us *UsageService) SaveUsageModelPrice(price model.ModelPrice) error {
	return us.storage.SaveModelPrice(price)
}

// DeleteUsageModelPrice deletes a custom model price.
func (us *UsageService) DeleteUsageModelPrice(model string) error {
	return us.storage.DeleteModelPrice(model)
}

// SyncUsageModelPrices syncs model prices from remote GitHub or builtin catalog.
func (us *UsageService) SyncUsageModelPrices(query string) (model.ModelPriceSyncResult, error) {
	proxyURL := ""
	if us.configManager != nil {
		if cfg, err := us.configManager.LoadGuiConfig(); err == nil {
			proxyURL = cfg.ProxyUrl
		}
	}
	return us.storage.SyncModelPrices(proxyURL, query)
}

// GetUsageStorageSettings returns database disk occupancy and max size limits.
func (us *UsageService) GetUsageStorageSettings() (model.UsageStorageSettings, error) {
	return us.storage.GetStorageSettings()
}

// SaveUsageStorageSettings saves maximum database size limit in MB.
func (us *UsageService) SaveUsageStorageSettings(maxDatabaseSizeMb uint64) (model.UsageStorageSettings, error) {
	settings, err := us.storage.SaveStorageSettings(maxDatabaseSizeMb)
	if err == nil && settings.DeletedRecords > 0 {
		us.emitEvent("usage-records-updated", settings.DeletedRecords)
	}
	return settings, err
}

// ShrinkUsageDatabase forcibly reduces database size to target MB.
func (us *UsageService) ShrinkUsageDatabase(targetDatabaseSizeMb uint64) (model.UsageStorageSettings, error) {
	settings, err := us.storage.ShrinkDatabase(targetDatabaseSizeMb)
	if err == nil && settings.DeletedRecords > 0 {
		us.emitEvent("usage-records-updated", settings.DeletedRecords)
	}
	return settings, err
}

// RepairUsageCacheRecords performs historical Claude token discrepancy repair and cleans invalid records.
func (us *UsageService) RepairUsageCacheRecords() (model.UsageRepairResult, error) {
	res, err := us.storage.RepairCacheRecords()
	if err == nil && (res.Repaired > 0 || res.Deleted > 0) {
		us.emitEvent("usage-records-updated", res.Repaired+res.Deleted)
	}
	return res, err
}

// TriggerSync updates collector configuration and syncs records immediately.
func (us *UsageService) TriggerSync() error {
	if us.configManager != nil {
		if cfg, err := us.configManager.LoadGuiConfig(); err == nil {
			us.collector.UpdateConfig(cfg.Port, cfg.ManagementSecretKey)
		}
	}
	_, _, err := us.storage.ProcessInbox(500)
	return err
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
