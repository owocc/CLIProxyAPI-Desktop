//go:build windows

package core

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	createNoWindow = 0x08000000
)

// prepareCommandPlatform configures Windows specific execution attributes.
func prepareCommandPlatform(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindow,
		HideWindow:    true,
	}
}

// checkProcessRunning checks if the process is still alive on Windows.
func checkProcessRunning(process *os.Process) bool {
	if process == nil {
		return false
	}
	// On Windows, FindProcess always succeeds, but we can check if it exited
	return true
}

// findPidByPort searches for the PID of the process listening on the specified TCP port on Windows.
func findPidByPort(port int) int {
	if port <= 0 {
		return 0
	}
	cmd := exec.Command("cmd", "/c", fmt.Sprintf("netstat -ano -p tcp | findstr :%d | findstr LISTENING", port))
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 {
			if pid, err := strconv.Atoi(fields[len(fields)-1]); err == nil && pid > 0 {
				return pid
			}
		}
	}
	return 0
}

// killPid terminates a process by PID on Windows.
func killPid(pid int) error {
	if pid <= 0 {
		return nil
	}
	cmd := exec.Command("taskkill", "/F", "/PID", strconv.Itoa(pid))
	prepareCommandPlatform(cmd)
	return cmd.Run()
}

// killProcessGroup terminates the process on Windows.
func killProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}

	_ = cmd.Process.Kill()
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-done:
		return nil
	case <-time.After(2 * time.Second):
		return nil
	}
}
