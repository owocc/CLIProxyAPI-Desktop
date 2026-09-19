package core

import (
	"testing"
)

func TestProcessManagerStatus(t *testing.T) {
	pm := NewProcessManager(nil)
	status := pm.GetStatus(8317)

	if status.Running {
		t.Errorf("expected not running initially")
	}

	t.Logf("Initial status: installed=%v, running=%v, ready=%v, msg=%s",
		status.Installed, status.Running, status.Ready, status.Message)
}
