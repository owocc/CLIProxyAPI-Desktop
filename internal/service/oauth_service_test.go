package service

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
)

func TestNormalizeManagementOAuthProvider(t *testing.T) {
	cases := []struct {
		input    string
		expected string
		err      bool
	}{
		{"claude", "anthropic", false},
		{"anthropic", "anthropic", false},
		{"anti-gravity", "antigravity", false},
		{"antigravity", "antigravity", false},
		{"cognition", "devin", false},
		{"devin", "devin", false},
		{"grok", "xai", false},
		{"x-ai", "xai", false},
		{"x.ai", "xai", false},
		{"xai", "xai", false},
		{"codex", "codex", false},
		{"kimi", "kimi", false},
		{"invalid/provider", "", true},
		{"", "", true},
	}

	for _, c := range cases {
		out, err := normalizeManagementOAuthProvider(c.input)
		if c.err && err == nil {
			t.Errorf("expected error for %q, got nil", c.input)
		}
		if !c.err && err != nil {
			t.Errorf("unexpected error for %q: %v", c.input, err)
		}
		if !c.err && out != c.expected {
			t.Errorf("for %q expected %q, got %q", c.input, c.expected, out)
		}
	}
}

func TestManagementOAuthUsesWebuiCallback(t *testing.T) {
	if !managementOAuthUsesWebuiCallback("codex") {
		t.Errorf("codex should use webui callback")
	}
	if !managementOAuthUsesWebuiCallback("anthropic") {
		t.Errorf("anthropic should use webui callback")
	}
	if !managementOAuthUsesWebuiCallback("antigravity") {
		t.Errorf("antigravity should use webui callback")
	}
	if !managementOAuthUsesWebuiCallback("xai") {
		t.Errorf("xai should use webui callback")
	}
	if !managementOAuthUsesWebuiCallback("devin") {
		t.Errorf("devin should use webui callback")
	}
	if managementOAuthUsesWebuiCallback("kimi") {
		t.Errorf("kimi must NOT use webui callback")
	}
}

func TestManagementAuthorizationValidation(t *testing.T) {
	cm := config.NewConfigManager()
	s := NewOAuthService(cm)

	// Invalid secret key
	cfg := model.GuiConfigFile{
		ManagementSecretKey: "123456",
	}
	if _, err := s.managementAuthorization(cfg); err == nil {
		t.Errorf("expected error for default 123456 secret key")
	}

	cfg.ManagementSecretKey = "$2a$10$hashedstringhere"
	if _, err := s.managementAuthorization(cfg); err == nil {
		t.Errorf("expected error for hashed secret key")
	}

	cfg.ManagementSecretKey = "wui-valid-random-secret"
	auth, err := s.managementAuthorization(cfg)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if auth != "Bearer wui-valid-random-secret" {
		t.Errorf("expected 'Bearer wui-valid-random-secret', got %q", auth)
	}
}

func TestManagementEndpoint(t *testing.T) {
	cm := config.NewConfigManager()
	s := NewOAuthService(cm)

	cfg := model.GuiConfigFile{
		CoreSettings: model.CoreSettings{
			Host: "127.0.0.1",
			Port: 8317,
		},
	}

	endpoint, err := s.managementEndpoint(cfg, "auth-files")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "http://127.0.0.1:8317/v0/management/auth-files"
	if endpoint != expected {
		t.Errorf("expected %q, got %q", expected, endpoint)
	}

	// 0.0.0.0 normalization
	cfg.Host = "0.0.0.0"
	endpoint, _ = s.managementEndpoint(cfg, "/auth-files")
	if endpoint != expected {
		t.Errorf("expected normalized 127.0.0.1, got %q", endpoint)
	}
}

func TestOAuthServiceBindingMethodIDs(t *testing.T) {
	_ = application.New(application.Options{})
	cm := config.NewConfigManager()
	s := NewOAuthService(cm)
	bindings := application.NewBindings(nil, nil)
	err := bindings.Add(application.NewService(s))
	if err != nil {
		t.Fatalf("bindings.Add failed: %v", err)
	}

	// Check ListOAuthBrowsers ID 3069074235
	m := bindings.GetByID(3069074235)
	if m == nil {
		t.Errorf("expected bound method for 3069074235 (ListOAuthBrowsers), got nil")
	} else if m.Name != "ListOAuthBrowsers" {
		t.Errorf("expected ListOAuthBrowsers, got %s", m.Name)
	}

	// Check ManagementRequest ID 3912550125
	m = bindings.GetByID(3912550125)
	if m == nil {
		t.Errorf("expected bound method for 3912550125 (ManagementRequest), got nil")
	} else if m.Name != "ManagementRequest" {
		t.Errorf("expected ManagementRequest, got %s", m.Name)
	}

	// Check StartOAuthLogin ID 1800110201
	m = bindings.GetByID(1800110201)
	if m == nil {
		t.Errorf("expected bound method for 1800110201 (StartOAuthLogin), got nil")
	} else if m.Name != "StartOAuthLogin" {
		t.Errorf("expected StartOAuthLogin, got %s", m.Name)
	}
}

