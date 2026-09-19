package usage

import (
	"testing"
)

func TestParseUsageJSON(t *testing.T) {
	sample := `{
		"id": "chatcmpl-12345",
		"timestamp": "2026-09-19T15:04:05Z",
		"model": "claude-3-7-sonnet-20250219",
		"provider": "anthropic",
		"prompt_tokens": 120,
		"completion_tokens": 80,
		"total_tokens": 200,
		"duration_ms": 650,
		"status_code": 200
	}`

	r, ok, err := parseAndNormalizeUsageRecord(sample, "test_source")
	if !ok || err != nil {
		t.Fatalf("expected parseAndNormalizeUsageRecord to succeed, err: %v", err)
	}

	if r.Id != "chatcmpl-12345" {
		t.Errorf("expected id chatcmpl-12345, got %s", r.Id)
	}
	if r.InputTokens != 120 {
		t.Errorf("expected 120 prompt tokens, got %d", r.InputTokens)
	}
	if r.OutputTokens != 80 {
		t.Errorf("expected 80 completion tokens, got %d", r.OutputTokens)
	}
	if r.TotalTokens != 200 {
		t.Errorf("expected 200 total tokens, got %d", r.TotalTokens)
	}
	if r.CollectorSource != "test_source" {
		t.Errorf("expected collector_source test_source, got %s", r.CollectorSource)
	}
}

func TestIsIgnorableUsageMessage(t *testing.T) {
	if !IsIgnorableUsageMessage("") {
		t.Errorf("expected empty string to be ignorable")
	}
	if !IsIgnorableUsageMessage("null") {
		t.Errorf("expected null to be ignorable")
	}
	if !IsIgnorableUsageMessage(`{"refresh": true}`) {
		t.Errorf("expected refresh true to be ignorable")
	}
	if !IsIgnorableUsageMessage(`{"support_refresh": true}`) {
		t.Errorf("expected support_refresh true to be ignorable")
	}
	if IsIgnorableUsageMessage(`{"refresh": false}`) {
		t.Errorf("expected refresh false NOT to be ignorable")
	}
	if IsIgnorableUsageMessage(`{"request_id": "req-123"}`) {
		t.Errorf("expected message with request_id NOT to be ignorable")
	}
}
