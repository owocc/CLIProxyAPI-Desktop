package agents

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplyClaudeCode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")

	initial := `{"env": {"EXISTING_VAR": "keep-me"}}`
	_ = os.WriteFile(path, []byte(initial), 0644)

	err := applyClaudeCode(path, "http://127.0.0.1:8317", "sk-test", "claude-3-7-sonnet-20250219")
	if err != nil {
		t.Fatalf("applyClaudeCode error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file error: %v", err)
	}

	str := string(data)
	if !strings.Contains(str, "http://127.0.0.1:8317") {
		t.Errorf("expected base url in settings.json")
	}
	if !strings.Contains(str, "sk-test") {
		t.Errorf("expected auth token in settings.json")
	}
	if !strings.Contains(str, "claude-3-7-sonnet-20250219") {
		t.Errorf("expected model in settings.json")
	}
	if !strings.Contains(str, "EXISTING_VAR") {
		t.Errorf("expected user's existing variables to be preserved")
	}
}

func TestApplyCodex(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")

	initial := "user_setting = true\n"
	_ = os.WriteFile(path, []byte(initial), 0644)

	err := applyCodex(path, "http://127.0.0.1:8317/v1", "sk-test", "gpt-4o")
	if err != nil {
		t.Fatalf("applyCodex error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file error: %v", err)
	}

	str := string(data)
	if !strings.Contains(str, `model_provider = 'cpa-gui'`) && !strings.Contains(str, `model_provider = "cpa-gui"`) {
		t.Errorf("expected model_provider cpa-gui in toml")
	}
	if !strings.Contains(str, "user_setting") {
		t.Errorf("expected user setting preserved")
	}
}

func TestDiscoverAgent(t *testing.T) {
	claudeInfo := DiscoverAgent("claude-code")
	t.Logf("claude-code: installed=%v, version=%q, path=%q", claudeInfo.Installed, claudeInfo.Version, claudeInfo.ExecutablePath)

	codexInfo := DiscoverAgent("codex")
	t.Logf("codex: installed=%v, version=%q, path=%q", codexInfo.Installed, codexInfo.Version, codexInfo.ExecutablePath)

	opencodeInfo := DiscoverAgent("opencode")
	t.Logf("opencode: installed=%v, version=%q, path=%q", opencodeInfo.Installed, opencodeInfo.Version, opencodeInfo.ExecutablePath)
}
