package usage

import (
	"testing"
)

func TestParseUsageJSON(t *testing.T) {
	sample := []byte(`{
		"id": "chatcmpl-12345",
		"timestamp": 1726750000,
		"model": "claude-3-7-sonnet-20250219",
		"provider": "anthropic",
		"prompt_tokens": 120,
		"completion_tokens": 80,
		"total_tokens": 200,
		"duration_ms": 650,
		"status_code": 200,
		"cost": 0.0018
	}`)

	r, ok := parseUsageJSON(sample)
	if !ok {
		t.Fatalf("expected parseUsageJSON to succeed")
	}

	if r.Id != "chatcmpl-12345" {
		t.Errorf("expected id chatcmpl-12345, got %s", r.Id)
	}
	if r.PromptTokens != 120 {
		t.Errorf("expected 120 prompt tokens, got %d", r.PromptTokens)
	}
	if r.CompletionTokens != 80 {
		t.Errorf("expected 80 completion tokens, got %d", r.CompletionTokens)
	}
	if r.TotalTokens != 200 {
		t.Errorf("expected 200 total tokens, got %d", r.TotalTokens)
	}
}
