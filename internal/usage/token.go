package usage

import (
	"strings"
)

// ClampedTokenFields tracks whether any token field was originally negative and clamped.
type ClampedTokenFields struct {
	Input         bool
	Output        bool
	Reasoning     bool
	Cached        bool
	CacheRead     bool
	CacheCreation bool
	Total         bool
}

func (c ClampedTokenFields) BlocksParentContract() bool {
	return c.Input || c.Output || c.Reasoning || c.CacheRead || c.CacheCreation
}

func (c ClampedTokenFields) BlocksZeroTotal() bool {
	return c.Input || c.Output || c.Total
}

func (c ClampedTokenFields) BlocksReasoningEvidence() bool {
	return c.BlocksZeroTotal() || c.Reasoning
}

func (c ClampedTokenFields) Any() bool {
	return c.BlocksParentContract() || c.Cached || c.Total
}

// TokenValues holds token counts before and after normalization.
type TokenValues struct {
	Input            uint64
	Output           uint64
	Reasoning        uint64
	Cached           uint64
	CacheRead        uint64
	CacheReadPresent bool
	CacheCreation    uint64
	Total            uint64
	Clamped          ClampedTokenFields
}

type tokenHandler int

const (
	handlerClaude tokenHandler = iota
	handlerGemini
	handlerResponsesInclusive
	handlerStrict
	handlerOpenAiCompatibility
)

// NormalizeTokens normalizes token counts according to provider and executor rules.
func NormalizeTokens(executorType, provider, authType string, tokens TokenValues) TokenValues {
	handler, parserContract := resolveHandler(executorType, provider, authType)
	rawTokens := tokens

	if handler != handlerClaude &&
		!tokens.Clamped.Cached &&
		!tokens.Clamped.CacheRead &&
		tokens.CacheRead == 0 &&
		tokens.Cached > 0 &&
		(!tokens.CacheReadPresent || !parserContract) {
		tokens.CacheRead = tokens.Cached
	}

	switch handler {
	case handlerClaude:
		return normalizeClaude(tokens, parserContract)
	case handlerGemini:
		return normalizeGemini(tokens, parserContract)
	case handlerResponsesInclusive:
		return normalizeResponses(tokens, parserContract, executorType, rawTokens)
	case handlerOpenAiCompatibility:
		return normalizeOpenAICompatibility(tokens)
	default:
		return reconcileZeroTotal(tokens)
	}
}

func resolveHandler(executorType, provider, authType string) (tokenHandler, bool) {
	executor := strings.ToLower(strings.TrimSpace(executorType))
	switch executor {
	case "claudeexecutor":
		return handlerClaude, true
	case "geminiexecutor", "geminivertexexecutor", "geminicliexecutor", "aistudioexecutor", "antigravityexecutor":
		return handlerGemini, true
	case "codexexecutor", "codexwebsocketsexecutor", "codexautoexecutor", "xaiexecutor", "xaiwebsocketsexecutor", "xaiautoexecutor":
		return handlerResponsesInclusive, true
	case "kimiexecutor":
		return handlerStrict, true
	case "openaicompatexecutor":
		return handlerOpenAiCompatibility, true
	}

	if !strings.EqualFold(strings.TrimSpace(authType), "oauth") {
		return handlerStrict, false
	}

	identity := strings.ToLower(strings.TrimSpace(provider))
	switch identity {
	case "claude", "anthropic":
		return handlerClaude, false
	case "gemini", "vertex", "gemini-cli", "gemini-cli-code-assist", "gemini-interactions", "aistudio", "ai-studio", "antigravity":
		return handlerGemini, false
	case "codex", "xai":
		return handlerResponsesInclusive, false
	case "kimi", "moonshot":
		return handlerStrict, false
	case "openai", "openai-compatible", "openai_compatibility", "openai-compatibility":
		return handlerOpenAiCompatibility, false
	}
	if strings.HasPrefix(identity, "openai-compatible-") {
		return handlerOpenAiCompatibility, false
	}

	return handlerStrict, false
}

func normalizeClaude(tokens TokenValues, parserContract bool) TokenValues {
	tokens.Cached = tokens.CacheRead
	if tokens.Clamped.Input || tokens.Clamped.CacheRead || tokens.Clamped.CacheCreation {
		return reconcileZeroTotal(tokens)
	}

	rawInput := tokens.Input
	rawTotal := tokens.Total

	canonicalInput, ok := checkedSum(tokens.Input, tokens.CacheRead, tokens.CacheCreation)
	if !ok {
		return tokens
	}
	tokens.Input = canonicalInput

	cacheTotal, hasCacheTotal := checkedSum(tokens.CacheRead, tokens.CacheCreation)
	rawExpected, hasRawExpected := checkedSum(rawInput, tokens.Output)
	canonicalExpected, hasCanonicalExpected := checkedSum(tokens.Input, tokens.Output)

	legacyMissingCache := !tokens.Clamped.BlocksZeroTotal() &&
		hasCacheTotal && cacheTotal > 0 &&
		hasRawExpected && rawExpected == rawTotal &&
		hasCanonicalExpected && canonicalExpected != rawTotal

	if parserContract || legacyMissingCache {
		return reconcileCanonicalTotal(tokens)
	}
	return reconcileZeroTotal(tokens)
}

func normalizeGemini(tokens TokenValues, parserContract bool) TokenValues {
	shouldFold := false
	if tokens.Clamped.Output || tokens.Clamped.Reasoning {
		shouldFold = false
	} else if parserContract {
		shouldFold = tokens.Reasoning > 0
	} else if tokens.Clamped.BlocksReasoningEvidence() || tokens.Reasoning == 0 {
		shouldFold = false
	} else if tokens.Total == 0 {
		shouldFold = true
	} else if sum, ok := checkedSum(tokens.Input, tokens.Output); ok && sum == tokens.Total {
		shouldFold = false
	} else if sum, ok := checkedSum(tokens.Input, tokens.Output, tokens.Reasoning); ok && sum == tokens.Total {
		shouldFold = true
	}

	if shouldFold {
		if out, ok := checkedSum(tokens.Output, tokens.Reasoning); ok {
			tokens.Output = out
		}
	}

	if parserContract && !tokens.Clamped.BlocksParentContract() {
		return reconcileCanonicalTotal(tokens)
	}
	return reconcileZeroTotal(tokens)
}

func normalizeResponses(tokens TokenValues, parserContract bool, executorType string, rawTokens TokenValues) TokenValues {
	legacyCodexCachedOnly := parserContract &&
		strings.EqualFold(strings.TrimSpace(executorType), "CodexExecutor") &&
		!rawTokens.Clamped.Any() &&
		rawTokens.Input == 0 &&
		rawTokens.Output == 0 &&
		rawTokens.Reasoning == 0 &&
		rawTokens.Cached > 0 &&
		rawTokens.CacheRead == 0 &&
		rawTokens.CacheCreation == 0 &&
		rawTokens.Total == rawTokens.Cached

	if legacyCodexCachedOnly {
		return tokens
	}

	if parserContract && !tokens.Clamped.BlocksParentContract() {
		return reconcileCanonicalTotal(tokens)
	}
	return reconcileZeroTotal(tokens)
}

func normalizeOpenAICompatibility(tokens TokenValues) TokenValues {
	if !tokens.Clamped.BlocksReasoningEvidence() &&
		tokens.Reasoning > 0 &&
		tokens.Total > 0 {
		ioSum, ioOk := checkedSum(tokens.Input, tokens.Output)
		iorSum, iorOk := checkedSum(tokens.Input, tokens.Output, tokens.Reasoning)
		if ioOk && ioSum != tokens.Total && iorOk && iorSum == tokens.Total {
			if out, ok := checkedSum(tokens.Output, tokens.Reasoning); ok {
				tokens.Output = out
			}
		}
	}
	return reconcileZeroTotal(tokens)
}

func reconcileCanonicalTotal(tokens TokenValues) TokenValues {
	if tokens.Clamped.BlocksParentContract() || tokens.Clamped.Total {
		return tokens
	}
	cacheTotal, ok := checkedSum(tokens.CacheRead, tokens.CacheCreation)
	if !ok || tokens.Input < cacheTotal || tokens.Output < tokens.Reasoning {
		return reconcileZeroTotal(tokens)
	}
	if total, ok := checkedSum(tokens.Input, tokens.Output); ok {
		tokens.Total = total
	}
	return tokens
}

func reconcileZeroTotal(tokens TokenValues) TokenValues {
	if tokens.Total != 0 || tokens.Clamped.BlocksZeroTotal() {
		return tokens
	}
	if total, ok := checkedSum(tokens.Input, tokens.Output); ok && total > 0 {
		tokens.Total = total
		return tokens
	}
	if tokens.CacheRead > 0 {
		tokens.Total = tokens.CacheRead
	}
	return tokens
}

func checkedSum(values ...uint64) (uint64, bool) {
	var total uint64
	for _, v := range values {
		next := total + v
		if next < total {
			return 0, false // overflow
		}
		total = next
	}
	return total, true
}
