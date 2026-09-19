package model

// ProviderHealthProbeRequest represents a latency & connectivity probe request.
type ProviderHealthProbeRequest struct {
	Url       string            `json:"url"`
	Header    map[string]string `json:"header"`
	Data      string            `json:"data"`
	Protocol  string            `json:"protocol"` // "openai-chat" | "openai-responses" | "claude" | "gemini"
	TimeoutMs *int              `json:"timeoutMs,omitempty"`
	Model     string            `json:"model"`
	Source    string            `json:"source"`
	AuthIndex string            `json:"authIndex"`
}

// ProviderHealthProbeResponse represents the result of a health probe test.
type ProviderHealthProbeResponse struct {
	FirstTokenLatencyMs *int   `json:"firstTokenLatencyMs,omitempty"`
	ResponseLatencyMs   int    `json:"responseLatencyMs"`
	Success             bool   `json:"success"`
	Error               string `json:"error,omitempty"`
	TimedOut            bool   `json:"timedOut,omitempty"`
}
