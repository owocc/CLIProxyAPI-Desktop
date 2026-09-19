package service

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"easycliproxyapi/internal/config"
	"easycliproxyapi/internal/model"
)

type ProviderService struct {
	app           *application.App
	configManager *config.ConfigManager
	httpClient    *http.Client
}

func NewProviderService(cm *config.ConfigManager) *ProviderService {
	return &ProviderService{
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

func (s *ProviderService) SetApp(app *application.App) {
	s.app = app
}

func (s *ProviderService) managementAuthorization(cfg model.GuiConfigFile) (string, error) {
	secretKey := strings.TrimSpace(cfg.ManagementSecretKey)
	if secretKey == "" || config.IsInvalidManagementSecretKey(secretKey) {
		return "", fmt.Errorf("管理接口不可用：没有可用的明文管理密钥")
	}
	return fmt.Sprintf("Bearer %s", secretKey), nil
}

func (s *ProviderService) managementEndpoint(cfg model.GuiConfigFile, path string) (string, error) {
	if cfg.Port <= 0 {
		return "", fmt.Errorf("内核端口无效")
	}
	cleanPath := strings.TrimLeft(strings.TrimSpace(path), "/")
	host := strings.TrimSpace(cfg.Host)
	if host == "" {
		host = "127.0.0.1"
	}
	return fmt.Sprintf("http://%s:%d/v0/management/%s", host, cfg.Port, cleanPath), nil
}

// ManagementRequest proxies arbitrary requests to /v0/management/* on cpa-core.
func (s *ProviderService) ManagementRequest(req model.ManagementRequest) (any, error) {
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
		return string(respBytes), nil
	}
	return result, nil
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func apiKeyHash(key string) string {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return ""
	}
	return sha256Hex([]byte(trimmed))
}

func apiAccessLocatorIdentity(providerSection string, locator model.ApiAccessRemarkLocator) (string, []string) {
	var keyHashes []string
	seen := make(map[string]bool)
	for _, key := range locator.ApiKeys {
		h := apiKeyHash(key)
		if h != "" && !seen[h] {
			seen[h] = true
			keyHashes = append(keyHashes, h)
		}
	}
	sort.Strings(keyHashes)
	if len(keyHashes) == 0 {
		return "", nil
	}

	var identity []byte
	components := []string{
		strings.TrimSpace(providerSection),
		strings.TrimSpace(locator.ProviderName),
		strings.TrimSpace(locator.BaseUrl),
	}
	for _, comp := range components {
		b := make([]byte, 8)
		binary.BigEndian.PutUint64(b, uint64(len(comp)))
		identity = append(identity, b...)
		identity = append(identity, []byte(comp)...)
	}

	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(len(keyHashes)))
	identity = append(identity, b...)
	for _, h := range keyHashes {
		hb := make([]byte, 8)
		binary.BigEndian.PutUint64(hb, uint64(len(h)))
		identity = append(identity, hb...)
		identity = append(identity, []byte(h)...)
	}

	return sha256Hex(identity), keyHashes
}

// ResolveApiAccessRemarks resolves remarks for a batch of provider locators from config.toml.
func (s *ProviderService) ResolveApiAccessRemarks(queries []model.ApiAccessRemarkQuery) ([]string, error) {
	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return nil, err
	}

	results := make([]string, len(queries))
	for i, q := range queries {
		locator := model.ApiAccessRemarkLocator{
			ProviderName: q.ProviderName,
			BaseUrl:      q.BaseUrl,
			ApiKeys:      q.ApiKeys,
		}
		recordHash, keyHashes := apiAccessLocatorIdentity(q.ProviderSection, locator)
		if recordHash == "" {
			results[i] = ""
			continue
		}

		// Exact match by recordHash and keyHash
		found := false
		for _, entry := range cfg.ApiAccessRemarks {
			if entry.ProviderSection == q.ProviderSection && entry.RecordHash == recordHash {
				for _, kh := range keyHashes {
					if entry.ApiKeyHash == kh && entry.Remark != "" {
						results[i] = entry.Remark
						found = true
						break
					}
				}
			}
			if found {
				break
			}
		}

		// Fallback to keyHash only
		if !found {
			for _, entry := range cfg.ApiAccessRemarks {
				if entry.ProviderSection == q.ProviderSection && entry.RecordHash == "" {
					for _, kh := range keyHashes {
						if entry.ApiKeyHash == kh && entry.Remark != "" {
							results[i] = entry.Remark
							found = true
							break
						}
					}
				}
				if found {
					break
				}
			}
		}
	}

	return results, nil
}

// SaveApiAccessRemark saves or updates the remark for a provider in config.toml.
func (s *ProviderService) SaveApiAccessRemark(update model.ApiAccessRemarkUpdate) error {
	cfg, err := s.configManager.LoadGuiConfig()
	if err != nil {
		return err
	}

	section := strings.TrimSpace(update.ProviderSection)
	remark := strings.TrimSpace(update.Remark)

	// Collect record hashes to replace
	replaceHashes := make(map[string]bool)
	for _, prev := range update.PreviousRecords {
		rh, _ := apiAccessLocatorIdentity(section, prev)
		if rh != "" {
			replaceHashes[rh] = true
		}
	}
	for _, rec := range update.Records {
		rh, _ := apiAccessLocatorIdentity(section, rec)
		if rh != "" {
			replaceHashes[rh] = true
		}
	}

	// Filter out old entries for these record hashes
	var nextRemarks []model.GuiApiAccessRemark
	for _, entry := range cfg.ApiAccessRemarks {
		if entry.ProviderSection == section && replaceHashes[entry.RecordHash] {
			continue
		}
		nextRemarks = append(nextRemarks, entry)
	}

	// Add new remarks
	seenRecords := make(map[string]bool)
	for _, rec := range update.Records {
		rh, keyHashes := apiAccessLocatorIdentity(section, rec)
		if rh == "" || seenRecords[rh] {
			continue
		}
		seenRecords[rh] = true
		for _, kh := range keyHashes {
			nextRemarks = append(nextRemarks, model.GuiApiAccessRemark{
				ProviderSection: section,
				ApiKeyHash:      kh,
				RecordHash:      rh,
				Remark:          remark,
			})
		}
	}

	cfg.ApiAccessRemarks = nextRemarks
	return s.configManager.SaveGuiConfig(cfg)
}

// ProviderHealthProbe sends a test probe request with streaming enabled to measure latency.
func (s *ProviderService) ProviderHealthProbe(req model.ProviderHealthProbeRequest) (model.ProviderHealthProbeResponse, error) {
	for _, v := range req.Header {
		if strings.Contains(v, "$TOKEN$") {
			return model.ProviderHealthProbeResponse{
				Success: false,
				Error:   "missing-direct-key",
			}, nil
		}
	}

	targetUrl := strings.TrimSpace(req.Url)
	if targetUrl == "" {
		return model.ProviderHealthProbeResponse{
			Success: false,
			Error:   "目标 URL 为空",
		}, nil
	}

	timeout := 15 * time.Second
	if req.TimeoutMs != nil && *req.TimeoutMs > 0 {
		timeout = time.Duration(*req.TimeoutMs) * time.Millisecond
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetUrl, strings.NewReader(req.Data))
	if err != nil {
		return model.ProviderHealthProbeResponse{
			Success: false,
			Error:   fmt.Sprintf("创建探针请求失败: %v", err),
		}, nil
	}

	for k, v := range req.Header {
		httpReq.Header.Set(k, v)
	}
	if httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	probeClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}

	start := time.Now()
	resp, err := probeClient.Do(httpReq)
	if err != nil {
		isTimeout := ctx.Err() == context.DeadlineExceeded || strings.Contains(strings.ToLower(err.Error()), "timeout")
		return model.ProviderHealthProbeResponse{
			Success:  false,
			Error:    err.Error(),
			TimedOut: isTimeout,
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return model.ProviderHealthProbeResponse{
			Success: false,
			Error:   fmt.Sprintf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body))),
		}, nil
	}

	// Read stream line by line to detect first token
	reader := bufio.NewReader(io.LimitReader(resp.Body, 256*1024))
	var firstTokenLatencyMs *int

	for {
		line, err := reader.ReadString('\n')
		line = strings.TrimSpace(line)

		if line != "" {
			data := strings.TrimPrefix(line, "data:")
			data = strings.TrimSpace(data)
			if data != "" && data != "[DONE]" {
				if hasTextInStreamJson(req.Protocol, data) {
					if firstTokenLatencyMs == nil {
						ms := int(time.Since(start).Milliseconds())
						if ms < 1 {
							ms = 1
						}
						firstTokenLatencyMs = &ms
						break
					}
				}
			}
		}

		if err != nil {
			break
		}
	}

	totalLatency := int(time.Since(start).Milliseconds())
	if totalLatency < 1 {
		totalLatency = 1
	}

	return model.ProviderHealthProbeResponse{
		Success:             true,
		FirstTokenLatencyMs: firstTokenLatencyMs,
		ResponseLatencyMs:   totalLatency,
	}, nil
}

func hasTextInStreamJson(protocol string, data string) bool {
	var val map[string]any
	if err := json.Unmarshal([]byte(data), &val); err != nil {
		return false
	}

	switch protocol {
	case "openai-chat":
		choices, ok := val["choices"].([]any)
		if !ok || len(choices) == 0 {
			return false
		}
		for _, c := range choices {
			choiceMap, ok := c.(map[string]any)
			if !ok {
				continue
			}
			if delta, ok := choiceMap["delta"].(map[string]any); ok {
				for _, k := range []string{"content", "reasoning_content", "reasoning", "thinking"} {
					if text, ok := delta[k].(string); ok && strings.TrimSpace(text) != "" {
						return true
					}
				}
			}
			if msg, ok := choiceMap["message"].(map[string]any); ok {
				if text, ok := msg["content"].(string); ok && strings.TrimSpace(text) != "" {
					return true
				}
			}
		}
		return false

	case "openai-responses":
		t, _ := val["type"].(string)
		if strings.HasPrefix(t, "response.") {
			if delta, ok := val["delta"].(string); ok && strings.TrimSpace(delta) != "" {
				return true
			}
		}
		return false

	case "claude":
		if delta, ok := val["delta"].(map[string]any); ok {
			for _, k := range []string{"text", "thinking"} {
				if text, ok := delta[k].(string); ok && strings.TrimSpace(text) != "" {
					return true
				}
			}
		}
		return false

	case "gemini":
		if candidates, ok := val["candidates"].([]any); ok {
			for _, c := range candidates {
				cMap, ok := c.(map[string]any)
				if !ok {
					continue
				}
				if content, ok := cMap["content"].(map[string]any); ok {
					if parts, ok := content["parts"].([]any); ok {
						for _, p := range parts {
							if pMap, ok := p.(map[string]any); ok {
								if text, ok := pMap["text"].(string); ok && strings.TrimSpace(text) != "" {
									return true
								}
							}
						}
					}
				}
			}
		}
		return false

	default:
		return true
	}
}
