package core

import (
	"runtime"
	"testing"
)

func TestPlatformAssetSpec(t *testing.T) {
	name, kind, err := PlatformAssetSpec("7.3.7")
	if err != nil {
		t.Fatalf("PlatformAssetSpec failed: %v", err)
	}

	if runtime.GOOS == "darwin" {
		if kind != "tar.gz" {
			t.Errorf("expected tar.gz, got %s", kind)
		}
		if runtime.GOARCH == "arm64" {
			expected := "CLIProxyAPI_7.3.7_darwin_aarch64.tar.gz"
			if name != expected {
				t.Errorf("expected %s, got %s", expected, name)
			}
		}
	}

	t.Logf("Computed asset name for %s/%s: %s (%s)", runtime.GOOS, runtime.GOARCH, name, kind)
}
