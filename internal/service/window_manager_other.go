//go:build !darwin

package service

import "github.com/wailsapp/wails/v3/pkg/application"

func applyNativeWindowBackdrop(win *application.WebviewWindow, theme string) {
	// No-op on non-darwin platforms
}
