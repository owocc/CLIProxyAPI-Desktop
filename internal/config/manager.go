package config

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	toml "github.com/pelletier/go-toml/v2"

	"easycliproxyapi/internal/core"
	"easycliproxyapi/internal/model"
)

// SuppressionTable tracks SHA-256 hashes of files written by GUI to avoid watcher feedback loops.
type SuppressionTable struct {
	mu     sync.Mutex
	hashes map[string]string
}

var globalSuppression = &SuppressionTable{
	hashes: make(map[string]string),
}

// Record registers a write hash for a canonical path.
func (st *SuppressionTable) Record(path string, content []byte) {
	st.mu.Lock()
	defer st.mu.Unlock()

	hash := sha256.Sum256(content)
	cleanPath := filepath.Clean(path)
	st.hashes[cleanPath] = hex.EncodeToString(hash[:])
}

// CheckAndConsume checks if the current file content matches the registered write hash.
// It unconditionally removes the entry if present. Returns true if suppressed.
func (st *SuppressionTable) CheckAndConsume(path string, content []byte) bool {
	st.mu.Lock()
	defer st.mu.Unlock()

	cleanPath := filepath.Clean(path)
	recorded, exists := st.hashes[cleanPath]
	if !exists {
		return false
	}

	delete(st.hashes, cleanPath)
	hash := sha256.Sum256(content)
	return recorded == hex.EncodeToString(hash[:])
}

// ConfigManager handles loading, saving, and synchronizing config.toml and config.yaml.
type ConfigManager struct {
	mu sync.Mutex
}

func NewConfigManager() *ConfigManager {
	return &ConfigManager{}
}

// GenerateManagementSecretKey generates a secure random plaintext management secret key formatted as wui-<token>.
func GenerateManagementSecretKey() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("wui-%d", time.Now().UnixNano())
	}
	return "wui-" + base64.RawURLEncoding.EncodeToString(b)
}

// IsInvalidManagementSecretKey checks if a management secret key is empty, the old default, or a hash pattern.
func IsInvalidManagementSecretKey(k string) bool {
	k = strings.TrimSpace(k)
	if k == "" || k == "123456" {
		return true
	}
	if strings.HasPrefix(k, "$2a$") || strings.HasPrefix(k, "$2b$") || strings.HasPrefix(k, "$argon2") ||
		strings.HasPrefix(k, "bcrypt:") || strings.HasPrefix(k, "sha256:") {
		return true
	}
	return false
}

// DefaultGuiConfig returns the default configuration.
func DefaultGuiConfig() model.GuiConfigFile {
	return model.GuiConfigFile{
		GuiSettings: model.GuiSettings{
			Locale:          "zh-CN",
			Theme:           "system",
			SidebarStyle:    "blur",
			RunOnStartup:    false,
			CloseBehavior:   "minimize-to-tray",
			LightweightMode: false,
			ShowTrayIcon:    true,
			DownloadSource:  "gh-proxy",
		},
		CoreSettings: model.CoreSettings{
			Host:                            "127.0.0.1",
			Port:                            8317,
			AuthDir:                         "../oauth",
			Debug:                           false,
			CommercialMode:                  false,
			LoggingToFile:                   false,
			LogsMaxTotalSizeMB:              0,
			ErrorLogsMaxFiles:               10,
			UsageStatisticsEnabled:          true,
			RedisUsageQueueRetentionSeconds: 60,
			RequestLog:                      false,
			RoutingStrategy:                 "round-robin",
			RequestRetry:                    3,
			AllowLan:                        false,
		},
		ApiKeys: []model.ApiKeyEntry{
			{ApiKey: "123456", Remark: "默认访问密钥"},
		},
		ManagementSecretKey: GenerateManagementSecretKey(),
	}
}

// LoadGuiConfig reads config.toml or creates it with defaults.
func (cm *ConfigManager) LoadGuiConfig() (model.GuiConfigFile, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	tomlPath := core.GuiConfigPath()
	data, err := os.ReadFile(tomlPath)
	if err != nil {
		if os.IsNotExist(err) {
			def := DefaultGuiConfig()
			_ = cm.saveGuiConfigLocked(def)
			_ = cm.syncToYamlLocked(def)
			return def, nil
		}
		return DefaultGuiConfig(), err
	}

	var cfg model.GuiConfigFile
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return DefaultGuiConfig(), fmt.Errorf("解析 config.toml 失败: %w", err)
	}

	if cfg.SidebarStyle == "" {
		cfg.SidebarStyle = "blur"
	}

	// Auto-rotate missing or invalid hashed management secret key
	if IsInvalidManagementSecretKey(cfg.ManagementSecretKey) {
		cfg.ManagementSecretKey = GenerateManagementSecretKey()
		_ = cm.saveGuiConfigLocked(cfg)
		_ = cm.syncToYamlLocked(cfg)
	}

	return cfg, nil
}

// SaveGuiConfig persists config.toml and synchronizes managed settings to config.yaml.
func (cm *ConfigManager) SaveGuiConfig(cfg model.GuiConfigFile) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if err := cm.saveGuiConfigLocked(cfg); err != nil {
		return err
	}

	// Synchronize to config.yaml
	return cm.syncToYamlLocked(cfg)
}

func (cm *ConfigManager) saveGuiConfigLocked(cfg model.GuiConfigFile) error {
	data, err := toml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化 config.toml 失败: %w", err)
	}

	tomlPath := core.GuiConfigPath()
	globalSuppression.Record(tomlPath, data)
	return WriteFileAtomic(tomlPath, data, 0644)
}

func (cm *ConfigManager) syncToYamlLocked(cfg model.GuiConfigFile) error {
	yamlPath := core.ConfigPath()
	var originalYaml []byte

	data, err := os.ReadFile(yamlPath)
	if err == nil {
		originalYaml = data
	} else if os.IsNotExist(err) {
		// Try example template
		exData, errEx := os.ReadFile(core.ExampleConfigPath())
		if errEx == nil {
			originalYaml = exData
		}
	}

	// Extract API key strings
	keyStrings := make([]string, 0, len(cfg.ApiKeys))
	for _, k := range cfg.ApiKeys {
		if k.ApiKey != "" {
			keyStrings = append(keyStrings, k.ApiKey)
		}
	}

	newYaml, err := ApplySettingsToYamlAST(originalYaml, cfg.CoreSettings, keyStrings, cfg.ManagementSecretKey)
	if err != nil {
		return err
	}

	// Only write if changed
	if bytes.Equal(originalYaml, newYaml) {
		return nil
	}

	globalSuppression.Record(yamlPath, newYaml)
	return WriteFileAtomic(yamlPath, newYaml, 0644)
}

// WriteFileAtomic safely writes data to a temp file, fsyncs, then renames.
func WriteFileAtomic(targetPath string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmpFile := filepath.Join(dir, fmt.Sprintf(".%s.tmp.%d", filepath.Base(targetPath), time.Now().UnixNano()))
	f, err := os.OpenFile(tmpFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}

	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpFile)
		return err
	}

	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpFile)
		return err
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpFile)
		return err
	}

	return os.Rename(tmpFile, targetPath)
}
