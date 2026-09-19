package agents

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	toml "github.com/pelletier/go-toml/v2"
)

func TestCodexNativeOAuthLifecycle(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "codex-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	configPath := filepath.Join(tempDir, "config.toml")
	authPath := filepath.Join(tempDir, "auth.json")
	recordPath := filepath.Join(tempDir, "cpa-native-oauth.json")

	// 1. Initial State: No auth file -> CheckCodexOAuthLogin should be false
	loggedIn, err := CheckCodexOAuthLogin(tempDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if loggedIn {
		t.Errorf("expected loggedIn to be false for non-existent auth.json")
	}

	// 2. Create valid auth.json with tokens
	authData := map[string]any{
		"tokens": map[string]any{
			"access_token":  "test-access-token",
			"refresh_token": "test-refresh-token",
		},
	}
	authBytes, _ := json.Marshal(authData)
	if err := os.WriteFile(authPath, authBytes, 0600); err != nil {
		t.Fatal(err)
	}

	loggedIn, err = CheckCodexOAuthLogin(tempDir)
	if err != nil || !loggedIn {
		t.Errorf("expected loggedIn to be true with valid tokens, got %v (err: %v)", loggedIn, err)
	}

	// 3. Create initial CPA config.toml
	cpaConfig := map[string]any{
		"model_provider":      "cpa-gui",
		"model":               "gpt-4o",
		"model_catalog_json":  "/path/to/catalog.json",
		"approval_policy":     "never", // non-routing key that must survive!
		"custom_user_setting": "preserved",
	}
	cfgBytes, _ := toml.Marshal(cpaConfig)
	if err := os.WriteFile(configPath, cfgBytes, 0644); err != nil {
		t.Fatal(err)
	}

	// 4. Test RestoreCodexOfficialConfig
	if err := RestoreCodexOfficialConfig(tempDir); err != nil {
		t.Fatalf("RestoreCodexOfficialConfig failed: %v", err)
	}

	// Check record file permissions: must be 0600
	recFi, err := os.Stat(recordPath)
	if err != nil {
		t.Fatalf("expected record file to exist: %v", err)
	}
	perm := recFi.Mode().Perm()
	if perm != 0600 {
		t.Errorf("expected cpa-native-oauth.json to have 0600 permissions, got %04o", perm)
	}

	// Read record content
	recBytes, _ := os.ReadFile(recordPath)
	var rec NativeOAuthRecord
	if err := json.Unmarshal(recBytes, &rec); err != nil {
		t.Fatalf("failed to unmarshal record: %v", err)
	}
	if rec.Version != 1 {
		t.Errorf("expected version 1, got %d", rec.Version)
	}
	if !rec.Enabled {
		t.Errorf("expected enabled to be true")
	}

	// Check config.toml modified correctly
	newCfgBytes, _ := os.ReadFile(configPath)
	var updatedCfg map[string]any
	_ = toml.Unmarshal(newCfgBytes, &updatedCfg)

	if updatedCfg["model_provider"] != "openai" {
		t.Errorf("expected model_provider to be 'openai', got %v", updatedCfg["model_provider"])
	}
	if updatedCfg["forced_login_method"] != "chatgpt" {
		t.Errorf("expected forced_login_method to be 'chatgpt', got %v", updatedCfg["forced_login_method"])
	}
	if _, exists := updatedCfg["model_catalog_json"]; exists {
		t.Errorf("model_catalog_json should be deleted")
	}
	if updatedCfg["approval_policy"] != "never" {
		t.Errorf("user-custom approval_policy must be preserved, got %v", updatedCfg["approval_policy"])
	}

	// 5. Test GetCodexNativeStatus
	status, err := GetCodexNativeStatus(tempDir)
	if err != nil {
		t.Fatalf("GetCodexNativeStatus error: %v", err)
	}
	if !status.OfficialAuthExists {
		t.Errorf("expected OfficialAuthExists = true")
	}
	if !status.Enabled {
		t.Errorf("expected Enabled = true")
	}
	if status.HasCpaConfig {
		t.Errorf("expected HasCpaConfig = false")
	}

	// 6. Test CloseCodexConfigModification
	if err := CloseCodexConfigModification(tempDir); err != nil {
		t.Fatalf("CloseCodexConfigModification failed: %v", err)
	}
}
