package usage

import (
	"testing"
)

func TestClaudeNormalization(t *testing.T) {
	// Claude folds cacheRead and cacheCreation into inputTokens
	res := NormalizeTokens("ClaudeExecutor", "anthropic", "oauth", TokenValues{
		Input:            100,
		Output:           20,
		Cached:           10,
		CacheRead:        10,
		CacheReadPresent: true,
		CacheCreation:    5,
		Total:            120,
	})

	// Input should become 100 + 10 + 5 = 115
	if res.Input != 115 {
		t.Errorf("expected Input 115, got %d", res.Input)
	}
	// Total should become 115 + 20 = 135
	if res.Total != 135 {
		t.Errorf("expected Total 135, got %d", res.Total)
	}
	// Cached should equal CacheRead
	if res.Cached != 10 {
		t.Errorf("expected Cached 10, got %d", res.Cached)
	}
}

func TestGeminiNormalization(t *testing.T) {
	// Gemini folds reasoning into output
	res := NormalizeTokens("GeminiExecutor", "google", "oauth", TokenValues{
		Input:     100,
		Output:    50,
		Reasoning: 30,
		Total:     180,
	})

	// Output should become 50 + 30 = 80
	if res.Output != 80 {
		t.Errorf("expected Output 80, got %d", res.Output)
	}
	if res.Total != 180 {
		t.Errorf("expected Total 180, got %d", res.Total)
	}
}
