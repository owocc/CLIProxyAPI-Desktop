package usage

import (
	"math"
	"testing"
)

func TestPricingGoldenCases(t *testing.T) {
	prices := BundledModelPrices()
	p, ok := FindModelPrice(prices, "gpt-5.6-terra")
	if !ok {
		t.Fatalf("expected gpt-5.6-terra to exist in bundled prices")
	}

	// Case 1: Short context 1M input, 1M output, 200k cache_read, 100k cache_creation
	tokens1 := CostTokens{
		Input:         1_000_000,
		Output:        1_000_000,
		CacheRead:     200_000,
		CacheCreation: 100_000,
	}
	cost1 := CostForPrice("gpt-5.6-terra", "default", tokens1, p)
	if math.Abs(cost1-13.69) > 0.001 {
		t.Errorf("expected cost 13.69, got %f", cost1)
	}

	// Case 2: Long context (input > 272k)
	// input: 300k, output: 200k, cache_read: 100k, all in long context bucket
	tokens2 := CostTokens{
		Input:             300_000,
		Output:            200_000,
		CacheRead:         100_000,
		LongInput:         300_000,
		LongOutput:        200_000,
		LongCacheRead:     100_000,
		LongCacheCreation: 0,
	}
	cost2 := CostForPrice("gpt-5.6-terra", "priority", tokens2, p)
	if math.Abs(cost2-4.44) > 0.001 {
		t.Errorf("expected cost 4.44, got %f", cost2)
	}
}

func TestPricingPrefixMatching(t *testing.T) {
	prices := BundledModelPrices()
	// "gpt-5.6-terra-high" should match "gpt-5.6-terra"
	p, ok := FindModelPrice(prices, "gpt-5.6-terra-high")
	if !ok {
		t.Fatalf("expected gpt-5.6-terra-high to match")
	}
	if p.Model != "gpt-5.6-terra" {
		t.Errorf("expected matched model gpt-5.6-terra, got %s", p.Model)
	}
}
