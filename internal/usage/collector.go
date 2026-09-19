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
	"sync/atomic"
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

	// Runtime collector status
	statusMu      sync.RWMutex
	statusState   string // "waiting-core" | "collecting" | "error"
	statusMessage string
	lastCollected *string
	totalRecords  uint64

	// Sticky queue key
	selectedQueueKey atomic.Value // string
}

func NewCollector(storage *Storage, onInserted func(count int)) *Collector {
	c := &Collector{
		storage:       storage,
		onInserted:    onInserted,
		statusState:   "waiting-core",
		statusMessage: "等待内核就绪",
	}
	c.selectedQueueKey.Store("usage")

	// Initialize initial record count
	if storage != nil {
		if cnt, err := storage.TotalRecords(); err == nil {
			c.totalRecords = cnt
		}
	}
	return c
}

func (c *Collector) Status() model.CollectorStatus {
	c.statusMu.RLock()
	defer c.statusMu.RUnlock()

	var lastCollected *string
	if c.lastCollected != nil {
		cpy := *c.lastCollected
		lastCollected = &cpy
	}

	return model.CollectorStatus{
		State:           c.statusState,
		Message:         c.statusMessage,
		LastCollectedAt: lastCollected,
		TotalRecords:    c.totalRecords,
	}
}

func (c *Collector) setStatus(state, msg string) {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	c.statusState = state
	c.statusMessage = msg
}

func (c *Collector) markCollected(inserted int) {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	now := time.Now().Format(time.RFC3339)
	c.lastCollected = &now
	if inserted > 0 {
		c.totalRecords += uint64(inserted)
	}
	c.statusState = "collecting"
	c.statusMessage = fmt.Sprintf("已采集记录，当前累计 %d 条", c.totalRecords)
}

// UpdateConfig updates the target management port and auth key.
func (c *Collector) UpdateConfig(port int, secretKey string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.port != port || c.secretKey != secretKey {
		c.port = port
		c.secretKey = secretKey
	}
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
	var (
		activeSubConn   net.Conn
		activeSubReader *bufio.Reader
		subPort         int
		subSecret       string
		subRetryAt      time.Time
		lastCleanupAt   time.Time
		backoffSec      = 1
	)

	cleanupSub := func() {
		if activeSubConn != nil {
			_ = activeSubConn.Close()
			activeSubConn = nil
			activeSubReader = nil
		}
	}
	defer cleanupSub()

	for {
		if ctx.Err() != nil {
			return
		}

		c.mu.Lock()
		currentPort := c.port
		currentSecret := c.secretKey
		c.mu.Unlock()

		// Detect configuration drift (port or secret changed)
		if subPort != currentPort || subSecret != currentSecret {
			cleanupSub()
			subPort = currentPort
			subSecret = currentSecret
			subRetryAt = time.Now()
		}

		now := time.Now()

		// 1. Hourly inbox cleanup
		if now.Sub(lastCleanupAt) >= time.Hour {
			_ = c.storage.cleanupInbox()
			lastCleanupAt = now
		}

		// 2. Process inbox every round
		if inserted, deleted, err := c.storage.ProcessInbox(500); err == nil {
			if inserted > 0 || deleted > 0 {
				c.markCollected(inserted)
				if c.onInserted != nil {
					c.onInserted(inserted)
				}
			}
		}

		// 3. Core ready check
		if currentPort <= 0 {
			cleanupSub()
			c.setStatus("waiting-core", "等待内核就绪 (端口未分配)")
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
				continue
			}
		}

		// 4. Try establishing RESP subscription if not active
		if activeSubConn == nil && now.After(subRetryAt) {
			conn, reader, err := c.connectSubscription(currentPort, currentSecret)
			if err == nil {
				activeSubConn = conn
				activeSubReader = reader
				c.setStatus("collecting", "已连接 CPA usage 实时订阅")
				// Drain any backlog in queue
				_ = c.backfillQueue(currentPort, currentSecret)
				backoffSec = 1
				continue
			}
			// Subscription failed, retry in 30s and fall back to queue pulling
			subRetryAt = now.Add(30 * time.Second)
			c.setStatus("collecting", fmt.Sprintf("使用队列/HTTP 兼容模式采集 (实时订阅将在 30 秒后重试: %v)", err))
		}

		// 5. If subscription is active, read stream with 2s timeout
		if activeSubConn != nil {
			msg, err := c.readSubscriptionMessage(activeSubConn, activeSubReader)
			if err == nil {
				if msg != "" && !IsIgnorableUsageMessage(msg) {
					_, _ = c.storage.EnqueueRawMessages("redis_subscribe:usage", []string{msg})
					if ins, _, err := c.storage.ProcessInbox(100); err == nil && ins > 0 {
						c.markCollected(ins)
						if c.onInserted != nil {
							c.onInserted(ins)
						}
					}
				}
				backoffSec = 1
				continue
			}

			// Check if read timed out (heartbeat) or real disconnect
			if nErr, ok := err.(net.Error); ok && nErr.Timeout() {
				// 2s timeout is expected heartbeat
				continue
			}

			// Connection severed
			cleanupSub()
			subRetryAt = time.Now().Add(30 * time.Second)
			c.setStatus("collecting", fmt.Sprintf("实时订阅断开，已切换队列兼容模式: %v", err))
		}

		// 6. Fallback queue pull via LPOP / HTTP
		msgs, source, err := c.pullQueue(currentPort, currentSecret)
		if err == nil && len(msgs) > 0 {
			_, _ = c.storage.EnqueueRawMessages(source, msgs)
			if ins, _, err := c.storage.ProcessInbox(500); err == nil && ins > 0 {
				c.markCollected(ins)
				if c.onInserted != nil {
					c.onInserted(ins)
				}
			}
			backoffSec = 1
		} else if err != nil {
			c.setStatus("error", fmt.Sprintf("队列采集失败: %v", err))
			// Backoff: 1s -> 2s -> 4s -> 8s -> 10s
			backoffSec = backoffSec * 2
			if backoffSec > 10 {
				backoffSec = 10
			}
		} else {
			// Empty queue, normal idle
			backoffSec = 1
		}

		// Wait backoff duration or until cancelled
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(backoffSec) * time.Second):
		}
	}
}

func (c *Collector) connectSubscription(port int, secretKey string) (net.Conn, *bufio.Reader, error) {
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return nil, nil, err
	}

	reader := bufio.NewReader(conn)
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	// Send AUTH
	if secretKey != "" {
		if _, err := fmt.Fprintf(conn, "*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(secretKey), secretKey); err != nil {
			_ = conn.Close()
			return nil, nil, err
		}
		authResp, err := reader.ReadString('\n')
		if err != nil || !strings.HasPrefix(authResp, "+") {
			_ = conn.Close()
			return nil, nil, fmt.Errorf("AUTH 认证失败: %s", strings.TrimSpace(authResp))
		}
	}

	// Send SUBSCRIBE usage
	if _, err := fmt.Fprintf(conn, "*2\r\n$9\r\nSUBSCRIBE\r\n$5\r\nusage\r\n"); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}

	// Read subscription ack
	ackLine, err := reader.ReadString('\n')
	if err != nil || (!strings.HasPrefix(ackLine, "*") && !strings.HasPrefix(ackLine, "+")) {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("SUBSCRIBE usage 响应失败: %s", strings.TrimSpace(ackLine))
	}

	return conn, reader, nil
}

func (c *Collector) readSubscriptionMessage(conn net.Conn, reader *bufio.Reader) (string, error) {
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}

	line = strings.TrimSpace(line)
	if strings.HasPrefix(line, "-") {
		return "", fmt.Errorf("RESP error: %s", line)
	}

	// Message frame is an array of 3 elements: *3\r\n$7\r\nmessage\r\n$5\r\nusage\r\n${len}\r\n{payload}\r\n
	if !strings.HasPrefix(line, "*") {
		return "", nil // Skip non-array frames
	}

	countStr := strings.TrimPrefix(line, "*")
	count, err := strconv.Atoi(countStr)
	if err != nil || count != 3 {
		return "", nil
	}

	// Read element 1 ($7 message)
	el1, err := readBulkString(reader)
	if err != nil || !strings.EqualFold(el1, "message") {
		return "", nil
	}

	// Read element 2 ($5 usage)
	el2, err := readBulkString(reader)
	if err != nil || !strings.EqualFold(el2, "usage") {
		return "", nil
	}

	// Read element 3 (payload)
	payload, err := readBulkString(reader)
	if err != nil {
		return "", err
	}

	return payload, nil
}

func (c *Collector) backfillQueue(port int, secretKey string) error {
	msgs, source, err := c.pullQueue(port, secretKey)
	if err == nil && len(msgs) > 0 {
		_, _ = c.storage.EnqueueRawMessages(source, msgs)
	}
	return err
}

func (c *Collector) pullQueue(port int, secretKey string) ([]string, string, error) {
	// Try LPOP via TCP RESP first
	selectedKey := c.selectedQueueKey.Load().(string)
	msgs, err := c.pullViaRESPWithKey(port, secretKey, selectedKey)
	if err == nil {
		return msgs, "redis_pull:" + selectedKey, nil
	}

	// If error indicates unsupported key, try legacy "queue"
	errStr := strings.ToLower(err.Error())
	if strings.Contains(errStr, "unsupported channel") || strings.Contains(errStr, "unsupported queue") {
		legacyKey := "queue"
		if selectedKey == "queue" {
			legacyKey = "usage"
		}
		if legacyMsgs, lErr := c.pullViaRESPWithKey(port, secretKey, legacyKey); lErr == nil {
			c.selectedQueueKey.Store(legacyKey)
			return legacyMsgs, "redis_pull:" + legacyKey, nil
		}
	}

	// Fall back to HTTP GET /v0/management/usage-queue
	httpMsgs, hErr := c.pullViaHTTP(port, secretKey)
	if hErr == nil {
		return httpMsgs, "http_pull:usage_queue", nil
	}

	return nil, "", fmt.Errorf("RESP(%v) / HTTP(%v)", err, hErr)
}

func (c *Collector) pullViaRESPWithKey(port int, secretKey, queueKey string) ([]string, error) {
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(4 * time.Second))
	reader := bufio.NewReader(conn)

	if secretKey != "" {
		if _, err := fmt.Fprintf(conn, "*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(secretKey), secretKey); err != nil {
			return nil, err
		}
		authResp, err := reader.ReadString('\n')
		if err != nil || !strings.HasPrefix(authResp, "+") {
			return nil, fmt.Errorf("RESP AUTH 失败: %s", strings.TrimSpace(authResp))
		}
	}

	// LPOP <key> 10000
	if _, err := fmt.Fprintf(conn, "*3\r\n$4\r\nLPOP\r\n$%d\r\n%s\r\n$5\r\n10000\r\n", len(queueKey), queueKey); err != nil {
		return nil, err
	}

	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	line = strings.TrimSpace(line)
	if strings.HasPrefix(line, "-") {
		return nil, fmt.Errorf("RESP error: %s", line)
	}
	if line == "*-1" || line == "$-1" {
		return nil, nil // Nil response
	}

	// Handle single bulk string
	if strings.HasPrefix(line, "$") {
		strLen, err := strconv.Atoi(strings.TrimPrefix(line, "$"))
		if err != nil || strLen < 0 {
			return nil, nil
		}
		buf := make([]byte, strLen)
		if _, err := io.ReadFull(reader, buf); err != nil {
			return nil, err
		}
		_, _ = reader.Discard(2)
		return []string{string(buf)}, nil
	}

	if !strings.HasPrefix(line, "*") {
		return nil, fmt.Errorf("未知 RESP 响应头: %s", line)
	}

	countStr := strings.TrimPrefix(line, "*")
	count, err := strconv.Atoi(countStr)
	if err != nil || count <= 0 {
		return nil, nil
	}

	var results []string
	for i := 0; i < count; i++ {
		str, err := readBulkString(reader)
		if err != nil {
			break
		}
		results = append(results, str)
	}
	return results, nil
}

func (c *Collector) pullViaHTTP(port int, secretKey string) ([]string, error) {
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

	var results []string
	for _, it := range rawItems {
		results = append(results, string(it))
	}
	return results, nil
}

func readBulkString(reader *bufio.Reader) (string, error) {
	lenLine, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	lenLine = strings.TrimSpace(lenLine)
	if !strings.HasPrefix(lenLine, "$") {
		return "", fmt.Errorf("期望 Bulk String 长度指示符 '$', 收到: %s", lenLine)
	}
	strLen, err := strconv.Atoi(strings.TrimPrefix(lenLine, "$"))
	if err != nil || strLen < 0 {
		return "", nil
	}

	buf := make([]byte, strLen)
	if _, err := io.ReadFull(reader, buf); err != nil {
		return "", err
	}
	_, _ = reader.Discard(2) // \r\n
	return string(buf), nil
}
