package model

// OAuthStartResult represents the response when starting an OAuth login flow.
type OAuthStartResult struct {
	Url       string  `json:"url"`
	State     *string `json:"state,omitempty"`
	Opened    bool    `json:"opened"`
	OpenError *string `json:"openError,omitempty"`
}

// OAuthStatusResult represents the polling response of an OAuth authorization session.
type OAuthStatusResult struct {
	Status string  `json:"status"` // "ok" | "wait" | "error"
	Error  *string `json:"error,omitempty"`
}

// OAuthBrowserOption represents a detected browser choice for opening OAuth URLs.
type OAuthBrowserOption struct {
	Id    string `json:"id"`
	Label string `json:"label"`
}

// ManagementRequest represents an HTTP request to be forwarded to cpa-core's /v0/management/* API.
type ManagementRequest struct {
	Method    string            `json:"method"`
	Path      string            `json:"path"`
	Query     map[string]string `json:"query,omitempty"`
	Body      any               `json:"body,omitempty"`
	TimeoutMs *int              `json:"timeoutMs,omitempty"`
}

// CodexNativeStatus represents the state of Codex native OAuth vs CPA proxy mode.
type CodexNativeStatus struct {
	Enabled            bool    `json:"enabled"`
	OfficialAuthExists bool    `json:"officialAuthExists"`
	HasCpaConfig       bool    `json:"hasCpaConfig"`
	AccountEmail       *string `json:"accountEmail,omitempty"`
}
