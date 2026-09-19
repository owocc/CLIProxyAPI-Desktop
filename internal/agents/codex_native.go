package agents

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	toml "github.com/pelletier/go-toml/v2"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
)

// RoutingKeys defines the whitelist of routing keys affected by CPA/Native switching.
var RoutingKeys = []string{
	"model_provider",
	"model",
	"model_catalog_json",
	"openai_base_url",
	"chatgpt_base_url",
	"forced_login_method",
	"profile",
}

// NativeOAuthRecord matches the cpa-native-oauth.json specification.
type NativeOAuthRecord struct {
	Version            uint32  `json:"version"` // Must be 1
	Enabled            bool    `json:"enabled"` // true if in native mode
	CpaSettings        string  `json:"cpa_settings"` // CPA config fragment
	CpaAuth            *string `json:"cpa_auth,omitempty"`
	NativeAuth         *string `json:"native_auth,omitempty"`
	NativeModel        *string `json:"native_model,omitempty"`
	OriginalSettings   *string `json:"original_settings,omitempty"`
	OriginalAuth       *string `json:"original_auth,omitempty"`
	RestoreFullRouting bool    `json:"restore_full_routing"`
}

func CodexHome() string {
	h := os.Getenv("CODEX_HOME")
	if h != "" {
		return h
	}
	return filepath.Join(UserHomeDir(), ".codex")
}

func CodexConfigPath(codexHome string) string {
	if codexHome == "" {
		codexHome = CodexHome()
	}
	return filepath.Join(codexHome, "config.toml")
}

func CodexAuthPath(codexHome string) string {
	if codexHome == "" {
		codexHome = CodexHome()
	}
	return filepath.Join(codexHome, "auth.json")
}

func CodexNativeRecordPath(codexHome string) string {
	if codexHome == "" {
		codexHome = CodexHome()
	}
	return filepath.Join(codexHome, "cpa-native-oauth.json")
}

// CheckCodexOAuthLogin checks if ~/.codex/auth.json contains a valid OAuth login.
func CheckCodexOAuthLogin(codexHome string) (bool, error) {
	authPath := CodexAuthPath(codexHome)
	data, err := os.ReadFile(authPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}

	if len(strings.TrimSpace(string(data))) == 0 {
		return false, nil
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		return false, nil
	}

	// Check tokens existence
	tokens, ok := parsed["tokens"].(map[string]any)
	if ok && tokens != nil {
		if acc, _ := tokens["access_token"].(string); acc != "" {
			return true, nil
		}
		if ref, _ := tokens["refresh_token"].(string); ref != "" {
			return true, nil
		}
	}

	if authMode, _ := parsed["auth_mode"].(string); authMode == "chatgpt" {
		return true, nil
	}

	return false, nil
}

// GetCodexNativeStatus returns the current status of Codex configuration and login.
func GetCodexNativeStatus(codexHome string) (model.CodexNativeStatus, error) {
	status := model.CodexNativeStatus{}

	authExists, _ := CheckCodexOAuthLogin(codexHome)
	status.OfficialAuthExists = authExists

	cfgPath := CodexConfigPath(codexHome)
	cfgData, err := os.ReadFile(cfgPath)
	var cfgMap map[string]any
	if err == nil {
		_ = toml.Unmarshal(cfgData, &cfgMap)
	}

	provider, _ := cfgMap["model_provider"].(string)
	status.HasCpaConfig = (provider == "cpa-gui")

	// Read record
	recPath := CodexNativeRecordPath(codexHome)
	if recData, errRec := os.ReadFile(recPath); errRec == nil {
		var rec NativeOAuthRecord
		if errU := json.Unmarshal(recData, &rec); errU == nil {
			// Per 10-oauth §9.7: dual check: state.enabled && provider != "cpa-gui"
			status.Enabled = rec.Enabled && provider != "cpa-gui"
		}
	}

	// Extract email if possible
	authPath := CodexAuthPath(codexHome)
	if authData, errAuth := os.ReadFile(authPath); errAuth == nil {
		var authMap map[string]any
		if errU := json.Unmarshal(authData, &authMap); errU == nil {
			if tokens, ok := authMap["tokens"].(map[string]any); ok && tokens != nil {
				if idToken, ok := tokens["id_token"].(string); ok && idToken != "" {
					if email := extractEmailFromJwt(idToken); email != "" {
						status.AccountEmail = &email
					}
				}
			}
		}
	}

	return status, nil
}

// RestoreCodexOfficialConfig switches Codex to native OpenAI mode.
func RestoreCodexOfficialConfig(codexHome string) error {
	cfgPath := CodexConfigPath(codexHome)
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return fmt.Errorf("读取 Codex 配置文件失败: %w", err)
	}

	var cfg map[string]any = make(map[string]any)
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("解析 Codex 配置失败: %w", err)
	}

	// Extract CPA settings snapshot for routing keys
	cpaSnapshot := make(map[string]any)
	for _, k := range RoutingKeys {
		if val, exists := cfg[k]; exists {
			cpaSnapshot[k] = val
		}
	}
	cpaBytes, _ := json.Marshal(cpaSnapshot)

	// Auth snapshot
	var cpaAuthPtr *string
	authPath := CodexAuthPath(codexHome)
	if authBytes, errA := os.ReadFile(authPath); errA == nil && len(authBytes) > 0 {
		s := string(authBytes)
		cpaAuthPtr = &s
	}

	// Load existing record or create new
	record := NativeOAuthRecord{
		Version:     1,
		Enabled:     true,
		CpaSettings: string(cpaBytes),
		CpaAuth:     cpaAuthPtr,
	}

	recPath := CodexNativeRecordPath(codexHome)
	if existingData, errE := os.ReadFile(recPath); errE == nil {
		var existing NativeOAuthRecord
		if errU := json.Unmarshal(existingData, &existing); errU == nil && existing.Version == 1 {
			record.OriginalSettings = existing.OriginalSettings
			record.OriginalAuth = existing.OriginalAuth
			record.NativeAuth = existing.NativeAuth
			record.NativeModel = existing.NativeModel
		}
	}

	recBytes, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化原生状态失败: %w", err)
	}

	// Write Order rule (Crash-Safe): [recovery record (0600), credentials, routing]
	if err := writePrivateFile(recPath, recBytes); err != nil {
		return fmt.Errorf("写入原生状态记录失败: %w", err)
	}

	// Now modify config.toml
	cfg["model_provider"] = "openai"
	cfg["forced_login_method"] = "chatgpt"
	delete(cfg, "model_catalog_json")

	newConfigBytes, err := toml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	return config.WriteFileAtomic(cfgPath, newConfigBytes, 0644)
}

// CloseCodexConfigModification cleanly removes CPA configuration from Codex config.toml.
func CloseCodexConfigModification(codexHome string) error {
	cfgPath := CodexConfigPath(codexHome)
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return nil
	}

	var cfg map[string]any = make(map[string]any)
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("解析 Codex 配置失败: %w", err)
	}

	provider, _ := cfg["model_provider"].(string)
	if provider != "cpa-gui" {
		return nil // already unchanged
	}

	// Clean CPA provider entry
	if providers, ok := cfg["model_providers"].(map[string]any); ok {
		delete(providers, "cpa-gui")
		if len(providers) == 0 {
			delete(cfg, "model_providers")
		}
	}

	cfg["model_provider"] = "openai"
	delete(cfg, "model_catalog_json")

	// Update record
	recPath := CodexNativeRecordPath(codexHome)
	if recData, errR := os.ReadFile(recPath); errR == nil {
		var rec NativeOAuthRecord
		if errU := json.Unmarshal(recData, &rec); errU == nil {
			rec.Enabled = false
			updatedBytes, _ := json.MarshalIndent(rec, "", "  ")
			_ = writePrivateFile(recPath, updatedBytes)
		}
	}

	newConfigBytes, err := toml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	return config.WriteFileAtomic(cfgPath, newConfigBytes, 0644)
}

func writePrivateFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	_ = f.Close()
	return os.Chmod(path, 0600)
}

func extractEmailFromJwt(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ""
	}
	payloadSegment := parts[1]
	// Pad base64
	switch len(payloadSegment) % 4 {
	case 2:
		payloadSegment += "=="
	case 3:
		payloadSegment += "="
	}

	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		decoded, err = base64.URLEncoding.DecodeString(payloadSegment)
		if err != nil {
			return ""
		}
	}

	var claims map[string]any
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return ""
	}

	if email, ok := claims["email"].(string); ok {
		return email
	}
	return ""
}
