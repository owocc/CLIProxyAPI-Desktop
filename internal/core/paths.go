package core

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// BaseDir returns the root data/portable directory for EasyCLIProxyAPI.
// On macOS inside an app bundle, it defaults to ~/Library/Application Support/com.cpa.gui.
// In portable/dev mode, it uses the directory of the executable.
func BaseDir() string {
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	exeDir := filepath.Dir(exePath)

	if runtime.GOOS == "darwin" && strings.Contains(exePath, ".app/Contents/MacOS") {
		home, err := os.UserHomeDir()
		if err == nil {
			dir := filepath.Join(home, "Library", "Application Support", "com.cpa.gui")
			_ = os.MkdirAll(dir, 0755)
			return dir
		}
	}

	return exeDir
}

// BinaryName returns the executable filename for the core on current OS.
func BinaryName() string {
	if runtime.GOOS == "windows" {
		return "cli-proxy-api.exe"
	}
	return "cli-proxy-api"
}

// InstallDir returns <base>/cpa-core.
func InstallDir() string {
	return filepath.Join(BaseDir(), "cpa-core")
}

// StagingDir returns <base>/cpa-core.staging.
func StagingDir() string {
	return filepath.Join(BaseDir(), "cpa-core.staging")
}

// DownloadDir returns <base>/cpa-core.download.
func DownloadDir() string {
	return filepath.Join(BaseDir(), "cpa-core.download")
}

// OAuthDir returns <base>/oauth.
func OAuthDir() string {
	return filepath.Join(BaseDir(), "oauth")
}

// LogDir returns <base>/oauth/logs.
func LogDir() string {
	return filepath.Join(OAuthDir(), "logs")
}

// LogPath returns <base>/oauth/logs/core-start-output.log.
func LogPath() string {
	return filepath.Join(LogDir(), "core-start-output.log")
}

// MetaPath returns <base>/cpa-core/cpa-gui-meta.json.
func MetaPath() string {
	return filepath.Join(InstallDir(), "cpa-gui-meta.json")
}

// ConfigPath returns <base>/cpa-core/config.yaml.
func ConfigPath() string {
	return filepath.Join(InstallDir(), "config.yaml")
}

// ExampleConfigPath returns <base>/cpa-core/config.example.yaml.
func ExampleConfigPath() string {
	return filepath.Join(InstallDir(), "config.example.yaml")
}

// GuiConfigPath returns <base>/config.toml.
func GuiConfigPath() string {
	return filepath.Join(BaseDir(), "config.toml")
}

// FindCoreBinary searches for the core binary in the given directory recursively.
func FindCoreBinary(root string) string {
	target := BinaryName()
	var found string

	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || found != "" {
			return nil
		}
		if !info.IsDir() && filepath.Base(path) == target {
			// Check if file is executable on Unix
			if runtime.GOOS != "windows" {
				if info.Mode()&0111 != 0 {
					found = path
					return filepath.SkipAll
				}
				// Attempt to make it executable if it matches
				_ = os.Chmod(path, 0755)
				found = path
				return filepath.SkipAll
			}
			found = path
			return filepath.SkipAll
		}
		return nil
	})

	return found
}
