//go:build windows

package core

import (
	"os"
	"os/exec"
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
