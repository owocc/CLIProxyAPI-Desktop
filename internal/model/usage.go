package model

// UsageRecord represents an individual proxy request log entry with token metrics.
type UsageRecord struct {
	Id               string  `json:"id"`
	Timestamp        int64   `json:"timestamp"`
	TimeFormatted    string  `json:"timeFormatted"`
	Model            string  `json:"model"`
	Provider         string  `json:"provider"`
	PromptTokens     int     `json:"promptTokens"`
	CompletionTokens int     `json:"completionTokens"`
	TotalTokens      int     `json:"totalTokens"`
	DurationMs       int     `json:"durationMs"`
	StatusCode       int     `json:"statusCode"`
	Cost             float64 `json:"cost"`
}

// UsageSummary provides aggregated metrics across all or daily records.
type UsageSummary struct {
	TotalRequests         int64   `json:"totalRequests"`
	TodayRequests         int64   `json:"todayRequests"`
	TotalPromptTokens     int64   `json:"totalPromptTokens"`
	TotalCompletionTokens int64   `json:"totalCompletionTokens"`
	TotalTokens           int64   `json:"totalTokens"`
	TotalCost             float64 `json:"totalCost"`
	TodayCost             float64 `json:"todayCost"`
}

// DailyTrendPoint represents daily usage data for charts.
type DailyTrendPoint struct {
	Date             string  `json:"date"`
	Requests         int64   `json:"requests"`
	PromptTokens     int64   `json:"promptTokens"`
	CompletionTokens int64   `json:"completionTokens"`
	TotalTokens      int64   `json:"totalTokens"`
	Cost             float64 `json:"cost"`
}
