package tray

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/service"
)

// TrayManager manages the system tray / menu bar item and its context menu.
type TrayManager struct {
	mu            sync.Mutex
	app           *application.App
	tray          *application.SystemTray
	coreService   *service.CoreService
	configService *service.ConfigService
	windowManager *service.WindowManager
	iconBytes     []byte
}

func NewTrayManager(
	app *application.App,
	coreService *service.CoreService,
	configService *service.ConfigService,
	windowManager *service.WindowManager,
) *TrayManager {
	return &TrayManager{
		app:           app,
		coreService:   coreService,
		configService: configService,
		windowManager: windowManager,
		iconBytes:     generateTrayIconPNG(),
	}
}

// Setup initializes the system tray icon and attaches the dynamic menu.
func (tm *TrayManager) Setup() error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	tray := tm.app.SystemTray.New()
	if tray == nil {
		return fmt.Errorf("failed to create system tray")
	}
	tm.tray = tray

	// Set template icon so macOS automatically handles light & dark menu bars
	if len(tm.iconBytes) > 0 {
		tray.SetTemplateIcon(tm.iconBytes)
		tray.SetIcon(tm.iconBytes)
	}

	// Primary click on the tray icon shows and focuses the main window
	tray.OnClick(func() {
		if tm.windowManager != nil {
			tm.windowManager.ShowWindow()
		}
	})

	// Initial menu build
	tm.rebuildMenuLocked()

	// Listen for core status changes to keep menu items updated
	tm.app.Event.On("core-status-changed", func(e *application.CustomEvent) {
		tm.UpdateMenu()
	})

	// Listen for config changes to keep menu items in sync
	tm.app.Event.On("gui-config-changed", func(e *application.CustomEvent) {
		tm.UpdateMenu()
	})

	log.Println("[TrayManager] System tray initialized successfully")
	return nil
}

// UpdateMenu refreshes the tray menu items to reflect current runtime status.
func (tm *TrayManager) UpdateMenu() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if tm.tray == nil {
		return
	}
	tm.rebuildMenuLocked()
}

func (tm *TrayManager) rebuildMenuLocked() {
	menu := tm.app.NewMenu()

	// 1. Status overview item (disabled, informative)
	status := tm.coreService.GetStatus()
	port := tm.coreService.GetCorePort()

	var statusLabel string
	if status.Starting {
		statusLabel = fmt.Sprintf("内核状态: 启动中 (端口 %d)...", port)
	} else if status.Running {
		if status.Ready {
			statusLabel = fmt.Sprintf("内核状态: 运行中 (端口 %d)", port)
		} else {
			statusLabel = fmt.Sprintf("内核状态: 正在就绪 (端口 %d)", port)
		}
	} else {
		statusLabel = "内核状态: 已停止"
	}

	statusItem := menu.Add(statusLabel)
	statusItem.SetEnabled(false)

	// 2. Show Main Window
	menu.Add("显示主界面").OnClick(func(ctx *application.Context) {
		if tm.windowManager != nil {
			tm.windowManager.ShowWindow()
		}
	})

	menu.AddSeparator()

	// 3. Start / Stop Kernel controls
	if status.Running {
		menu.Add("关闭内核").OnClick(func(ctx *application.Context) {
			log.Println("[Tray] Stopping core from tray menu")
			if err := tm.coreService.StopCore(); err != nil {
				log.Printf("[Tray] Failed to stop core: %v", err)
			}
			tm.UpdateMenu()
		})

		menu.Add("重启内核").OnClick(func(ctx *application.Context) {
			log.Println("[Tray] Restarting core from tray menu")
			if err := tm.coreService.RestartCore(); err != nil {
				log.Printf("[Tray] Failed to restart core: %v", err)
			}
			tm.UpdateMenu()
		})
	} else {
		startItem := menu.Add("启动内核")
		if !status.Installed {
			startItem.SetEnabled(false)
			startItem.SetLabel("启动内核 (请先在主界面安装)")
		} else {
			startItem.OnClick(func(ctx *application.Context) {
				log.Println("[Tray] Starting core from tray menu")
				if err := tm.coreService.StartCore(); err != nil {
					log.Printf("[Tray] Failed to start core: %v", err)
				}
				tm.UpdateMenu()
			})
		}
	}

	menu.AddSeparator()

	// 4. Lightweight Mode options
	cfg, _ := tm.configService.GetGuiConfig()
	isLightweight := cfg.LightweightMode || cfg.CloseBehavior == "lightweight"
	lightweightItem := menu.AddCheckbox("轻量模式 (关闭窗口释放内存)", isLightweight)
	lightweightItem.OnClick(func(ctx *application.Context) {
		currentCfg, err := tm.configService.GetGuiConfig()
		if err != nil {
			return
		}
		newVal := !(currentCfg.LightweightMode || currentCfg.CloseBehavior == "lightweight")
		currentCfg.LightweightMode = newVal
		if newVal {
			currentCfg.CloseBehavior = "lightweight"
		} else {
			if currentCfg.CloseBehavior == "lightweight" {
				currentCfg.CloseBehavior = "minimize-to-tray"
			}
		}
		_ = tm.configService.SaveGuiConfig(currentCfg)
		tm.UpdateMenu()
	})

	menu.Add("立即进入轻量模式").OnClick(func(ctx *application.Context) {
		log.Println("[Tray] Entering lightweight mode from tray menu")
		currentCfg, err := tm.configService.GetGuiConfig()
		if err == nil {
			currentCfg.LightweightMode = true
			currentCfg.CloseBehavior = "lightweight"
			_ = tm.configService.SaveGuiConfig(currentCfg)
		}
		if tm.windowManager != nil {
			tm.windowManager.DestroyMainWindow()
		}
		tm.UpdateMenu()
	})

	menu.AddSeparator()

	// 5. Quit Application
	menu.Add("退出应用").OnClick(func(ctx *application.Context) {
		log.Println("[Tray] Quitting application from tray menu")
		tm.app.Quit()
	})

	tm.tray.SetMenu(menu)
}

// generateTrayIconPNG produces a crisp 36x36 Retina monochrome template icon for the menu bar.
// On macOS, black pixels in a template icon automatically adapt to dark/light menu bars.
func generateTrayIconPNG() []byte {
	const size = 36
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	black := color.RGBA{0, 0, 0, 255}

	// Draw terminal prompt "> _"
	// Draw chevron '>'
	// Top half of chevron: from (7, 9) to (17, 18)
	drawLine(img, 7, 9, 17, 18, 3, black)
	// Bottom half of chevron: from (17, 18) to (7, 27)
	drawLine(img, 17, 18, 7, 27, 3, black)

	// Draw cursor '_' horizontal rectangle from x=21 to 30, y=24 to 27
	for y := 24; y <= 27; y++ {
		for x := 21; x <= 30; x++ {
			img.Set(x, y, black)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil
	}
	return buf.Bytes()
}

// drawLine draws an anti-aliased or thick line on the image.
func drawLine(img *image.RGBA, x0, y0, x1, y1, thickness int, col color.RGBA) {
	dx := abs(x1 - x0)
	dy := abs(y1 - y0)
	sx, sy := 1, 1
	if x0 >= x1 {
		sx = -1
	}
	if y0 >= y1 {
		sy = -1
	}
	err := dx - dy

	half := thickness / 2

	for {
		for tx := -half; tx <= half; tx++ {
			for ty := -half; ty <= half; ty++ {
				px, py := x0+tx, y0+ty
				if px >= 0 && px < 36 && py >= 0 && py < 36 {
					img.Set(px, py, col)
				}
			}
		}

		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			x0 += sx
		}
		if e2 < dx {
			err += dx
			y0 += sy
		}
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
