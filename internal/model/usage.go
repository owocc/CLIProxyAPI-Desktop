package model

// UsageRecord represents an individual proxy request log entry with detailed token and execution metrics.
type UsageRecord struct {
	Id                  string  `json:"id"`
	Timestamp           string  `json:"timestamp"`
	LatencyMs           int64   `json:"latencyMs"`
	TtftMs              *int64  `json:"ttftMs,omitempty"`
	Source              string  `json:"source"`
	SourceDisplay       string  `json:"sourceDisplay"`
	AuthIndex           string  `json:"authIndex"`
	Failed              bool    `json:"failed"`
	Canceled            bool    `json:"canceled"`
	FailureStatus       uint16  `json:"failureStatus"`
	FailureBody         string  `json:"failureBody"`
	Provider            string  `json:"provider"`
	ApiGroupKey         string  `json:"apiGroupKey"`
	Model               string  `json:"model"`
	Alias               string  `json:"alias"`
	ClientIp            *string `json:"clientIp,omitempty"`
	XForwardedFor       *string `json:"xForwardedFor,omitempty"`
	UserAgent           *string `json:"userAgent,omitempty"`
	ReasoningEffort     string  `json:"reasoningEffort"`
	ServiceTier         string  `json:"serviceTier"`
	ResponseServiceTier string  `json:"responseServiceTier"`
	ExecutorType        string  `json:"executorType"`
	Endpoint            string  `json:"endpoint"`
	AuthType            string  `json:"authType"`
	ApiKeyHash          string  `json:"apiKeyHash"`
	ApiKeyDisplay       string  `json:"apiKeyDisplay"`
	ApiKeyRemark        string  `json:"apiKeyRemark"`
	RequestId           string  `json:"requestId"`
	ModelAlias          *string `json:"modelAlias,omitempty"`
	Generate            bool    `json:"generate"`
	CachedTokens        int64   `json:"cachedTokens"`
	CollectorSource     string  `json:"collectorSource"`
	InputTokens         int64   `json:"inputTokens"`
	OutputTokens        int64   `json:"outputTokens"`
	ReasoningTokens     int64   `json:"reasoningTokens"`
	CacheReadTokens     int64   `json:"cacheReadTokens"`
	CacheCreationTokens int64   `json:"cacheCreationTokens"`
	TotalTokens         int64   `json:"totalTokens"`
	Cost                float64 `json:"cost"`
}

// UsageQuery defines filtering parameters for usage queries.
type UsageQuery struct {
	Start      *string `json:"start,omitempty"`
	End        *string `json:"end,omitempty"`
	Model      *string `json:"model,omitempty"`
	Provider   *string `json:"provider,omitempty"`
	Source     *string `json:"source,omitempty"`
	ApiKeyHash *string `json:"apiKeyHash,omitempty"`
	Failed     *bool   `json:"failed,omitempty"`
	Canceled   *bool   `json:"canceled,omitempty"`
	Page       *int    `json:"page,omitempty"`
	PageSize   *int    `json:"pageSize,omitempty"`
}

// UsageTimelineModel holds token and request counts for a single model in a timeline bucket.
type UsageTimelineModel struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Tokens   int64  `json:"tokens"`
	Requests int64  `json:"requests"`
}

// UsageTimelinePoint represents an aggregated timeline bucket (30-minute default).
type UsageTimelinePoint struct {
	Hour     string               `json:"hour"`
	Requests int64                `json:"requests"`
	Success  int64                `json:"success"`
	Failure  int64                `json:"failure"`
	Canceled int64                `json:"canceled"`
	Tokens   int64                `json:"tokens"`
	Models   []UsageTimelineModel `json:"models"`
}

// UsageOverview provides aggregate performance metrics and timeline series.
type UsageOverview struct {
	TotalRequests       int64                `json:"totalRequests"`
	SuccessCount        int64                `json:"successCount"`
	FailureCount        int64                `json:"failureCount"`
	CanceledCount       int64                `json:"canceledCount"`
	SuccessRate         float64              `json:"successRate"`
	InputTokens         int64                `json:"inputTokens"`
	OutputTokens        int64                `json:"outputTokens"`
	ReasoningTokens     int64                `json:"reasoningTokens"`
	CacheReadTokens     int64                `json:"cacheReadTokens"`
	CacheCreationTokens int64                `json:"cacheCreationTokens"`
	TotalTokens         int64                `json:"totalTokens"`
	Rpm                 float64              `json:"rpm"`
	Tpm                 float64              `json:"tpm"`
	Tps                 float64              `json:"tps"`
	TpsSampleCount      int64                `json:"tpsSampleCount"`
	AverageLatencyMs    float64              `json:"averageLatencyMs"`
	CacheHitRate        float64              `json:"cacheHitRate"`
	EstimatedCost       float64              `json:"estimatedCost"`
	PricedRequests      int64                `json:"pricedRequests"`
	Timeline            []UsageTimelinePoint `json:"timeline"`
}

// UsageCategory represents an aggregated dimension bucket (model, provider, client, API key).
type UsageCategory struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Requests int64  `json:"requests"`
	Failures int64  `json:"failures"`
	Tokens   int64  `json:"tokens"`
}

// UsageAnalysis holds distribution data across 4 dimensions.
type UsageAnalysis struct {
	Models    []UsageCategory `json:"models"`
	Providers []UsageCategory `json:"providers"`
	Sources   []UsageCategory `json:"sources"`
	ApiKeys   []UsageCategory `json:"apiKeys"`
}

// UsageEventPage represents a paginated list of usage records.
type UsageEventPage struct {
	Items      []UsageRecord `json:"items"`
	Total      int           `json:"total"`
	Page       int           `json:"page"`
	PageSize   int           `json:"pageSize"`
	TotalPages int           `json:"totalPages"`
}

// ModelPrice defines pricing parameters per 1M tokens in USD.
type ModelPrice struct {
	Model                  string  `json:"model"`
	Prompt                 float64 `json:"prompt"`
	Completion             float64 `json:"completion"`
	Cache                  float64 `json:"cache"`
	CacheRead              float64 `json:"cacheRead"`
	CacheCreation          float64 `json:"cacheCreation"`
	PromptConfigured       bool    `json:"promptConfigured"`
	CompletionConfigured   bool    `json:"completionConfigured"`
	CacheReadConfigured    bool    `json:"cacheReadConfigured"`
	CacheCreationConfigured bool   `json:"cacheCreationConfigured"`
	Source                 string  `json:"source"`
	SourceModelId          string  `json:"sourceModelId"`
	UpdatedAtMs            int64   `json:"updatedAtMs"`
}

// UsagePriceRow is a row in the pricing breakdown table.
type UsagePriceRow struct {
	Model               string      `json:"model"`
	Requests            int64       `json:"requests"`
	InputTokens         int64       `json:"inputTokens"`
	OutputTokens        int64       `json:"outputTokens"`
	CacheReadTokens     int64       `json:"cacheReadTokens"`
	CacheCreationTokens int64       `json:"cacheCreationTokens"`
	TotalTokens         int64       `json:"totalTokens"`
	EstimatedCost       float64     `json:"estimatedCost"`
	Price               *ModelPrice `json:"price,omitempty"`
}

// UsagePricing holds model pricing summary and rows.
type UsagePricing struct {
	Rows           []UsagePriceRow `json:"rows"`
	TotalCost      float64         `json:"totalCost"`
	TotalRequests  int64           `json:"totalRequests"`
	PricedRequests int64           `json:"pricedRequests"`
	SavedPrices    int             `json:"savedPrices"`
}

// ModelPriceSyncResult describes the outcome of syncing model pricing.
type ModelPriceSyncResult struct {
	Imported    int      `json:"imported"`
	Skipped     int      `json:"skipped"`
	Unmatched   []string `json:"unmatched"`
	UsedBuiltin bool     `json:"usedBuiltin"`
}

// UsageStorageSettings contains SQLite disk metrics and size limit settings.
type UsageStorageSettings struct {
	DatabasePath       string `json:"databasePath"`
	DatabaseSizeBytes  int64  `json:"databaseSizeBytes"`
	WalSizeBytes       int64  `json:"walSizeBytes"`
	MaxDatabaseSizeMb  uint64 `json:"maxDatabaseSizeMb"`
	TotalRecords       uint64 `json:"totalRecords"`
	DeletedRecords     uint64 `json:"deletedRecords"`
}

// UsageRepairResult records the outcome of cache anomaly repairs.
type UsageRepairResult struct {
	Scanned    uint64  `json:"scanned"`
	Repaired   uint64  `json:"repaired"`
	Deleted    uint64  `json:"deleted"`
	BackupPath *string `json:"backupPath,omitempty"`
}

// CollectorStatus represents the runtime status of the usage background collector.
type CollectorStatus struct {
	State           string  `json:"state"` // "waiting-core" | "collecting" | "error"
	Message         string  `json:"message"`
	LastCollectedAt *string `json:"lastCollectedAt,omitempty"`
	TotalRecords    uint64  `json:"totalRecords"`
}

// UsageSummary provides aggregated metrics across all or daily records (legacy compatibility).
type UsageSummary struct {
	TotalRequests         int64   `json:"totalRequests"`
	TodayRequests         int64   `json:"todayRequests"`
	TotalPromptTokens     int64   `json:"totalPromptTokens"`
	TotalCompletionTokens int64   `json:"totalCompletionTokens"`
	TotalTokens           int64   `json:"totalTokens"`
	TotalCost             float64 `json:"totalCost"`
	TodayCost             float64 `json:"todayCost"`
}

// DailyTrendPoint represents daily usage data for simple charts (legacy compatibility).
type DailyTrendPoint struct {
	Date             string  `json:"date"`
	Requests         int64   `json:"requests"`
	PromptTokens     int64   `json:"promptTokens"`
	CompletionTokens int64   `json:"completionTokens"`
	TotalTokens      int64   `json:"totalTokens"`
	Cost             float64 `json:"cost"`
}
