package core

import (
	"net"
	"strconv"
	"testing"
)

func TestProcessManagerStatus(t *testing.T) {
	pm := NewProcessManager(nil)
	status := pm.GetStatus(0)

	if status.Running {
		t.Errorf("expected not running initially")
	}

	t.Logf("Initial status: installed=%v, running=%v, ready=%v, msg=%s",
		status.Installed, status.Running, status.Ready, status.Message)
}

func TestProcessManagerDetectExistingService(t *testing.T) {
	// Start a mock TCP listener on an ephemeral port
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen on ephemeral port: %v", err)
	}
	defer ln.Close()

	_, portStr, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatalf("failed to parse host port: %v", err)
	}
	port, _ := strconv.Atoi(portStr)

	pm := NewProcessManager(nil)
	status := pm.GetStatus(port)

	if !status.Running {
		t.Errorf("expected running to be true when port is open, got false")
	}
	if !status.Ready {
		t.Errorf("expected ready to be true when port is open, got false")
	}
	if status.Managed {
		t.Errorf("expected managed to be false for external process, got true")
	}
	t.Logf("Detected existing service: running=%v, ready=%v, managed=%v, msg=%s",
		status.Running, status.Ready, status.Managed, status.Message)
}
