package service

import (
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// DesktopService exposes desktop window management and lifecycle methods to the frontend.
type DesktopService struct {
	app           *application.App
	wm            *WindowManager
	configService *ConfigService
}

func NewDesktopService(wm *WindowManager, configService *ConfigService) *DesktopService {
	return &DesktopService{
		wm:            wm,
		configService: configService,
	}
}

func (ds *DesktopService) SetApp(app *application.App) {
	ds.app = app
}

func (ds *DesktopService) SetWindowManager(wm *WindowManager) {
	ds.wm = wm
}

// EnterLightweightMode destroys the WebUI window to release WebKit memory,
// leaving the proxy core and menu bar tray running in the background.
func (ds *DesktopService) EnterLightweightMode() error {
	if ds.configService != nil {
		cfg, err := ds.configService.GetGuiConfig()
		if err == nil {
			if !cfg.LightweightMode || cfg.CloseBehavior != "lightweight" {
				cfg.LightweightMode = true
				cfg.CloseBehavior = "lightweight"
				_ = ds.configService.SaveGuiConfig(cfg)
			}
		}
	}
	if ds.wm != nil {
		ds.wm.DestroyMainWindow()
	}
	return nil
}

// HideWindow minimizes/hides the main window to the system tray.
func (ds *DesktopService) HideWindow() error {
	if ds.wm != nil {
		ds.wm.HideMainWindow()
	}
	return nil
}

// ShowWindow shows and focuses the main window.
func (ds *DesktopService) ShowWindow() error {
	if ds.wm != nil {
		ds.wm.ShowWindow()
	}
	return nil
}

// QuitApp shuts down the application and cleanly terminates all background processes.
func (ds *DesktopService) QuitApp() error {
	if ds.app != nil {
		ds.app.Quit()
	} else {
		application.Get().Quit()
	}
	return nil
}

// SetWindowTheme updates the native window appearance and vibrant backdrop (e.g. "dark", "light", "system").
func (ds *DesktopService) SetWindowTheme(theme string) error {
	if ds.wm != nil {
		if theme == "system" || theme == "" {
			if ds.app != nil && ds.app.Env.IsDarkMode() {
				theme = "dark"
			} else {
				theme = "light"
			}
		}
		ds.wm.SetWindowTheme(theme)
	}
	return nil
}

// IsDarkMode returns whether the operating system is currently in dark mode.
func (ds *DesktopService) IsDarkMode() (bool, error) {
	if ds.app != nil {
		return ds.app.Env.IsDarkMode(), nil
	}
	return false, nil
}

// GetPlatform returns the current operating system (e.g. "darwin", "windows", "linux").
func (ds *DesktopService) GetPlatform() (string, error) {
	return runtime.GOOS, nil
}

// IsLightweightModeEnabled checks if lightweight mode is currently enabled in settings.
func (ds *DesktopService) IsLightweightModeEnabled() (bool, error) {
	if ds.configService == nil {
		return false, nil
	}
	cfg, err := ds.configService.GetGuiConfig()
	if err != nil {
		return false, err
	}
	return cfg.LightweightMode, nil
}
