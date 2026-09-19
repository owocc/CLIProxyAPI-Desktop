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
	RunOnStartup          bool     `json:"runOnStartup" toml:"run-on-startup"`
	CloseBehavior         string   `json:"closeBehavior" toml:"close-behavior"`
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

// GuiConfigFile is the complete representation stored in config.toml.
type GuiConfigFile struct {
	GuiSettings
	CoreSettings
	ApiKeys             []ApiKeyEntry `json:"apiKeys" toml:"api-keys"`
	ManagementSecretKey string        `json:"managementSecretKey,omitempty" toml:"management-secret-key"`
}
