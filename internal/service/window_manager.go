package service

import (
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// WindowManager coordinates the lifecycle of the primary WebviewWindow,
// including creating on demand, hiding, and destroying the WebKit process
// when lightweight mode is engaged.
type WindowManager struct {
	mu            sync.Mutex
	app           *application.App
	configService *ConfigService
	mainWindow    *application.WebviewWindow
	isDestroying  bool
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

// DestroyMainWindow destroys the main window and its underlying WebKit WebContent process,
// releasing the memory while keeping the core proxy running in the background.
func (wm *WindowManager) DestroyMainWindow() {
	wm.mu.Lock()
	if wm.mainWindow != nil {
		log.Println("[WindowManager] Closing WebUI window for lightweight mode; releasing WebKit memory")
		win := wm.mainWindow
		wm.mainWindow = nil
		wm.isDestroying = true
		wm.mu.Unlock()

		win.Close()

		wm.mu.Lock()
		wm.isDestroying = false
		wm.mu.Unlock()
		return
	}
	wm.mu.Unlock()
}

// HandleWindowClosing applies the configured close behavior when the user clicks the window close button.
func (wm *WindowManager) HandleWindowClosing() {
	cfg, err := wm.configService.GetGuiConfig()
	if err != nil {
		log.Printf("[WindowManager] Failed to read GUI config on close: %v; minimizing", err)
		wm.HideMainWindow()
		return
	}

	if cfg.LightweightMode || cfg.CloseBehavior == "lightweight" {
		wm.DestroyMainWindow()
	} else if cfg.CloseBehavior == "minimize-to-tray" || cfg.CloseBehavior == "tray" {
		wm.HideMainWindow()
	} else {
		wm.app.Quit()
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
	win.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		wm.mu.Lock()
		if wm.isDestroying {
			wm.mu.Unlock()
			return
		}
		wm.mu.Unlock()

		e.Cancel()
		wm.HandleWindowClosing()
	})
}
