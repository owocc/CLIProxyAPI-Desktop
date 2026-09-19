package usage

import (
	"path/filepath"
	"testing"
	"time"

	"easycliproxyapi/internal/model"
)

func TestStorageIdempotencyAndSummary(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test-usage.db")

	s, err := NewStorage(dbPath)
	if err != nil {
		t.Fatalf("NewStorage error: %v", err)
	}
	defer s.Close()

	records := []model.UsageRecord{
		{
			Id:               "req-1",
			Timestamp:        time.Now().Unix(),
			Model:            "claude-3-7-sonnet-20250219",
			Provider:         "anthropic",
			PromptTokens:     100,
			CompletionTokens: 50,
			TotalTokens:      150,
			Cost:             0.0015,
		},
		{
			Id:               "req-2",
			Timestamp:        time.Now().Unix(),
			Model:            "gpt-4o",
			Provider:         "openai",
			PromptTokens:     200,
			CompletionTokens: 100,
			TotalTokens:      300,
			Cost:             0.0030,
		},
	}

	// First insert: should insert 2
	n, err := s.InsertBatch(records)
	if err != nil {
		t.Fatalf("InsertBatch error: %v", err)
	}
	if n != 2 {
		t.Errorf("expected 2 inserted, got %d", n)
	}

	// Duplicate insert: should insert 0 (inbox idempotency)
	n2, err := s.InsertBatch(records)
	if err != nil {
		t.Fatalf("InsertBatch second error: %v", err)
	}
	if n2 != 0 {
		t.Errorf("expected 0 inserted on duplicate, got %d", n2)
	}

	summary, err := s.GetSummary()
	if err != nil {
		t.Fatalf("GetSummary error: %v", err)
	}

	if summary.TotalRequests != 2 {
		t.Errorf("expected 2 total requests, got %d", summary.TotalRequests)
	}
	if summary.TotalTokens != 450 {
		t.Errorf("expected 450 total tokens, got %d", summary.TotalTokens)
	}
	if summary.TotalCost < 0.0044 {
		t.Errorf("expected total cost ~0.0045, got %f", summary.TotalCost)
	}

	recent, err := s.GetRecentRecords(10, 0)
	if err != nil {
		t.Fatalf("GetRecentRecords error: %v", err)
	}
	if len(recent) != 2 {
		t.Errorf("expected 2 recent records, got %d", len(recent))
	}
}
