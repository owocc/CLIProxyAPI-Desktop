package usage

import (
	_ "embed"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode"

	"easycliproxyapi/internal/model"
)

//go:embed resources/model_prices.json
var embeddedPricesJSON []byte

const (
	LongContextInputTokenThreshold = 272000
	TokensPerPriceUnit             = 1000000.0
)

type CostTokens struct {
	Input             uint64
	Output            uint64
	CacheRead         uint64
	CacheCreation     uint64
	LongInput         uint64
	LongOutput        uint64
	LongCacheRead     uint64
	LongCacheCreation uint64
}

type rawPriceCatalog struct {
	SchemaVersion int                            `json:"schemaVersion"`
	UpdatedAt     string                         `json:"updatedAt"`
	Models        map[string]rawModelPriceValues `json:"models"`
}

type rawModelPriceValues struct {
	InputPer1M         float64  `json:"inputPer1M"`
	OutputPer1M        float64  `json:"outputPer1M"`
	CacheReadPer1M     *float64 `json:"cacheReadPer1M"`
	CacheCreationPer1M *float64 `json:"cacheCreationPer1M"`
}

var (
	bundledPricesOnce sync.Once
	bundledPricesMap  map[string]model.ModelPrice
)

func BundledModelPrices() map[string]model.ModelPrice {
	bundledPricesOnce.Do(func() {
		bundledPricesMap = make(map[string]model.ModelPrice)
		var catalog rawPriceCatalog
		if err := json.Unmarshal(embeddedPricesJSON, &catalog); err != nil {
			return
		}

		for modelName, raw := range catalog.Models {
			cacheRead := 0.0
			hasCacheRead := false
			if raw.CacheReadPer1M != nil {
				cacheRead = *raw.CacheReadPer1M
				hasCacheRead = true
			}
			cacheCreation := 0.0
			hasCacheCreation := false
			if raw.CacheCreationPer1M != nil {
				cacheCreation = *raw.CacheCreationPer1M
				hasCacheCreation = true
			}

			bundledPricesMap[modelName] = model.ModelPrice{
				Model:                   modelName,
				Prompt:                  raw.InputPer1M,
				Completion:              raw.OutputPer1M,
				Cache:                   cacheRead,
				CacheRead:               cacheRead,
				CacheCreation:           cacheCreation,
				PromptConfigured:        true,
				CompletionConfigured:    true,
				CacheReadConfigured:     hasCacheRead,
				CacheCreationConfigured: hasCacheCreation,
				Source:                  "builtin",
				SourceModelId:           modelName,
				UpdatedAtMs:             0,
			}
		}
	})

	// Return a copy
	res := make(map[string]model.ModelPrice, len(bundledPricesMap))
	for k, v := range bundledPricesMap {
		res[k] = v
	}
	return res
}

func OfficialModelPrice(modelName string) (model.ModelPrice, bool) {
	builtin := BundledModelPrices()
	p, ok := FindModelPrice(builtin, modelName)
	return p, ok
}

func FindModelPrice(prices map[string]model.ModelPrice, modelName string) (model.ModelPrice, bool) {
	if p, ok := prices[modelName]; ok {
		return p, true
	}

	// Case-insensitive exact match
	var caseMatches []model.ModelPrice
	for k, p := range prices {
		if strings.EqualFold(k, modelName) {
			caseMatches = append(caseMatches, p)
		}
	}
	if len(caseMatches) == 1 {
		return caseMatches[0], true
	}

	// Canonical model tail match
	targetCanonical := CanonicalModelTail(modelName)
	if targetCanonical != "" {
		var canonicalMatches []model.ModelPrice
		for k, p := range prices {
			if CanonicalModelTail(k) == targetCanonical {
				canonicalMatches = append(canonicalMatches, p)
			}
		}
		if len(canonicalMatches) == 1 {
			return canonicalMatches[0], true
		}
	}

	// Longest prefix match: normalizedTail.startsWith(keyTail + "-")
	targetNormalized := NormalizedModelTail(modelName)
	var bestPrice model.ModelPrice
	bestLen := -1
	for k, p := range prices {
		keyTail := NormalizedModelTail(k)
		prefix := keyTail + "-"
		if strings.HasPrefix(targetNormalized, prefix) {
			if len(keyTail) > bestLen {
				bestLen = len(keyTail)
				bestPrice = p
			}
		}
	}
	if bestLen >= 0 {
		return bestPrice, true
	}

	return model.ModelPrice{}, false
}

func ResolveModelPrice(modelName, alias string, prices map[string]model.ModelPrice) (string, model.ModelPrice, bool) {
	candidates := []string{modelName, alias}
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if p, ok := FindModelPrice(prices, c); ok {
			return modelName, p, true
		}
	}
	return "", model.ModelPrice{}, false
}

func EnrichedModelPrice(modelName string, price model.ModelPrice) model.ModelPrice {
	if official, ok := OfficialModelPrice(modelName); ok {
		if !price.PromptConfigured && price.Prompt <= 0.0 {
			price.Prompt = official.Prompt
		}
		if !price.CompletionConfigured && price.Completion <= 0.0 {
			price.Completion = official.Completion
		}
	}

	if !price.CacheReadConfigured && price.CacheRead <= 0.0 {
		if price.Cache > 0.0 {
			price.CacheRead = price.Cache
		} else {
			price.CacheRead = price.Prompt * 0.1
		}
	}

	if !price.CacheCreationConfigured && price.CacheCreation <= 0.0 {
		multiplier := 1.0
		if IsModelFamily(modelName, "gpt-5.6") {
			multiplier = 1.25
		}
		price.CacheCreation = price.Prompt * multiplier
	}

	return price
}

func IsModelFamily(modelName, family string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	idx := strings.LastIndex(normalized, "/")
	if idx >= 0 {
		normalized = normalized[idx+1:]
	}
	return normalized == family || strings.HasPrefix(normalized, family+"-")
}

func ServiceTierMultiplier(modelName string) float64 {
	if IsModelFamily(modelName, "gpt-5.5") {
		return 2.5
	} else if IsModelFamily(modelName, "gpt-5.6") ||
		IsModelFamily(modelName, "gpt-5.4") ||
		IsModelFamily(modelName, "gpt-5.4-mini") ||
		IsModelFamily(modelName, "gpt-5.3-codex") {
		return 2.0
	}
	return 1.0
}

func CostForPrice(modelName, serviceTier string, tokens CostTokens, price model.ModelPrice) float64 {
	enriched := EnrichedModelPrice(modelName, price)

	shortInput := saturatingSub(tokens.Input, tokens.LongInput)
	shortOutput := saturatingSub(tokens.Output, tokens.LongOutput)
	shortCacheRead := saturatingSub(tokens.CacheRead, tokens.LongCacheRead)
	shortCacheCreation := saturatingSub(tokens.CacheCreation, tokens.LongCacheCreation)

	shortCost := costForTokenSegment(
		shortInput, shortOutput, shortCacheRead, shortCacheCreation,
		enriched, 1.0, 1.0,
	)

	longCost := costForTokenSegment(
		tokens.LongInput, tokens.LongOutput, tokens.LongCacheRead, tokens.LongCacheCreation,
		enriched, 2.0, 1.5,
	)

	tier := strings.ToLower(strings.TrimSpace(serviceTier))
	var multiplier float64
	if tokens.LongInput > 0 && (tier == "priority" || tier == "fast") {
		multiplier = 1.0
	} else {
		switch tier {
		case "flex", "batch":
			multiplier = 0.5
		case "priority", "fast":
			multiplier = ServiceTierMultiplier(modelName)
		default:
			multiplier = 1.0
		}
	}

	return (shortCost + longCost) * multiplier
}

func costForTokenSegment(
	input, output, cacheRead, cacheCreation uint64,
	price model.ModelPrice,
	inputMultiplier, outputMultiplier float64,
) float64 {
	cachedTotal := saturatingAdd(cacheRead, cacheCreation)
	prompt := saturatingSub(input, cachedTotal)

	tokensCost := ((float64(prompt)*price.Prompt +
		float64(cacheRead)*price.CacheRead +
		float64(cacheCreation)*price.CacheCreation) * inputMultiplier) +
		(float64(output) * price.Completion * outputMultiplier)

	return tokensCost / TokensPerPriceUnit
}

func NormalizedModelTail(value string) string {
	parts := strings.Split(strings.TrimSpace(value), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		p := strings.TrimSpace(parts[i])
		if p != "" && !strings.EqualFold(p, "models") {
			return strings.ToLower(p)
		}
	}
	return strings.ToLower(strings.TrimSpace(value))
}

func CanonicalModelTail(value string) string {
	tail := NormalizedModelTail(value)
	var sb strings.Builder
	for _, r := range tail {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func saturatingSub(a, b uint64) uint64 {
	if a < b {
		return 0
	}
	return a - b
}

func saturatingAdd(a, b uint64) uint64 {
	res := a + b
	if res < a {
		return ^uint64(0)
	}
	return res
}

// FetchRemotePrices attempts to fetch latest prices from GitHub or falls back to builtin.
func FetchRemotePrices(proxyURL string) (map[string]model.ModelPrice, bool, error) {
	targetURL := "https://raw.githubusercontent.com/router-cpa/cli-proxy-api/main/resources/model_prices.json"

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
	}
	if proxyURL != "" {
		if parsed, err := url.Parse(proxyURL); err == nil {
			transport.Proxy = http.ProxyURL(parsed)
		}
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   20 * time.Second,
	}

	resp, err := client.Get(targetURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_ = resp.Body.Close()
		}
		// Fallback to builtin
		return BundledModelPrices(), true, nil
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return BundledModelPrices(), true, nil
	}

	var catalog rawPriceCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		return BundledModelPrices(), true, nil
	}

	result := make(map[string]model.ModelPrice)
	now := time.Now().UnixMilli()
	for modelName, raw := range catalog.Models {
		cacheRead := 0.0
		hasCacheRead := false
		if raw.CacheReadPer1M != nil {
			cacheRead = *raw.CacheReadPer1M
			hasCacheRead = true
		}
		cacheCreation := 0.0
		hasCacheCreation := false
		if raw.CacheCreationPer1M != nil {
			cacheCreation = *raw.CacheCreationPer1M
			hasCacheCreation = true
		}

		result[modelName] = model.ModelPrice{
			Model:                   modelName,
			Prompt:                  raw.InputPer1M,
			Completion:              raw.OutputPer1M,
			Cache:                   cacheRead,
			CacheRead:               cacheRead,
			CacheCreation:           cacheCreation,
			PromptConfigured:        true,
			CompletionConfigured:    true,
			CacheReadConfigured:     hasCacheRead,
			CacheCreationConfigured: hasCacheCreation,
			Source:                  "github",
			SourceModelId:           modelName,
			UpdatedAtMs:             now,
		}
	}

	return result, false, nil
}
