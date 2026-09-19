package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/service"
	"easycliproxyapi/internal/tray"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	coreService := service.NewCoreService()
	configService := service.NewConfigService()
	agentService := service.NewAgentService(configService.Manager())
	usageService, err := service.NewUsageService(configService.Manager())
	if err != nil {
		log.Printf("Failed to initialize usage storage: %v", err)
	}

	desktopService := service.NewDesktopService(nil, configService)

	appServices := []application.Service{
		application.NewService(coreService),
		application.NewService(configService),
		application.NewService(agentService),
		application.NewService(desktopService),
		application.NewService(&GreetService{}),
	}
	if usageService != nil {
		appServices = append(appServices, application.NewService(usageService))
	}

	app := application.New(application.Options{
		Name:        "EasyCLIProxyAPI",
		Description: "EasyCLIProxyAPI",
		Services:    appServices,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	coreService.SetApp(app)
	configService.SetApp(app)
	agentService.SetApp(app)
	desktopService.SetApp(app)
	if usageService != nil {
		usageService.SetApp(app)
	}

	windowManager := service.NewWindowManager(app, configService)
	desktopService.SetWindowManager(windowManager)

	// Clean up child processes, collectors, and watchers on app exit
	app.OnShutdown(func() {
		coreService.Teardown()
		configService.Teardown()
		if usageService != nil {
			usageService.Teardown()
		}
	})

	// Create initial main window
	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
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
	windowManager.SetInitialWindow(win)

	// Setup system tray / menu bar
	trayManager := tray.NewTrayManager(app, coreService, configService, windowManager)
	if err := trayManager.Setup(); err != nil {
		log.Printf("Failed to setup system tray: %v", err)
	}

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
