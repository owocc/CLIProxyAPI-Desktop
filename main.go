package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/service"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	coreService := service.NewCoreService()
	configService := service.NewConfigService()
	agentService := service.NewAgentService(configService.Manager())

	app := application.New(application.Options{
		Name:        "EasyCLIProxyAPI",
		Description: "EasyCLIProxyAPI",
		Services: []application.Service{
			application.NewService(coreService),
			application.NewService(configService),
			application.NewService(agentService),
			application.NewService(&GreetService{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	coreService.SetApp(app)
	configService.SetApp(app)
	agentService.SetApp(app)

	// Clean up child processes and watchers on app exit
	app.OnShutdown(func() {
		coreService.Teardown()
		configService.Teardown()
	})

	// Create main window
	app.Window.NewWithOptions(application.WebviewWindowOptions{
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

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
