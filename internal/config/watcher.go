package config

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"easycliproxyapi/internal/core"
)

// FileWatcher watches configuration files and ancestor directories.
type FileWatcher struct {
	watcher    *fsnotify.Watcher
	mu         sync.Mutex
	watchedDirs map[string]bool
	trackedFiles map[string]bool
	onChange   func(changedFiles []string)
	stopChan   chan struct{}
}

func NewFileWatcher(onChange func([]string)) (*FileWatcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	fw := &FileWatcher{
		watcher:      w,
		watchedDirs:  make(map[string]bool),
		trackedFiles: make(map[string]bool),
		onChange:     onChange,
		stopChan:     make(chan struct{}),
	}

	// Track default files
	fw.TrackFile(core.GuiConfigPath())
	fw.TrackFile(core.ConfigPath())

	return fw, nil
}

// TrackFile registers a file to be tracked. It watches its closest existing ancestor directory.
func (fw *FileWatcher) TrackFile(path string) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	cleanPath := filepath.Clean(path)
	fw.trackedFiles[cleanPath] = true

	// Find nearest existing ancestor directory
	ancestor := filepath.Dir(cleanPath)
	for ancestor != "/" && ancestor != "." {
		if info, err := os.Stat(ancestor); err == nil && info.IsDir() {
			if !fw.watchedDirs[ancestor] {
				if err := fw.watcher.Add(ancestor); err == nil {
					fw.watchedDirs[ancestor] = true
				}
			}
			break
		}
		ancestor = filepath.Dir(ancestor)
	}
}

// Start begins the watcher loop with debouncing.
func (fw *FileWatcher) Start(ctx context.Context) {
	go fw.loop(ctx)
}

func (fw *FileWatcher) Stop() {
	close(fw.stopChan)
	_ = fw.watcher.Close()
}

func (fw *FileWatcher) loop(ctx context.Context) {
	var (
		timer       *time.Timer
		timerCh     <-chan time.Time
		pendingMu   sync.Mutex
		pendingList = make(map[string]bool)
	)

	resetTimer := func() {
		if timer == nil {
			timer = time.NewTimer(1500 * time.Millisecond)
			timerCh = timer.C
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-fw.stopChan:
			return
		case err, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
			_ = err
		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}

			// Ignore pure chmod/access events
			if event.Op&fsnotify.Chmod == fsnotify.Chmod {
				continue
			}

			cleanEventPath := filepath.Clean(event.Name)

			// Check if event targets one of our tracked files
			fw.mu.Lock()
			matched := false
			for tracked := range fw.trackedFiles {
				if cleanEventPath == tracked || filepath.Base(cleanEventPath) == filepath.Base(tracked) {
					matched = true
					break
				}
			}
			fw.mu.Unlock()

			if !matched {
				continue
			}

			// Read file content for suppression check
			content, err := os.ReadFile(cleanEventPath)
			if err == nil && globalSuppression.CheckAndConsume(cleanEventPath, content) {
				// Suppressed (written by GUI)
				continue
			}

			pendingMu.Lock()
			pendingList[cleanEventPath] = true
			resetTimer()
			pendingMu.Unlock()

		case <-timerCh:
			pendingMu.Lock()
			changed := make([]string, 0, len(pendingList))
			for f := range pendingList {
				changed = append(changed, f)
			}
			pendingList = make(map[string]bool)
			timer = nil
			timerCh = nil
			pendingMu.Unlock()

			if len(changed) > 0 && fw.onChange != nil {
				fw.onChange(changed)
			}
		}
	}
}
