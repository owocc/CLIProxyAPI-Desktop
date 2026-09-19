package model

// CoreStatus represents the runtime and installation state of the proxy core.
type CoreStatus struct {
	Installed      bool    `json:"installed"`
	Running        bool    `json:"running"`
	Ready          bool    `json:"ready"`
	Starting       bool    `json:"starting"`
	Managed        bool    `json:"managed"`
	ProcessId      *int    `json:"processId"`
	CurrentVersion *string `json:"currentVersion"`
	InstallDir     string  `json:"installDir"`
	BinaryPath     *string `json:"binaryPath"`
	Message        string  `json:"message"`
}

// CoreInstallTask represents progress of an active install/update task.
type CoreInstallTask struct {
	Running         bool    `json:"running"`
	Cancellable     bool    `json:"cancellable"`
	Phase           string  `json:"phase"`
	Percentage      float64 `json:"percentage"`
	DownloadedBytes int64   `json:"downloadedBytes"`
	TotalBytes      int64   `json:"totalBytes"`
	Error           *string `json:"error"`
}

// ReleaseAsset represents an asset in a core release.
type ReleaseAsset struct {
	Name        string `json:"name"`
	DownloadUrl string `json:"downloadUrl"`
	Size        int64  `json:"size"`
	Sha256      string `json:"sha256"`
}

// ReleaseInfo contains release information discovered from GitHub or mirrors.
type ReleaseInfo struct {
	Version      string         `json:"version"`
	TagName      string         `json:"tagName"`
	ReleaseNotes string         `json:"releaseNotes"`
	PublishedAt  string         `json:"publishedAt"`
	Assets       []ReleaseAsset `json:"assets"`
}

// CoreMeta stores metadata saved in cpa-gui-meta.json after installation.
type CoreMeta struct {
	Version         string `json:"version"`
	AssetName       string `json:"asset_name"`
	InstalledAtUnix int64  `json:"installed_at_unix"`
}

// CoreHealthCheck represents the result of a deep health check probe on the core service.
type CoreHealthCheck struct {
	Healthy    bool   `json:"healthy"`
	Status     string `json:"status"` // "healthy" | "offline" | "unresponsive"
	StatusCode int    `json:"statusCode"`
	LatencyMs  int64  `json:"latencyMs"`
	Port       int    `json:"port"`
	ProcessId  *int   `json:"processId"`
	Message    string `json:"message"`
	CheckedAt  string `json:"checkedAt"`
}
