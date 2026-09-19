package service

import (
	"os"
	"strconv"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"gopkg.in/yaml.v3"

	"easycliproxyapi/internal/core"
	"easycliproxyapi/internal/model"
)

const DefaultPort = 8317

type CoreService struct {
	app       *application.App
	pm        *core.ProcessManager
	installer *core.Installer
}

func NewCoreService() *CoreService {
	cs := &CoreService{}

	cs.pm = core.NewProcessManager(func(status model.CoreStatus) {
		cs.emitEvent("core-status-changed", status)
	})

	cs.installer = core.NewInstaller(func(task model.CoreInstallTask) {
		cs.emitEvent("core-install-progress", task)
		// If install finishes, refresh status
		if !task.Running && task.Error == nil {
			cs.emitEvent("core-status-changed", cs.GetStatus())
		}
	})

	return cs
}

func (cs *CoreService) SetApp(app *application.App) {
	cs.app = app
}

func (cs *CoreService) emitEvent(name string, data any) {
	app := cs.app
	if app == nil {
		app = application.Get()
	}
	if app != nil && app.Event != nil {
		app.Event.Emit(name, data)
	}
}

// GetCorePort reads the port from config.yaml or returns default 8317.
func (cs *CoreService) GetCorePort() int {
	data, err := os.ReadFile(core.ConfigPath())
	if err != nil {
		return DefaultPort
	}

	var parsed struct {
		Port any `yaml:"port"`
	}
	if err := yaml.Unmarshal(data, &parsed); err == nil && parsed.Port != nil {
		switch v := parsed.Port.(type) {
		case int:
			if v > 0 {
				return v
			}
		case string:
			if p, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && p > 0 {
				return p
			}
		}
	}

	return DefaultPort
}

// GetStatus returns the current status of the core.
func (cs *CoreService) GetStatus() model.CoreStatus {
	port := cs.GetCorePort()
	return cs.pm.GetStatus(port)
}

// StartCore starts the core process.
func (cs *CoreService) StartCore() error {
	port := cs.GetCorePort()
	return cs.pm.Start(port)
}

// StopCore stops the core process.
func (cs *CoreService) StopCore() error {
	port := cs.GetCorePort()
	return cs.pm.Stop(port)
}

// RestartCore restarts the core process.
func (cs *CoreService) RestartCore() error {
	port := cs.GetCorePort()
	return cs.pm.Restart(port)
}

// CheckLatestCore checks the latest release from the specified source.
func (cs *CoreService) CheckLatestCore(source string) (*model.ReleaseInfo, error) {
	return core.CheckLatestRelease(source)
}

// InstallCoreVersion downloads and installs the specified core version.
func (cs *CoreService) InstallCoreVersion(version string, source string) error {
	// If core is currently running, pause it during installation
	port := cs.GetCorePort()
	status := cs.pm.GetStatus(port)
	wasRunning := status.Running

	if wasRunning {
		_ = cs.pm.Stop(port)
	}

	err := cs.installer.InstallVersion(version, source)

	// Restore running state if it was running
	if wasRunning {
		_ = cs.pm.Start(port)
	}

	cs.emitEvent("core-status-changed", cs.pm.GetStatus(port))
	return err
}

// CancelCoreInstall cancels an active installation task.
func (cs *CoreService) CancelCoreInstall() error {
	return cs.installer.Cancel()
}

// GetCoreInstallTask returns the active or last install task.
func (cs *CoreService) GetCoreInstallTask() model.CoreInstallTask {
	return cs.installer.GetTask()
}

// Teardown cleans up child processes on app exit.
func (cs *CoreService) Teardown() {
	port := cs.GetCorePort()
	cs.pm.SetShuttingDown(port)
}
