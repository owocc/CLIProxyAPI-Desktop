package service

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

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
	// Perform immediate detection in background and broadcast status to tray and frontend
	go func() {
		status := cs.GetStatus()
		cs.emitEvent("core-status-changed", status)
	}()
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

// CheckHealth performs an active end-to-end HTTP health probe against the proxy core.
func (cs *CoreService) CheckHealth() model.CoreHealthCheck {
	port := cs.GetCorePort()
	status := cs.pm.GetStatus(port)
	now := time.Now().Format("15:04:05")

	if !status.Running || !status.Ready {
		msg := "代理内核未运行"
		if !status.Installed {
			msg = "代理内核尚未安装"
		} else if status.Starting {
			msg = "代理内核正在启动中..."
		}
		return model.CoreHealthCheck{
			Healthy:   false,
			Status:    "offline",
			Port:      port,
			ProcessId: status.ProcessId,
			Message:   msg,
			CheckedAt: now,
		}
	}

	client := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			Proxy: nil, // bypass proxy
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}

	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	start := time.Now()
	resp, err := client.Get(url)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return model.CoreHealthCheck{
			Healthy:    false,
			Status:     "unresponsive",
			LatencyMs:  latency,
			Port:       port,
			ProcessId:  status.ProcessId,
			Message:    fmt.Sprintf("端口已开放但服务未响应: %v", err),
			CheckedAt:  now,
		}
	}
	defer resp.Body.Close()

	return model.CoreHealthCheck{
		Healthy:    true,
		Status:     "healthy",
		StatusCode: resp.StatusCode,
		LatencyMs:  latency,
		Port:       port,
		ProcessId:  status.ProcessId,
		Message:    fmt.Sprintf("服务响应正常，延迟 %dms", latency),
		CheckedAt:  now,
	}
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
