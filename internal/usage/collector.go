package usage

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"easycliproxyapi/internal/model"
)

type Collector struct {
	storage    *Storage
	port       int
	secretKey  string
	mu         sync.Mutex
	running    bool
	cancelFn   context.CancelFunc
	onInserted func(count int)
}

func NewCollector(storage *Storage, onInserted func(count int)) *Collector {
	return &Collector{
		storage:    storage,
		onInserted: onInserted,
	}
}

// UpdateConfig updates the target management port and auth key.
func (c *Collector) UpdateConfig(port int, secretKey string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.port = port
	c.secretKey = secretKey
}

// Start begins background collection.
func (c *Collector) Start() {
	c.mu.Lock()
	if c.running {
		c.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.cancelFn = cancel
	c.running = true
	c.mu.Unlock()

	go c.runLoop(ctx)
}

// Stop terminates background collection.
func (c *Collector) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cancelFn != nil {
		c.cancelFn()
		c.cancelFn = nil
	}
	c.running = false
}

func (c *Collector) runLoop(ctx context.Context) {
	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.mu.Lock()
			port := c.port
			key := c.secretKey
			c.mu.Unlock()

			if port <= 0 {
				continue
			}

			// Try LPOP via TCP RESP, fallback to HTTP
			records, err := c.pullViaRESP(port, key)
			if err != nil {
				// Fallback to HTTP
				records, _ = c.pullViaHTTP(port, key)
			}

			if len(records) > 0 {
				inserted, err := c.storage.InsertBatch(records)
				if err == nil && inserted > 0 && c.onInserted != nil {
					c.onInserted(inserted)
				}
			}
		}
	}
}

// pullViaRESP connects via raw TCP and sends LPOP usage 10000.
func (c *Collector) pullViaRESP(port int, secretKey string) ([]model.UsageRecord, error) {
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(4 * time.Second))
	reader := bufio.NewReader(conn)

	// Send AUTH if key provided
	if secretKey != "" {
		_, err := fmt.Fprintf(conn, "*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(secretKey), secretKey)
		if err != nil {
			return nil, err
		}
		authResp, err := reader.ReadString('\n')
		if err != nil || !strings.HasPrefix(authResp, "+") {
			return nil, fmt.Errorf("RESP AUTH 失败: %s", authResp)
		}
	}

	// Try LPOP usage 10000
	_, err = fmt.Fprintf(conn, "*3\r\n$4\r\nLPOP\r\n$5\r\nusage\r\n$5\r\n10000\r\n")
	if err != nil {
		return nil, err
	}

	return parseRESPArray(reader)
}

func parseRESPArray(reader *bufio.Reader) ([]model.UsageRecord, error) {
	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	line = strings.TrimSpace(line)
	if strings.HasPrefix(line, "-") {
		return nil, fmt.Errorf("RESP 错误: %s", line)
	}
	if line == "*-1" || line == "$-1" {
		return nil, nil // Nil response
	}

	if !strings.HasPrefix(line, "*") {
		return nil, fmt.Errorf("未知响应头: %s", line)
	}

	countStr := strings.TrimPrefix(line, "*")
	count, err := strconv.Atoi(countStr)
	if err != nil || count <= 0 {
		return nil, nil
	}

	var records []model.UsageRecord
	for i := 0; i < count; i++ {
		// Read bulk string length
		lenLine, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		lenLine = strings.TrimSpace(lenLine)
		if !strings.HasPrefix(lenLine, "$") {
			continue
		}
		strLen, err := strconv.Atoi(strings.TrimPrefix(lenLine, "$"))
		if err != nil || strLen < 0 {
			continue
		}

		// Read payload + \r\n
		payloadBuf := make([]byte, strLen)
		if _, err := io.ReadFull(reader, payloadBuf); err != nil {
			break
		}
		// Discard trailing \r\n
		_, _ = reader.Discard(2)

		if record, ok := parseUsageJSON(payloadBuf); ok {
			records = append(records, record)
		}
	}

	return records, nil
}

// pullViaHTTP falls back to GET /v0/management/usage-queue.
func (c *Collector) pullViaHTTP(port int, secretKey string) ([]model.UsageRecord, error) {
	url := fmt.Sprintf("http://127.0.0.1:%d/v0/management/usage-queue?count=10000", port)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	if secretKey != "" {
		req.Header.Set("Authorization", "Bearer "+secretKey)
	}

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP 状态码: %d", resp.StatusCode)
	}

	var rawItems []json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&rawItems); err != nil {
		return nil, err
	}

	var records []model.UsageRecord
	for _, item := range rawItems {
		if r, ok := parseUsageJSON(item); ok {
			records = append(records, r)
		}
	}
	return records, nil
}

func parseUsageJSON(data []byte) (model.UsageRecord, bool) {
	var raw struct {
		Id               string  `json:"id"`
		RequestId        string  `json:"request_id"`
		Timestamp        int64   `json:"timestamp"`
		CreatedAt        int64   `json:"created_at"`
		Model            string  `json:"model"`
		Provider         string  `json:"provider"`
		PromptTokens     int     `json:"prompt_tokens"`
		InputTokens      int     `json:"input_tokens"`
		CompletionTokens int     `json:"completion_tokens"`
		OutputTokens     int     `json:"output_tokens"`
		TotalTokens      int     `json:"total_tokens"`
		DurationMs       int     `json:"duration_ms"`
		StatusCode       int     `json:"status_code"`
		Cost             float64 `json:"cost"`
	}

	if err := json.Unmarshal(data, &raw); err != nil {
		return model.UsageRecord{}, false
	}

	id := raw.Id
	if id == "" {
		id = raw.RequestId
	}
	if id == "" {
		return model.UsageRecord{}, false
	}

	ts := raw.Timestamp
	if ts <= 0 {
		ts = raw.CreatedAt
	}
	if ts <= 0 {
		ts = time.Now().Unix()
	}

	prompt := raw.PromptTokens
	if prompt <= 0 {
		prompt = raw.InputTokens
	}

	completion := raw.CompletionTokens
	if completion <= 0 {
		completion = raw.OutputTokens
	}

	total := raw.TotalTokens
	if total <= 0 {
		total = prompt + completion
	}

	return model.UsageRecord{
		Id:               id,
		Timestamp:        ts,
		TimeFormatted:    time.Unix(ts, 0).Format("2006-01-02 15:04:05"),
		Model:            raw.Model,
		Provider:         raw.Provider,
		PromptTokens:     prompt,
		CompletionTokens: completion,
		TotalTokens:      total,
		DurationMs:       raw.DurationMs,
		StatusCode:       raw.StatusCode,
		Cost:             raw.Cost,
	}, true
}
