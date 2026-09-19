package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/core"
	"easycliproxyapi/internal/model"
)

type OAuthService struct {
	app           *application.App
	configManager *config.ConfigManager
	httpClient    *http.Client
	initOnce      sync.Once
}

func NewOAuthService(cm *config.ConfigManager) *OAuthService {
	return &OAuthService{
		configManager: cm,
		httpClient: &http.Client{
			Transport: &http.Transport{
				Proxy: nil, // bypass proxy for local loopback
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true, // allow self-signed cert on core
				},
			},
			Timeout: 30 * time.Second,
		},
	}
}

func (s *OAuthService) SetApp(app *application.App) {
	s.app = app
}

// StartOAuthLogin initiates an OAuth login flow with cpa-core.
func (s *OAuthService) StartOAuthLogin(provider string, browser string) (model.OAuthStartResult, error) {
	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return model.OAuthStartResult{}, fmt.Errorf("读取配置失败: %w", err)
	}

	providerKey, err := normalizeManagementOAuthProvider(provider)
	if err != nil {
		return model.OAuthStartResult{}, err
	}

	endpoint, err := s.managementEndpoint(cfg, fmt.Sprintf("%s-auth-url", providerKey))
	if err != nil {
		return model.OAuthStartResult{}, err
	}

	reqUrl, err := url.Parse(endpoint)
	if err != nil {
		return model.OAuthStartResult{}, fmt.Errorf("无效端点 URL: %w", err)
	}

	if managementOAuthUsesWebuiCallback(providerKey) {
		q := reqUrl.Query()
		q.Set("is_webui", "true")
		reqUrl.RawQuery = q.Encode()
	}

	httpReq, err := http.NewRequest(http.MethodGet, reqUrl.String(), nil)
	if err != nil {
		return model.OAuthStartResult{}, fmt.Errorf("创建请求失败: %w", err)
	}

	authHeader, err := s.managementAuthorization(cfg)
	if err != nil {
		return model.OAuthStartResult{}, err
	}
	httpReq.Header.Set("Authorization", authHeader)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return model.OAuthStartResult{}, fmt.Errorf("请求 OAuth 登录链接失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return model.OAuthStartResult{}, fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode >= 400 {
		return model.OAuthStartResult{}, fmt.Errorf("内核返回错误 (状态码 %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var payload struct {
		Url          string `json:"url"`
		State        string `json:"state"`
		Error        string `json:"error"`
		ErrorMessage string `json:"error_message"`
	}
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return model.OAuthStartResult{}, fmt.Errorf("解析 OAuth 响应失败: %w; 原始内容: %s", err, string(bodyBytes))
	}

	errMsg := payload.Error
	if errMsg == "" {
		errMsg = payload.ErrorMessage
	}
	if errMsg != "" {
		return model.OAuthStartResult{}, fmt.Errorf("%s", errMsg)
	}

	authUrl := strings.TrimSpace(payload.Url)
	if authUrl == "" {
		return model.OAuthStartResult{}, fmt.Errorf("内核未返回 OAuth 登录链接")
	}

	var statePtr *string
	if trimmedState := strings.TrimSpace(payload.State); trimmedState != "" {
		statePtr = &trimmedState
	}

	opened := false
	var openErrorPtr *string

	if browser != "none" {
		if openErr := s.OpenOAuthUrl(authUrl, browser); openErr != nil {
			errStr := openErr.Error()
			openErrorPtr = &errStr
		} else {
			opened = true
		}
	}

	return model.OAuthStartResult{
		Url:       authUrl,
		State:     statePtr,
		Opened:    opened,
		OpenError: openErrorPtr,
	}, nil
}

// GetOAuthStatus queries the current status of an ongoing OAuth login session.
func (s *OAuthService) GetOAuthStatus(state string) (model.OAuthStatusResult, error) {
	state = strings.TrimSpace(state)
	if state == "" {
		return model.OAuthStatusResult{}, fmt.Errorf("OAuth state 不能为空")
	}

	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return model.OAuthStatusResult{}, fmt.Errorf("读取配置失败: %w", err)
	}

	endpoint, err := s.managementEndpoint(cfg, "get-auth-status")
	if err != nil {
		return model.OAuthStatusResult{}, err
	}

	reqUrl, err := url.Parse(endpoint)
	if err != nil {
		return model.OAuthStatusResult{}, fmt.Errorf("无效端点 URL: %w", err)
	}
	q := reqUrl.Query()
	q.Set("state", state)
	reqUrl.RawQuery = q.Encode()

	httpReq, err := http.NewRequest(http.MethodGet, reqUrl.String(), nil)
	if err != nil {
		return model.OAuthStatusResult{}, fmt.Errorf("创建请求失败: %w", err)
	}

	authHeader, err := s.managementAuthorization(cfg)
	if err != nil {
		return model.OAuthStatusResult{}, err
	}
	httpReq.Header.Set("Authorization", authHeader)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return model.OAuthStatusResult{}, fmt.Errorf("查询 OAuth 状态失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return model.OAuthStatusResult{}, fmt.Errorf("读取状态响应失败: %w", err)
	}

	if resp.StatusCode >= 400 {
		return model.OAuthStatusResult{}, fmt.Errorf("内核返回错误 (状态码 %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var payload struct {
		Status       string `json:"status"`
		Error        string `json:"error"`
		ErrorMessage string `json:"error_message"`
	}
	_ = json.Unmarshal(bodyBytes, &payload)

	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if status == "" {
		status = "wait"
	}

	var errPtr *string
	errMsg := payload.Error
	if errMsg == "" {
		errMsg = payload.ErrorMessage
	}
	if trimmed := strings.TrimSpace(errMsg); trimmed != "" {
		errPtr = &trimmed
	}

	return model.OAuthStatusResult{
		Status: status,
		Error:  errPtr,
	}, nil
}

// SubmitOAuthCallback sends a manual callback code/URL to cpa-core.
func (s *OAuthService) SubmitOAuthCallback(provider string, redirectUrl string) error {
	redirectUrl = strings.TrimSpace(redirectUrl)
	if redirectUrl == "" {
		return fmt.Errorf("回调链接不能为空")
	}

	providerKey, err := normalizeManagementOAuthProvider(provider)
	if err != nil {
		return err
	}

	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return fmt.Errorf("读取配置失败: %w", err)
	}

	endpoint, err := s.managementEndpoint(cfg, "oauth-callback")
	if err != nil {
		return err
	}

	reqBody, _ := json.Marshal(map[string]string{
		"provider":     providerKey,
		"redirect_url": redirectUrl,
	})

	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("创建回调请求失败: %w", err)
	}

	authHeader, err := s.managementAuthorization(cfg)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", authHeader)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("提交 OAuth 回调失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("提交回调失败 (状态码 %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// UploadAuthFile uploads a credential JSON file to cpa-core via management API.
func (s *OAuthService) UploadAuthFile(name string, dataBase64 string) (any, error) {
	name = strings.TrimSpace(name)
	if name == "" || !strings.HasSuffix(strings.ToLower(name), ".json") {
		return nil, fmt.Errorf("凭证文件名必须以 .json 结尾")
	}

	fileBytes, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		return nil, fmt.Errorf("解析凭证数据失败: %w", err)
	}

	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}

	endpoint, err := s.managementEndpoint(cfg, "auth-files")
	if err != nil {
		return nil, err
	}

	reqUrl, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("无效端点 URL: %w", err)
	}
	q := reqUrl.Query()
	q.Set("name", name)
	reqUrl.RawQuery = q.Encode()

	httpReq, err := http.NewRequest(http.MethodPost, reqUrl.String(), bytes.NewReader(fileBytes))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	authHeader, err := s.managementAuthorization(cfg)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", authHeader)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("上传凭证文件失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("上传凭证失败 (状态码 %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var result any
	if len(bodyBytes) > 0 {
		_ = json.Unmarshal(bodyBytes, &result)
	}
	return result, nil
}

// OpenAuthFilesDirectory opens the local oauth directory in the system file manager.
func (s *OAuthService) OpenAuthFilesDirectory() error {
	dir := core.OAuthDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建凭证目录失败: %w", err)
	}
	return openDirectoryInFileManager(dir)
}

// OpenCoreLogsDirectory opens the local core logs directory in the system file manager.
func (s *OAuthService) OpenCoreLogsDirectory() error {
	dir := core.LogDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建日志目录失败: %w", err)
	}
	return openDirectoryInFileManager(dir)
}

// ManagementRequest proxies arbitrary requests to /v0/management/* on cpa-core.
func (s *OAuthService) ManagementRequest(req model.ManagementRequest) (any, error) {
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
	default:
		return nil, fmt.Errorf("不支持的管理 API 请求方法: %s", method)
	}

	path := strings.TrimSpace(req.Path)
	if path == "" || strings.Contains(path, "://") || strings.Contains(path, "..") {
		return nil, fmt.Errorf("无效的管理 API 路径: %s", path)
	}

	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}

	endpoint, err := s.managementEndpoint(cfg, path)
	if err != nil {
		return nil, err
	}

	reqUrl, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("无效端点 URL: %w", err)
	}

	if len(req.Query) > 0 {
		q := reqUrl.Query()
		for k, v := range req.Query {
			q.Set(k, v)
		}
		reqUrl.RawQuery = q.Encode()
	}

	var bodyReader io.Reader
	if req.Body != nil {
		bodyBytes, err := json.Marshal(req.Body)
		if err != nil {
			return nil, fmt.Errorf("序列化请求体失败: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	httpReq, err := http.NewRequest(method, reqUrl.String(), bodyReader)
	if err != nil {
		return nil, fmt.Errorf("创建管理 API 请求失败: %w", err)
	}

	authHeader, err := s.managementAuthorization(cfg)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", authHeader)
	if req.Body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	client := s.httpClient
	if req.TimeoutMs != nil && *req.TimeoutMs > 0 {
		timeout := time.Duration(*req.TimeoutMs) * time.Millisecond
		if timeout < 1*time.Second {
			timeout = 1 * time.Second
		} else if timeout > 120*time.Second {
			timeout = 120 * time.Second
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		httpReq = httpReq.WithContext(ctx)
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求管理 API 失败 (%s %s): %w", method, path, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取管理 API 响应失败: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("管理 API 错误 (状态码 %d): %s", resp.StatusCode, string(respBytes))
	}

	if len(bytes.TrimSpace(respBytes)) == 0 {
		return nil, nil
	}

	var result any
	if err := json.Unmarshal(respBytes, &result); err != nil {
		// Return raw string if not JSON
		return string(respBytes), nil
	}

	return result, nil
}

// ListOAuthBrowsers returns the available browsers on the host system.
func (s *OAuthService) ListOAuthBrowsers() []model.OAuthBrowserOption {
	options := []model.OAuthBrowserOption{
		{Id: "default", Label: "System Default"},
	}

	detected := detectInstalledBrowsers()
	options = append(options, detected...)
	return options
}

// OpenOAuthUrl opens an authorization URL in the specified browser.
func (s *OAuthService) OpenOAuthUrl(urlStr string, browser string) error {
	urlStr = strings.TrimSpace(urlStr)
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		return fmt.Errorf("只允许打开 http:// 或 https:// 链接")
	}

	browser = strings.TrimSpace(browser)
	if browser == "none" {
		return nil
	}
	if browser == "" || browser == "default" {
		return openUrlDefault(urlStr)
	}

	return openUrlWithBrowser(urlStr, browser)
}

// Helper methods

func (s *OAuthService) managementEndpoint(cfg model.GuiConfigFile, path string) (string, error) {
	if cfg.Port <= 0 {
		return "", fmt.Errorf("内核端口无效")
	}

	path = strings.TrimPrefix(path, "/")
	scheme := "http"
	// If TLS is configured on core
	host := cfg.Host
	if host == "" || host == "0.0.0.0" {
		host = "127.0.0.1"
	} else if host == "::" {
		host = "::1"
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}

	return fmt.Sprintf("%s://%s:%d/v0/management/%s", scheme, host, cfg.Port, path), nil
}

func (s *OAuthService) managementAuthorization(cfg model.GuiConfigFile) (string, error) {
	secretKey := strings.TrimSpace(cfg.ManagementSecretKey)
	if config.IsInvalidManagementSecretKey(secretKey) {
		return "", fmt.Errorf("管理接口不可用：没有可用的明文管理密钥")
	}
	return "Bearer " + secretKey, nil
}

func normalizeManagementOAuthProvider(provider string) (string, error) {
	key := strings.ToLower(strings.TrimSpace(provider))
	key = strings.ReplaceAll(key, "_", "-")
	switch key {
	case "claude", "anthropic":
		key = "anthropic"
	case "anti-gravity":
		key = "antigravity"
	case "cognition":
		key = "devin"
	case "grok", "x-ai", "x.ai":
		key = "xai"
	}

	if key == "" {
		return "", fmt.Errorf("无效的 OAuth 提供商")
	}
	for i := 0; i < len(key); i++ {
		b := key[i]
		if !(b >= 'a' && b <= 'z' || b >= '0' && b <= '9' || b == '-') {
			return "", fmt.Errorf("无效的 OAuth 提供商: %s", provider)
		}
	}
	return key, nil
}

func managementOAuthUsesWebuiCallback(providerKey string) bool {
	switch providerKey {
	case "codex", "anthropic", "antigravity", "xai", "devin":
		return true
	default:
		return false
	}
}

func openDirectoryInFileManager(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "windows":
		return exec.Command("explorer", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}

func openUrlDefault(urlStr string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", urlStr).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", urlStr).Start()
	default:
		return exec.Command("xdg-open", urlStr).Start()
	}
}

type browserSpec struct {
	id    string
	label string
	path  string
}

func detectInstalledBrowsers() []model.OAuthBrowserOption {
	var specs []browserSpec

	switch runtime.GOOS {
	case "darwin":
		candidates := []struct {
			id    string
			label string
			name  string
		}{
			{"safari", "Safari", "Safari.app"},
			{"chrome", "Google Chrome", "Google Chrome.app"},
			{"firefox", "Mozilla Firefox", "Firefox.app"},
			{"brave", "Brave", "Brave Browser.app"},
			{"edge", "Microsoft Edge", "Microsoft Edge.app"},
		}

		home, _ := os.UserHomeDir()
		roots := []string{"/Applications"}
		if home != "" {
			roots = append(roots, filepath.Join(home, "Applications"))
		}

		for _, c := range candidates {
			found := ""
			for _, r := range roots {
				appPath := filepath.Join(r, c.name)
				if fi, err := os.Stat(appPath); err == nil && fi.IsDir() {
					found = appPath
					break
				}
			}
			if found != "" {
				specs = append(specs, browserSpec{id: c.id, label: c.label, path: found})
			}
		}

	case "windows":
		roots := []string{
			os.Getenv("LOCALAPPDATA"),
			os.Getenv("ProgramFiles"),
			os.Getenv("ProgramFiles(x86)"),
		}
		candidates := []struct {
			id       string
			label    string
			relative string
		}{
			{"edge", "Microsoft Edge", `Microsoft\Edge\Application\msedge.exe`},
			{"chrome", "Google Chrome", `Google\Chrome\Application\chrome.exe`},
			{"brave", "Brave", `BraveSoftware\Brave-Browser\Application\brave.exe`},
			{"firefox", "Mozilla Firefox", `Mozilla Firefox\firefox.exe`},
		}

		for _, c := range candidates {
			for _, r := range roots {
				if r == "" {
					continue
				}
				p := filepath.Join(r, c.relative)
				if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
					specs = append(specs, browserSpec{id: c.id, label: c.label, path: p})
					break
				}
			}
		}

	default: // Linux
		candidates := []struct {
			id    string
			label string
			exes  []string
		}{
			{"chrome", "Google Chrome", []string{"google-chrome", "google-chrome-stable"}},
			{"firefox", "Mozilla Firefox", []string{"firefox"}},
			{"brave", "Brave", []string{"brave", "brave-browser"}},
			{"edge", "Microsoft Edge", []string{"microsoft-edge", "microsoft-edge-stable"}},
		}

		for _, c := range candidates {
			for _, exe := range c.exes {
				if p, err := exec.LookPath(exe); err == nil && p != "" {
					specs = append(specs, browserSpec{id: c.id, label: c.label, path: p})
					break
				}
			}
		}
	}

	result := make([]model.OAuthBrowserOption, 0, len(specs))
	for _, s := range specs {
		result = append(result, model.OAuthBrowserOption{
			Id:    s.id,
			Label: s.label,
		})
	}
	return result
}

func openUrlWithBrowser(urlStr string, browserId string) error {
	browsers := detectInstalledBrowsers()
	var matchedSpec *browserSpec
	for _, b := range browsers {
		if b.Id == browserId {
			// Find path
			matchedSpec = findBrowserSpecById(browserId)
			break
		}
	}

	if matchedSpec == nil || matchedSpec.path == "" {
		// Fall back to default
		return openUrlDefault(urlStr)
	}

	switch runtime.GOOS {
	case "darwin":
		// open -a "<path>" "<url>"
		return exec.Command("open", "-a", matchedSpec.path, urlStr).Start()
	default:
		return exec.Command(matchedSpec.path, urlStr).Start()
	}
}

func findBrowserSpecById(id string) *browserSpec {
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		roots := []string{"/Applications"}
		if home != "" {
			roots = append(roots, filepath.Join(home, "Applications"))
		}
		var name string
		switch id {
		case "safari":
			name = "Safari.app"
		case "chrome":
			name = "Google Chrome.app"
		case "firefox":
			name = "Firefox.app"
		case "brave":
			name = "Brave Browser.app"
		case "edge":
			name = "Microsoft Edge.app"
		}
		if name != "" {
			for _, r := range roots {
				p := filepath.Join(r, name)
				if fi, err := os.Stat(p); err == nil && fi.IsDir() {
					return &browserSpec{id: id, path: p}
				}
			}
		}
	case "windows":
		roots := []string{
			os.Getenv("LOCALAPPDATA"),
			os.Getenv("ProgramFiles"),
			os.Getenv("ProgramFiles(x86)"),
		}
		var rel string
		switch id {
		case "edge":
			rel = `Microsoft\Edge\Application\msedge.exe`
		case "chrome":
			rel = `Google\Chrome\Application\chrome.exe`
		case "brave":
			rel = `BraveSoftware\Brave-Browser\Application\brave.exe`
		case "firefox":
			rel = `Mozilla Firefox\firefox.exe`
		}
		if rel != "" {
			for _, r := range roots {
				if r == "" {
					continue
				}
				p := filepath.Join(r, rel)
				if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
					return &browserSpec{id: id, path: p}
				}
			}
		}
	default:
		var exes []string
		switch id {
		case "chrome":
			exes = []string{"google-chrome", "google-chrome-stable"}
		case "firefox":
			exes = []string{"firefox"}
		case "brave":
			exes = []string{"brave", "brave-browser"}
		case "edge":
			exes = []string{"microsoft-edge", "microsoft-edge-stable"}
		}
		for _, e := range exes {
			if p, err := exec.LookPath(e); err == nil && p != "" {
				return &browserSpec{id: id, path: p}
			}
		}
	}
	return nil
}
