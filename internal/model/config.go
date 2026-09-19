package model

// ApiKeyEntry stores an API key with an optional user remark.
type ApiKeyEntry struct {
	ApiKey string `json:"apiKey" toml:"key"`
	Remark string `json:"remark" toml:"remark"`
}

// TlsSettings represents TLS certificate configuration.
type TlsSettings struct {
	Enable bool   `json:"enable"`
	Cert   string `json:"cert"`
	Key    string `json:"key"`
}

// CoreSettings represents kernel settings managed by GUI and stored in config.yaml.
type CoreSettings struct {
	Host                             string `json:"host"`
	Port                             int    `json:"port"`
	AuthDir                          string `json:"authDir"`
	Debug                            bool   `json:"debug"`
	CommercialMode                   bool   `json:"commercialMode"`
	LoggingToFile                    bool   `json:"loggingToFile"`
	LogsMaxTotalSizeMB               int    `json:"logsMaxTotalSizeMb"`
	ErrorLogsMaxFiles                int    `json:"errorLogsMaxFiles"`
	UsageStatisticsEnabled           bool   `json:"usageStatisticsEnabled"`
	RedisUsageQueueRetentionSeconds  int    `json:"redisUsageQueueRetentionSeconds"`
	RequestLog                       bool   `json:"requestLog"`
	RoutingStrategy                  string `json:"routingStrategy"`
	RoutingSessionAffinity           bool   `json:"routingSessionAffinity"`
	RoutingSessionAffinityTTL        string `json:"routingSessionAffinityTtl"`
	DisableCooling                   bool   `json:"disableCooling"`
	RequestRetry                     int    `json:"requestRetry"`
	MaxRetryCredentials              int    `json:"maxRetryCredentials"`
	MaxRetryInterval                 int    `json:"maxRetryInterval"`
	StreamingBootstrapRetries        int    `json:"streamingBootstrapRetries"`
	ProxyUrl                         string `json:"proxyUrl"`
	ProxyOverride                    bool   `json:"proxyOverride"`
	AllowLan                         bool   `json:"allowLan"`
}

// GuiSettings represents purely desktop/GUI settings stored in config.toml.
type GuiSettings struct {
	Locale                string   `json:"locale" toml:"locale"`
	Theme                 string   `json:"theme" toml:"theme"`
	SidebarStyle          string   `json:"sidebarStyle" toml:"sidebar-style"` // "blur" | "color"
	RunOnStartup          bool     `json:"runOnStartup" toml:"run-on-startup"`
	CloseBehavior         string   `json:"closeBehavior" toml:"close-behavior"`
	LightweightMode       bool     `json:"lightweightMode" toml:"lightweight-mode"`
	ShowTrayIcon          bool     `json:"showTrayIcon" toml:"show-tray-icon"`
	DownloadSource        string   `json:"downloadSource" toml:"download-source"`
	CustomDownloadMirrors []string `json:"customDownloadMirrors" toml:"custom-download-mirrors"`
}

// ThinkingAlias represents a thinking/reasoning model alias rule.
type ThinkingAlias struct {
	Alias         string `json:"alias"`
	TargetModel   string `json:"targetModel"`
	ThinkingLevel string `json:"thinkingLevel"`
	Provider      string `json:"provider"`
}

// GuiApiAccessRemark stores a user-friendly remark for a specific provider record or API key.
type GuiApiAccessRemark struct {
	ProviderSection string `json:"providerSection" toml:"provider-section"`
	ApiKeyHash      string `json:"apiKeyHash" toml:"api-key-hash"`
	RecordHash      string `json:"recordHash" toml:"record-hash"`
	Remark          string `json:"remark" toml:"remark"`
}

// ApiAccessRemarkLocator identifies a provider row by section, name, baseUrl, and keys.
type ApiAccessRemarkLocator struct {
	ProviderName string   `json:"providerName"`
	BaseUrl      string   `json:"baseUrl"`
	ApiKeys      []string `json:"apiKeys"`
}

// ApiAccessRemarkQuery queries a saved remark for a given provider.
type ApiAccessRemarkQuery struct {
	ProviderSection string   `json:"providerSection"`
	ProviderName    string   `json:"providerName"`
	BaseUrl         string   `json:"baseUrl"`
	ApiKeys         []string `json:"apiKeys"`
}

// ApiAccessRemarkUpdate updates remarks for given providers in config.toml.
type ApiAccessRemarkUpdate struct {
	ProviderSection string                   `json:"providerSection"`
	PreviousRecords []ApiAccessRemarkLocator `json:"previousRecords"`
	Records         []ApiAccessRemarkLocator `json:"records"`
	AllRecords      []ApiAccessRemarkLocator `json:"allRecords"`
	Remark          string                   `json:"remark"`
}

// GuiConfigFile is the complete representation stored in config.toml.
type GuiConfigFile struct {
	GuiSettings
	CoreSettings
	ApiKeys             []ApiKeyEntry        `json:"apiKeys" toml:"api-keys"`
	ApiAccessRemarks    []GuiApiAccessRemark `json:"apiAccessRemarks" toml:"api-access-remarks"`
	ManagementSecretKey string               `json:"managementSecretKey,omitempty" toml:"management-secret-key"`
}
