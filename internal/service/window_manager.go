package service

import (
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// WindowManager coordinates the lifecycle of the primary WebviewWindow,
// including creating on demand, hiding, and releasing the WebKit rendering
// process when lightweight mode is engaged.
type WindowManager struct {
	mu            sync.Mutex
	app           *application.App
	configService *ConfigService
	mainWindow    *application.WebviewWindow
}

func NewWindowManager(app *application.App, configService *ConfigService) *WindowManager {
	return &WindowManager{
		app:           app,
		configService: configService,
	}
}

// SetInitialWindow assigns the initial window created during application startup.
func (wm *WindowManager) SetInitialWindow(win *application.WebviewWindow) {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	wm.mainWindow = win
	wm.bindWindowEvents(win)
}

// ShowWindow shows and focuses the main window, recreating it if it was destroyed.
func (wm *WindowManager) ShowWindow() {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	if wm.mainWindow == nil {
		wm.createMainWindowLocked()
	}

	if wm.mainWindow != nil {
		wm.mainWindow.Show()
		wm.mainWindow.Focus()
	}
}

// HideMainWindow hides the main window while keeping the webview loaded in memory.
func (wm *WindowManager) HideMainWindow() {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	if wm.mainWindow != nil {
		wm.mainWindow.Hide()
	}
}

// DestroyMainWindow closes the main window so its WebKit process is released,
// leaving the proxy core and tray running in the background.
func (wm *WindowManager) DestroyMainWindow() {
	wm.mu.Lock()
	win := wm.mainWindow
	wm.mainWindow = nil
	wm.mu.Unlock()

	if win != nil {
		log.Println("[WindowManager] DestroyMainWindow: closing window via win.Close()")
		win.Close()
	}
}

// IsWindowVisible returns whether the main window currently exists and is visible.
func (wm *WindowManager) IsWindowVisible() bool {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	if wm.mainWindow == nil {
		return false
	}
	return wm.mainWindow.IsVisible()
}

func (wm *WindowManager) createMainWindowLocked() {
	log.Println("[WindowManager] Recreating main WebviewWindow")
	win := wm.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "EasyCLIProxyAPI",
		Width:  1100,
		Height: 720,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(15, 17, 23),
		URL:              "/",
	})

	wm.mainWindow = win
	wm.bindWindowEvents(win)
}

func (wm *WindowManager) bindWindowEvents(win *application.WebviewWindow) {
	if win == nil {
		return
	}

	// RegisterHook runs synchronously before any default listeners.
	// This prevents race conditions and crashes during window destruction.
	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		cfg, err := wm.configService.GetGuiConfig()
		if err != nil {
			log.Printf("[WindowManager] Failed to read GUI config on close: %v; minimizing", err)
			e.Cancel()
			wm.HideMainWindow()
			return
		}

		isLightweight := cfg.LightweightMode || cfg.CloseBehavior == "lightweight"
		isMinimize := cfg.CloseBehavior == "minimize-to-tray" || cfg.CloseBehavior == "tray"

		if isLightweight {
			log.Println("[WindowManager] Closing window in lightweight mode; allowing native window destroy")
			wm.mu.Lock()
			wm.mainWindow = nil
			wm.mu.Unlock()
			// Do NOT cancel the event! Wails' built-in listener will natively close and destroy the window cleanly once.
			return
		}

		if isMinimize {
			e.Cancel()
			log.Println("[WindowManager] Minimizing window to tray")
			wm.HideMainWindow()
			return
		}

		// Exit behavior
		e.Cancel()
		log.Println("[WindowManager] Window close configured to exit application")
		wm.app.Quit()
	})
}
