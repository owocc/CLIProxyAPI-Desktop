package usage

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"easycliproxyapi/internal/model"
)

func TestStorageLifecycleAndQueries(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test-usage.db")

	storage, err := NewStorage(dbPath)
	if err != nil {
		t.Fatalf("NewStorage failed: %v", err)
	}
	defer storage.Close()

	// 1. Enqueue raw JSON messages into inbox
	nowStr := time.Now().Format(time.RFC3339)
	sample1 := fmt.Sprintf(`{
		"request_id": "req-001",
		"timestamp": "%s",
		"model": "gpt-5.6-terra",
		"provider": "openai",
		"source": "cursor",
		"input_tokens": 1000,
		"output_tokens": 500,
		"latency_ms": 1200,
		"status_code": 200
	}`, nowStr)

	// Claude message with cache tokens
	sample2 := fmt.Sprintf(`{
		"request_id": "req-002",
		"timestamp": "%s",
		"model": "claude-3-7-sonnet",
		"provider": "anthropic",
		"executor_type": "ClaudeExecutor",
		"source": "claude-code",
		"input_tokens": 500,
		"cache_read_tokens": 200,
		"cache_creation_tokens": 100,
		"output_tokens": 300,
		"latency_ms": 1500,
		"status_code": 200
	}`, nowStr)

	// Failed message
	sample3 := fmt.Sprintf(`{
		"request_id": "req-003",
		"timestamp": "%s",
		"model": "gpt-4o",
		"provider": "openai",
		"source": "web",
		"input_tokens": 100,
		"output_tokens": 0,
		"latency_ms": 400,
		"status_code": 500,
		"failure_body": "Internal server error"
	}`, nowStr)

	// Ignorable control message
	sampleIgnorable := `{"refresh": true}`

	n, err := storage.EnqueueRawMessages("redis_subscribe:usage", []string{sample1, sample2, sample3, sampleIgnorable})
	if err != nil {
		t.Fatalf("EnqueueRawMessages failed: %v", err)
	}
	if n != 3 {
		t.Errorf("expected 3 valid messages enqueued, got %d", n)
	}

	// 2. Process inbox
	inserted, deleted, err := storage.ProcessInbox(100)
	if err != nil {
		t.Fatalf("ProcessInbox failed: %v", err)
	}
	if inserted != 3 {
		t.Errorf("expected 3 inserted into usage_events, got %d", inserted)
	}
	if deleted != 0 {
		t.Errorf("expected 0 deleted, got %d", deleted)
	}

	totalRecs, err := storage.TotalRecords()
	if err != nil {
		t.Fatalf("TotalRecords failed: %v", err)
	}
	if totalRecs != 3 {
		t.Errorf("expected TotalRecords 3, got %d", totalRecs)
	}

	// 3. LoadOverview
	overview, err := storage.LoadOverview(model.UsageQuery{})
	if err != nil {
		t.Fatalf("LoadOverview failed: %v", err)
	}
	if overview.TotalRequests != 3 {
		t.Errorf("expected TotalRequests 3, got %d", overview.TotalRequests)
	}
	if overview.SuccessCount != 2 {
		t.Errorf("expected SuccessCount 2, got %d", overview.SuccessCount)
	}
	if overview.FailureCount != 1 {
		t.Errorf("expected FailureCount 1, got %d", overview.FailureCount)
	}
	// req-002: Claude normalizer folds cache (500 + 200 + 100 = 800 input tokens)
	// req-001: 1000 input tokens
	// req-003: 100 input tokens
	// Total input tokens: 1000 + 800 + 100 = 1900
	if overview.InputTokens != 1900 {
		t.Errorf("expected InputTokens 1900, got %d", overview.InputTokens)
	}
	if len(overview.Timeline) == 0 {
		t.Errorf("expected non-empty timeline points")
	}

	// 4. LoadAnalysis
	analysis, err := storage.LoadAnalysis(model.UsageQuery{})
	if err != nil {
		t.Fatalf("LoadAnalysis failed: %v", err)
	}
	if len(analysis.Models) == 0 || len(analysis.Providers) == 0 || len(analysis.Sources) == 0 {
		t.Errorf("expected categories populated in analysis")
	}

	// 5. LoadEvents
	page, err := storage.LoadEvents(model.UsageQuery{})
	if err != nil {
		t.Fatalf("LoadEvents failed: %v", err)
	}
	if page.Total != 3 {
		t.Errorf("expected page.Total 3, got %d", page.Total)
	}
	if len(page.Items) != 3 {
		t.Errorf("expected 3 items on page, got %d", len(page.Items))
	}

	// Filter by failed=true
	isFailed := true
	failedPage, err := storage.LoadEvents(model.UsageQuery{Failed: &isFailed})
	if err != nil {
		t.Fatalf("LoadEvents failed: %v", err)
	}
	if failedPage.Total != 1 {
		t.Errorf("expected 1 failed item, got %d", failedPage.Total)
	}

	// 6. Pricing
	pricing, err := storage.LoadPricing(model.UsageQuery{})
	if err != nil {
		t.Fatalf("LoadPricing failed: %v", err)
	}
	if pricing.TotalRequests != 3 {
		t.Errorf("expected 3 total requests in pricing, got %d", pricing.TotalRequests)
	}
	if pricing.PricedRequests < 1 {
		t.Errorf("expected at least 1 priced request, got %d", pricing.PricedRequests)
	}

	// Custom model price test
	customPrice := model.ModelPrice{
		Model:         "my-custom-model",
		Prompt:        1.5,
		Completion:    6.0,
		CacheRead:     0.15,
		CacheCreation: 1.5,
	}
	if err := storage.SaveModelPrice(customPrice); err != nil {
		t.Fatalf("SaveModelPrice failed: %v", err)
	}
	if err := storage.DeleteModelPrice("my-custom-model"); err != nil {
		t.Fatalf("DeleteModelPrice failed: %v", err)
	}

	// 7. StorageSettings and Shrink
	settings, err := storage.GetStorageSettings()
	if err != nil {
		t.Fatalf("GetStorageSettings failed: %v", err)
	}
	if settings.TotalRecords != 3 {
		t.Errorf("expected 3 total records in settings, got %d", settings.TotalRecords)
	}

	// 8. RepairCacheRecords
	repairRes, err := storage.RepairCacheRecords()
	if err != nil {
		t.Fatalf("RepairCacheRecords failed: %v", err)
	}
	if repairRes.Scanned != 0 {
		// Nothing to repair since new records are already normalized
		t.Logf("Repair scanned: %d", repairRes.Scanned)
	}
}
