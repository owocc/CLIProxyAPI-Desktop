//go:build !windows

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

// prepareCommandPlatform configures process group attributes on Unix.
func prepareCommandPlatform(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}

// checkProcessRunning checks if the process is still alive on Unix.
func checkProcessRunning(process *os.Process) bool {
	if process == nil {
		return false
	}
	err := process.Signal(syscall.Signal(0))
	return err == nil
}

// findPidByPort searches for the PID of the process listening on the specified TCP port on Unix.
func findPidByPort(port int) int {
	if port <= 0 {
		return 0
	}
	cmd := exec.Command("lsof", "-t", "-i", fmt.Sprintf(":%d", port), "-sTCP:LISTEN")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) > 0 {
		if pid, err := strconv.Atoi(strings.TrimSpace(lines[0])); err == nil && pid > 0 {
			return pid
		}
	}
	return 0
}

// killPid terminates a process by PID on Unix.
func killPid(pid int) error {
	if pid <= 0 {
		return nil
	}
	p, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	_ = p.Signal(syscall.SIGTERM)
	time.Sleep(300 * time.Millisecond)
	if isProcessAlive(pid) {
		_ = p.Signal(syscall.SIGKILL)
	}
	return nil
}

// killProcessGroup sends SIGTERM then SIGKILL to the entire process group.
func killProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}

	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err == nil {
		_ = syscall.Kill(-pgid, syscall.SIGTERM)
	} else {
		_ = cmd.Process.Signal(syscall.SIGTERM)
	}

	// Wait up to 3 seconds for graceful exit
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-done:
		return nil
	case <-time.After(3 * time.Second):
		if err == nil {
			_ = syscall.Kill(-pgid, syscall.SIGKILL)
		} else {
			_ = cmd.Process.Kill()
		}
		<-done
		return nil
	}
}
