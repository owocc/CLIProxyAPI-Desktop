package core

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"easycliproxyapi/internal/model"
)

// ProcessManager manages the lifecycle of the proxy core child process.
type ProcessManager struct {
	mu           sync.Mutex
	childCmd     *exec.Cmd
	starting     bool
	shuttingDown bool
	onStatusChg  func(model.CoreStatus)
}

func NewProcessManager(onStatusChg func(model.CoreStatus)) *ProcessManager {
	return &ProcessManager{
		onStatusChg: onStatusChg,
	}
}

// ReadMeta reads cpa-gui-meta.json if present.
func ReadMeta() *model.CoreMeta {
	data, err := os.ReadFile(MetaPath())
	if err != nil {
		return nil
	}
	var meta model.CoreMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil
	}
	return &meta
}

// WriteMeta writes cpa-gui-meta.json.
func WriteMeta(meta model.CoreMeta) error {
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(MetaPath(), data, 0644)
}

// IsManagementPortOpen checks if the management port accepts TCP connections.
// It tries 3 times with 150ms timeout and 50ms interval to prevent jitter.
func IsManagementPortOpen(port int) bool {
	if port <= 0 {
		return false
	}
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	for i := 0; i < 3; i++ {
		conn, err := net.DialTimeout("tcp", addr, 150*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

// GetStatus computes the current CoreStatus according to the two orthogonal axes.
func (pm *ProcessManager) GetStatus(port int) model.CoreStatus {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	return pm.getStatusLocked(port)
}

func (pm *ProcessManager) getStatusLocked(port int) model.CoreStatus {
	installDir := InstallDir()
	binPath := FindCoreBinary(installDir)
	installed := binPath != ""

	var currentVer *string
	if meta := ReadMeta(); meta != nil && meta.Version != "" {
		v := meta.Version
		currentVer = &v
	}

	var processId *int
	running := false
	managed := false

	if pm.childCmd != nil && pm.childCmd.Process != nil {
		pid := pm.childCmd.Process.Pid
		// Check if process still exists
		if isProcessAlive(pid) {
			running = true
			managed = true
			processId = &pid
		} else {
			pm.childCmd = nil
		}
	}

	// Ready is strictly running && port is open
	ready := false
	if running && port > 0 {
		ready = IsManagementPortOpen(port)
	}

	var binPtr *string
	if binPath != "" {
		binPtr = &binPath
	}

	var message string
	if pm.starting {
		message = "CPA 内核正在启动"
	} else if !installed {
		message = "未安装 CPA 内核，请先安装最新版"
	} else if running {
		if ready {
			message = "CPA 内核正在运行"
		} else {
			message = "CPA 内核已启动，正在等待服务就绪"
		}
	} else {
		message = "CPA 内核已安装，当前未运行"
	}

	return model.CoreStatus{
		Installed:      installed,
		Running:        running,
		Ready:          ready,
		Starting:       pm.starting,
		Managed:        managed,
		ProcessId:      processId,
		CurrentVersion: currentVer,
		InstallDir:     installDir,
		BinaryPath:     binPtr,
		Message:        message,
	}
}

// Start launches the core process with the specified port.
func (pm *ProcessManager) Start(port int) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if pm.shuttingDown {
		return fmt.Errorf("应用正在退出，已取消内核启动")
	}

	status := pm.getStatusLocked(port)
	if status.Running {
		return fmt.Errorf("CPA 内核已经在运行")
	}
	if !status.Installed || status.BinaryPath == nil {
		return fmt.Errorf("未安装 CPA 内核，请先安装最新版")
	}

	// Port precheck
	if port > 0 && IsManagementPortOpen(port) {
		return fmt.Errorf("端口 %d 已被其他程序占用，请更换端口后重试", port)
	}

	// Ensure auth/logs dir exists
	logDir := LogDir()
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("创建日志目录失败: %w", err)
	}

	logPath := LogPath()
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("打开启动日志失败: %w", err)
	}

	header := fmt.Sprintf("===== CPA 内核启动 %d =====\n", time.Now().Unix())
	_, _ = logFile.WriteString(header)

	// Prepare config path
	configPath := ConfigPath()
	// If config.yaml does not exist, check if config.example.yaml exists to copy it
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		examplePath := ExampleConfigPath()
		if _, errEx := os.Stat(examplePath); errEx == nil {
			data, _ := os.ReadFile(examplePath)
			_ = os.WriteFile(configPath, data, 0644)
		}
	}

	cmd := exec.Command(*status.BinaryPath, "-config", configPath)
	cmd.Dir = InstallDir()
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	// Remove proxy environment variables so the core only uses config.yaml
	cmd.Env = cleanProxyEnv(os.Environ())

	prepareCommandPlatform(cmd)

	pm.starting = true
	pm.notifyStatus(port)

	if err := cmd.Start(); err != nil {
		pm.starting = false
		_ = logFile.Close()
		pm.notifyStatus(port)
		return fmt.Errorf("启动 CPA 内核失败: %w；启动日志: %s", err, logPath)
	}

	pm.childCmd = cmd

	// Wait for port to become ready in background or with timeout
	go func() {
		// Asynchronous watcher for premature process exit
		exitChan := make(chan error, 1)
		go func() {
			exitChan <- cmd.Wait()
		}()

		deadline := time.Now().Add(10 * time.Second)
		ready := false
		for time.Now().Before(deadline) {
			select {
			case err := <-exitChan:
				pm.mu.Lock()
				pm.starting = false
				pm.childCmd = nil
				pm.mu.Unlock()
				pm.notifyStatus(port)
				_ = logFile.Close()
				fmt.Printf("Core process exited prematurely: %v\n", err)
				return
			default:
			}

			if port <= 0 || IsManagementPortOpen(port) {
				ready = true
				break
			}
			time.Sleep(100 * time.Millisecond)
		}

		pm.mu.Lock()
		pm.starting = false
		pm.mu.Unlock()
		pm.notifyStatus(port)

		if !ready && port > 0 {
			fmt.Printf("Core started but port %d not ready within 10s\n", port)
		}
	}()

	return nil
}

// Stop gracefully stops the core process.
func (pm *ProcessManager) Stop(port int) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if pm.childCmd == nil || pm.childCmd.Process == nil {
		return nil
	}

	err := killProcessGroup(pm.childCmd)
	pm.childCmd = nil
	pm.starting = false
	pm.notifyStatus(port)
	return err
}

// Restart stops and restarts the core process.
func (pm *ProcessManager) Restart(port int) error {
	_ = pm.Stop(port)
	// Give the OS 300ms to release the port socket
	time.Sleep(300 * time.Millisecond)
	return pm.Start(port)
}

// SetShuttingDown marks the manager as exiting so it cleans up child processes.
func (pm *ProcessManager) SetShuttingDown(port int) {
	pm.mu.Lock()
	pm.shuttingDown = true
	pm.mu.Unlock()
	_ = pm.Stop(port)
}

func (pm *ProcessManager) notifyStatus(port int) {
	if pm.onStatusChg != nil {
		status := pm.getStatusLocked(port)
		pm.onStatusChg(status)
	}
}

func cleanProxyEnv(envs []string) []string {
	filtered := make([]string, 0, len(envs))
	for _, env := range envs {
		upper := strings.ToUpper(env)
		if strings.HasPrefix(upper, "HTTP_PROXY=") ||
			strings.HasPrefix(upper, "HTTPS_PROXY=") ||
			strings.HasPrefix(upper, "ALL_PROXY=") {
			continue
		}
		filtered = append(filtered, env)
	}
	return filtered
}

func isProcessAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return checkProcessRunning(process)
}
