package usage

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"easycliproxyapi/internal/core"
	"easycliproxyapi/internal/model"
)

type Storage struct {
	dbPath string
	db     *sql.DB
	mu     sync.RWMutex
}

func DbPath() string {
	return filepath.Join(core.BaseDir(), "usage-records", "usage.db")
}

func NewStorage(dbPath string) (*Storage, error) {
	if dbPath == "" {
		dbPath = DbPath()
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, err
	}

	// SQLite connection with WAL mode and busy timeout
	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)")
	if err != nil {
		return nil, fmt.Errorf("打开 SQLite 数据库失败: %w", err)
	}

	s := &Storage{
		dbPath: dbPath,
		db:     db,
	}

	if err := s.initSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}

	// Run cleanup on inbox at startup
	_ = s.cleanupInbox()

	return s, nil
}

func (s *Storage) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Storage) DB() *sql.DB {
	return s.db
}

func (s *Storage) DbPath() string {
	return s.dbPath
}

func (s *Storage) initSchema() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	queries := []string{
		`CREATE TABLE IF NOT EXISTS usage_metadata (
			key   TEXT PRIMARY KEY NOT NULL,
			value TEXT NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS usage_inbox (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			source          TEXT NOT NULL,
			message_hash    TEXT NOT NULL,
			raw_message     TEXT NOT NULL,
			status          TEXT NOT NULL DEFAULT 'pending',
			attempt_count   INTEGER NOT NULL DEFAULT 0,
			last_error      TEXT NOT NULL DEFAULT '',
			usage_event_key TEXT NOT NULL DEFAULT '',
			received_at     TEXT NOT NULL,
			processed_at    TEXT,
			created_at      TEXT NOT NULL,
			updated_at      TEXT NOT NULL
		);`,

		`CREATE INDEX IF NOT EXISTS idx_usage_inbox_status_id ON usage_inbox(status, id);`,

		`CREATE TABLE IF NOT EXISTS usage_events (
			id                    INTEGER PRIMARY KEY AUTOINCREMENT,
			event_key             TEXT NOT NULL,
			timestamp             TEXT NOT NULL,
			timestamp_ms          INTEGER NOT NULL,
			local_hour            TEXT NOT NULL,
			latency_ms            INTEGER NOT NULL DEFAULT 0,
			ttft_ms               INTEGER,
			source                TEXT NOT NULL DEFAULT '',
			auth_index            TEXT NOT NULL DEFAULT '',
			failed                INTEGER NOT NULL DEFAULT 0,
			canceled              INTEGER NOT NULL DEFAULT 0,
			failure_status        INTEGER NOT NULL DEFAULT 0,
			failure_body          TEXT NOT NULL DEFAULT '',
			provider              TEXT NOT NULL DEFAULT '',
			model                 TEXT NOT NULL DEFAULT '',
			alias                 TEXT NOT NULL DEFAULT '',
			reasoning_effort      TEXT NOT NULL DEFAULT '',
			service_tier          TEXT NOT NULL DEFAULT '',
			response_service_tier TEXT NOT NULL DEFAULT '',
			executor_type         TEXT NOT NULL DEFAULT '',
			endpoint              TEXT NOT NULL DEFAULT '',
			auth_type             TEXT NOT NULL DEFAULT '',
			api_key_hash          TEXT NOT NULL DEFAULT '',
			api_key_display       TEXT NOT NULL DEFAULT '',
			api_key_remark        TEXT NOT NULL DEFAULT '',
			request_id            TEXT NOT NULL DEFAULT '',
			api_group_key         TEXT NOT NULL DEFAULT '',
			model_alias           TEXT,
			client_ip             TEXT,
			x_forwarded_for       TEXT,
			user_agent            TEXT,
			generate              INTEGER NOT NULL DEFAULT 1,
			cached_tokens         INTEGER NOT NULL DEFAULT 0,
			collector_source      TEXT NOT NULL DEFAULT '',
			input_tokens          INTEGER NOT NULL DEFAULT 0,
			output_tokens         INTEGER NOT NULL DEFAULT 0,
			reasoning_tokens      INTEGER NOT NULL DEFAULT 0,
			cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
			cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens          INTEGER NOT NULL DEFAULT 0,
			created_at            TEXT NOT NULL
		);`,

		`CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp_ms DESC, id DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_event_key ON usage_events(event_key);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_local_hour ON usage_events(local_hour, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_model_timestamp ON usage_events(model, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_provider_timestamp ON usage_events(provider, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_source_timestamp ON usage_events(source, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_timestamp ON usage_events(api_key_hash, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_failed_timestamp ON usage_events(failed, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_api_group_timestamp ON usage_events(api_group_key, timestamp_ms DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_canceled_timestamp ON usage_events(canceled, timestamp_ms DESC);`,

		`CREATE TABLE IF NOT EXISTS model_prices (
			model                     TEXT PRIMARY KEY NOT NULL,
			prompt_per_1m             REAL NOT NULL DEFAULT 0,
			completion_per_1m         REAL NOT NULL DEFAULT 0,
			cache_per_1m              REAL NOT NULL DEFAULT 0,
			cache_read_per_1m         REAL NOT NULL DEFAULT 0,
			cache_creation_per_1m     REAL NOT NULL DEFAULT 0,
			prompt_configured         INTEGER NOT NULL DEFAULT 0,
			completion_configured     INTEGER NOT NULL DEFAULT 0,
			cache_read_configured     INTEGER NOT NULL DEFAULT 0,
			cache_creation_configured INTEGER NOT NULL DEFAULT 0,
			source                    TEXT NOT NULL DEFAULT '',
			source_model_id           TEXT NOT NULL DEFAULT '',
			updated_at_ms             INTEGER NOT NULL DEFAULT 0
		);`,
	}

	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("初始化 Schema 失败 (%s): %w", q, err)
		}
	}

	return nil
}

// TotalRecords returns the current count of usage_events.
func (s *Storage) TotalRecords() (uint64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int64
	err := s.db.QueryRow("SELECT COUNT(*) FROM usage_events").Scan(&count)
	if err != nil {
		return 0, err
	}
	if count < 0 {
		count = 0
	}
	return uint64(count), nil
}

// EnqueueRawMessages adds incoming usage messages to usage_inbox.
func (s *Storage) EnqueueRawMessages(source string, rawMsgs []string) (int, error) {
	if len(rawMsgs) == 0 {
		return 0, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(`
		INSERT INTO usage_inbox (source, message_hash, raw_message, status, received_at, created_at, updated_at)
		VALUES (?, ?, ?, 'pending', ?, ?, ?)
	`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	now := time.Now().Format(time.RFC3339)
	enqueued := 0

	for _, msg := range rawMsgs {
		msg = strings.TrimSpace(msg)
		if IsIgnorableUsageMessage(msg) {
			continue
		}

		hash := sha256Hex(msg)
		if _, err := stmt.Exec(source, hash, msg, now, now, now); err == nil {
			enqueued++
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return enqueued, nil
}

// ProcessInbox takes pending inbox items, normalizes them, and commits them to usage_events.
func (s *Storage) ProcessInbox(limit int) (inserted int, deleted uint64, err error) {
	if limit <= 0 {
		limit = 500
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`
		SELECT id, source, raw_message, attempt_count
		FROM usage_inbox
		WHERE status IN ('pending', 'process_failed') AND attempt_count < 5
		ORDER BY id ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	type inboxItem struct {
		id           int64
		source       string
		rawMsg       string
		attemptCount int
	}

	var items []inboxItem
	for rows.Next() {
		var it inboxItem
		if err := rows.Scan(&it.id, &it.source, &it.rawMsg, &it.attemptCount); err == nil {
			items = append(items, it)
		}
	}
	rows.Close()

	if len(items) == 0 {
		del, _ := s.enforceLimitLocked()
		return 0, del, nil
	}

	now := time.Now().Format(time.RFC3339)

	tx, err := s.db.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer func() { _ = tx.Rollback() }()

	stmtInsertEvent, err := tx.Prepare(`
		INSERT INTO usage_events (
			event_key, timestamp, timestamp_ms, local_hour, latency_ms, ttft_ms,
			source, auth_index, failed, canceled, failure_status, failure_body,
			provider, model, alias, reasoning_effort, service_tier, response_service_tier,
			executor_type, endpoint, auth_type, api_key_hash, api_key_display, api_key_remark,
			request_id, api_group_key, model_alias, client_ip, x_forwarded_for, user_agent,
			generate, cached_tokens, collector_source, input_tokens, output_tokens,
			reasoning_tokens, cache_read_tokens, cache_creation_tokens, total_tokens, created_at
		) VALUES (
			?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?, ?, ?
		)
	`)
	if err != nil {
		return 0, 0, err
	}
	defer stmtInsertEvent.Close()

	stmtUpdateInboxSuccess, err := tx.Prepare(`
		UPDATE usage_inbox
		SET status = 'processed', attempt_count = attempt_count + 1, last_error = '',
			usage_event_key = ?, processed_at = ?, updated_at = ?
		WHERE id = ?
	`)
	if err != nil {
		return 0, 0, err
	}
	defer stmtUpdateInboxSuccess.Close()

	stmtUpdateInboxFail, err := tx.Prepare(`
		UPDATE usage_inbox
		SET status = CASE WHEN attempt_count + 1 >= 5 THEN 'discarded' ELSE 'process_failed' END,
			attempt_count = attempt_count + 1, last_error = ?, updated_at = ?
		WHERE id = ?
	`)
	if err != nil {
		return 0, 0, err
	}
	defer stmtUpdateInboxFail.Close()

	stmtUpdateInboxDecodeFail, err := tx.Prepare(`
		UPDATE usage_inbox
		SET status = 'decode_failed', attempt_count = attempt_count + 1,
			last_error = ?, processed_at = ?, updated_at = ?
		WHERE id = ?
	`)
	if err != nil {
		return 0, 0, err
	}
	defer stmtUpdateInboxDecodeFail.Close()

	for _, it := range items {
		record, ok, decodeErr := parseAndNormalizeUsageRecord(it.rawMsg, it.source)
		if !ok {
			errMsg := "JSON 解析失败"
			if decodeErr != nil {
				errMsg = truncateString(decodeErr.Error(), 1000)
			}
			_, _ = stmtUpdateInboxDecodeFail.Exec(errMsg, now, now, it.id)
			continue
		}

		// Insert record into usage_events
		_, err := stmtInsertEvent.Exec(
			record.Id, record.Timestamp, parseTimestampMs(record.Timestamp), parseLocalHour(record.Timestamp),
			record.LatencyMs, record.TtftMs,
			record.Source, record.AuthIndex, boolToInt(record.Failed), boolToInt(record.Canceled),
			record.FailureStatus, truncateString(record.FailureBody, 2000),
			record.Provider, record.Model, record.Alias, record.ReasoningEffort,
			record.ServiceTier, record.ResponseServiceTier, record.ExecutorType, record.Endpoint,
			record.AuthType, record.ApiKeyHash, record.ApiKeyDisplay, record.ApiKeyRemark,
			record.RequestId, record.ApiGroupKey, record.ModelAlias, record.ClientIp,
			record.XForwardedFor, record.UserAgent, boolToInt(record.Generate), record.CachedTokens,
			record.CollectorSource, record.InputTokens, record.OutputTokens, record.ReasoningTokens,
			record.CacheReadTokens, record.CacheCreationTokens, record.TotalTokens, now,
		)
		if err != nil {
			errMsg := truncateString(err.Error(), 1000)
			_, _ = stmtUpdateInboxFail.Exec(errMsg, now, it.id)
			continue
		}

		_, _ = stmtUpdateInboxSuccess.Exec(record.Id, now, now, it.id)
		inserted++
	}

	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}

	del, _ := s.enforceLimitLocked()
	return inserted, del, nil
}

func (s *Storage) cleanupInbox() error {
	todayStart := time.Now().Truncate(24 * time.Hour).Format(time.RFC3339)
	sevenDaysAgo := time.Now().Add(-7 * 24 * time.Hour).Format(time.RFC3339)

	_, _ = s.db.Exec("DELETE FROM usage_inbox WHERE status = 'processed' AND processed_at < ?", todayStart)
	_, _ = s.db.Exec("DELETE FROM usage_inbox WHERE status IN ('decode_failed', 'discarded') AND updated_at < ?", sevenDaysAgo)
	return nil
}

// Build SQL filter for UsageQuery
type usageSqlFilter struct {
	clause string
	params []any
}

func buildUsageFilter(q model.UsageQuery) usageSqlFilter {
	var conds []string
	var params []any

	if q.Start != nil && *q.Start != "" {
		if startMs := parseTimeQueryMs(*q.Start); startMs > 0 {
			conds = append(conds, "timestamp_ms >= ?")
			params = append(params, startMs)
		}
	}
	if q.End != nil && *q.End != "" {
		if endMs := parseTimeQueryMs(*q.End); endMs > 0 {
			conds = append(conds, "timestamp_ms <= ?")
			params = append(params, endMs)
		}
	}
	if q.Model != nil && strings.TrimSpace(*q.Model) != "" {
		conds = append(conds, "model = ? COLLATE NOCASE")
		params = append(params, strings.TrimSpace(*q.Model))
	}
	if q.Provider != nil && strings.TrimSpace(*q.Provider) != "" {
		conds = append(conds, "provider = ? COLLATE NOCASE")
		params = append(params, strings.TrimSpace(*q.Provider))
	}
	if q.Source != nil && strings.TrimSpace(*q.Source) != "" {
		conds = append(conds, "source = ? COLLATE NOCASE")
		params = append(params, strings.TrimSpace(*q.Source))
	}
	if q.ApiKeyHash != nil && strings.TrimSpace(*q.ApiKeyHash) != "" {
		conds = append(conds, "api_key_hash = ? COLLATE NOCASE")
		params = append(params, strings.TrimSpace(*q.ApiKeyHash))
	}
	if q.Failed != nil {
		if *q.Failed {
			conds = append(conds, "failed != 0 AND canceled = 0")
		} else {
			conds = append(conds, "failed = 0")
		}
	}
	if q.Canceled != nil {
		if *q.Canceled {
			conds = append(conds, "canceled != 0")
		} else {
			conds = append(conds, "canceled = 0")
		}
	}

	clause := ""
	if len(conds) > 0 {
		clause = " WHERE " + strings.Join(conds, " AND ")
	}
	return usageSqlFilter{clause: clause, params: params}
}

// LoadOverview calculates aggregate performance metrics and timeline series.
func (s *Storage) LoadOverview(q model.UsageQuery) (model.UsageOverview, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	filter := buildUsageFilter(q)

	summarySql := fmt.Sprintf(`
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN failed != 0 AND canceled = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN canceled != 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(reasoning_tokens), 0),
			COALESCE(SUM(cache_read_tokens), 0),
			COALESCE(SUM(cache_creation_tokens), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(latency_ms), 0),
			COALESCE(
				SUM(CASE
					WHEN generate != 0 AND failed = 0 AND canceled = 0 AND output_tokens > 0 AND latency_ms > 0
					THEN output_tokens ELSE 0 END) * 1000.0
				/ NULLIF(SUM(CASE
					WHEN generate != 0 AND failed = 0 AND canceled = 0 AND output_tokens > 0 AND latency_ms > 0
					THEN latency_ms ELSE 0 END), 0),
				0.0
			),
			COALESCE(SUM(CASE
				WHEN generate != 0 AND failed = 0 AND canceled = 0 AND output_tokens > 0 AND latency_ms > 0
				THEN 1 ELSE 0 END), 0),
			MIN(timestamp_ms),
			MAX(timestamp_ms)
		FROM usage_events%s
	`, filter.clause)

	var (
		totalRequests       int64
		successCount        int64
		failureCount        int64
		canceledCount       int64
		inputTokens         int64
		outputTokens        int64
		reasoningTokens     int64
		cacheReadTokens     int64
		cacheCreationTokens int64
		totalTokens         int64
		latencySum          int64
		tps                 float64
		tpsSampleCount      int64
		minTimestamp        sql.NullInt64
		maxTimestamp        sql.NullInt64
	)

	err := s.db.QueryRow(summarySql, filter.params...).Scan(
		&totalRequests, &successCount, &failureCount, &canceledCount,
		&inputTokens, &outputTokens, &reasoningTokens,
		&cacheReadTokens, &cacheCreationTokens, &totalTokens,
		&latencySum, &tps, &tpsSampleCount, &minTimestamp, &maxTimestamp,
	)
	if err != nil {
		return model.UsageOverview{}, fmt.Errorf("统计 SQLite 使用记录失败: %w", err)
	}

	// Calculate timeline with 30-minute buckets
	timelineSql := fmt.Sprintf(`
		SELECT
			CASE
				WHEN timestamp_ms > 0 THEN
					strftime('%%Y-%%m-%%d-%%H-', datetime(timestamp_ms / 1000, 'unixepoch', 'localtime'))
					|| CASE
						WHEN CAST(strftime('%%M', datetime(timestamp_ms / 1000, 'unixepoch', 'localtime')) AS INTEGER) < 30
						THEN '00'
						ELSE '30'
					END
				ELSE local_hour || '-00'
			END,
			COALESCE(NULLIF(TRIM(model), ''), 'unknown'),
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN failed != 0 AND canceled = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN canceled != 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0)
		FROM usage_events%s
		GROUP BY 1, 2
		ORDER BY 1 ASC, 2 ASC
	`, filter.clause)

	tlRows, err := s.db.Query(timelineSql, filter.params...)
	if err != nil {
		return model.UsageOverview{}, fmt.Errorf("查询 SQLite 使用趋势失败: %w", err)
	}
	defer tlRows.Close()

	grouped := make(map[string]*model.UsageTimelinePoint)
	var bucketOrder []string

	for tlRows.Next() {
		var (
			hour     string
			mod      string
			requests int64
			success  int64
			failure  int64
			canceled int64
			tokens   int64
		)
		if err := tlRows.Scan(&hour, &mod, &requests, &success, &failure, &canceled, &tokens); err == nil {
			pt, exists := grouped[hour]
			if !exists {
				pt = &model.UsageTimelinePoint{Hour: hour}
				grouped[hour] = pt
				bucketOrder = append(bucketOrder, hour)
			}
			pt.Requests += requests
			pt.Success += success
			pt.Failure += failure
			pt.Canceled += canceled
			pt.Tokens += tokens

			foundModel := false
			for i := range pt.Models {
				if pt.Models[i].Key == mod {
					pt.Models[i].Requests += requests
					pt.Models[i].Tokens += tokens
					foundModel = true
					break
				}
			}
			if !foundModel {
				pt.Models = append(pt.Models, model.UsageTimelineModel{
					Key:      mod,
					Label:    mod,
					Tokens:   tokens,
					Requests: requests,
				})
			}
		}
	}
	tlRows.Close()

	var timeline []model.UsageTimelinePoint
	for _, hour := range bucketOrder {
		if pt, ok := grouped[hour]; ok {
			timeline = append(timeline, *pt)
		}
	}

	// Calculate cost
	estimatedCost, pricedRequests := s.loadEstimatedCostLocked(filter)

	overview := model.UsageOverview{
		TotalRequests:       totalRequests,
		SuccessCount:        successCount,
		FailureCount:        failureCount,
		CanceledCount:       canceledCount,
		InputTokens:         inputTokens,
		OutputTokens:        outputTokens,
		ReasoningTokens:     reasoningTokens,
		CacheReadTokens:     cacheReadTokens,
		CacheCreationTokens: cacheCreationTokens,
		TotalTokens:         totalTokens,
		EstimatedCost:       estimatedCost,
		PricedRequests:      pricedRequests,
		Timeline:            timeline,
	}

	if totalRequests > 0 {
		completed := successCount + failureCount
		if completed > 0 {
			overview.SuccessRate = float64(successCount) * 100.0 / float64(completed)
		}
		overview.AverageLatencyMs = float64(latencySum) / float64(totalRequests)
		overview.Tps = tps
		overview.TpsSampleCount = tpsSampleCount
		if inputTokens > 0 {
			overview.CacheHitRate = math.Min(float64(cacheReadTokens)/float64(inputTokens), 1.0)
		}

		// Calculate window minutes
		minMs := int64(0)
		maxMs := int64(0)
		if minTimestamp.Valid {
			minMs = minTimestamp.Int64
		}
		if maxTimestamp.Valid {
			maxMs = maxTimestamp.Int64
		}
		minutes := queryWindowMinutes(q, minMs, maxMs)
		overview.Rpm = float64(totalRequests) / minutes
		overview.Tpm = float64(totalTokens) / minutes
	}

	return overview, nil
}

// LoadAnalysis returns four-dimensional aggregated distributions.
func (s *Storage) LoadAnalysis(q model.UsageQuery) (model.UsageAnalysis, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	filter := buildUsageFilter(q)

	sqlQuery := fmt.Sprintf(`
		SELECT
			COALESCE(NULLIF(TRIM(model), ''), 'unknown'),
			COALESCE(NULLIF(TRIM(provider), ''), '未知 Provider'),
			COALESCE(NULLIF(TRIM(source), ''), '未知来源'),
			COALESCE(NULLIF(TRIM(api_key_hash), ''), '未记录密钥'),
			MAX(TRIM(api_key_remark)), MAX(TRIM(api_key_display)),
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed != 0 AND canceled = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0)
		FROM usage_events%s
		GROUP BY 1, 2, 3, 4
	`, filter.clause)

	rows, err := s.db.Query(sqlQuery, filter.params...)
	if err != nil {
		return model.UsageAnalysis{}, fmt.Errorf("查询使用分析失败: %w", err)
	}
	defer rows.Close()

	modelsMap := make(map[string]*model.UsageCategory)
	providersMap := make(map[string]*model.UsageCategory)
	sourcesMap := make(map[string]*model.UsageCategory)
	apiKeysMap := make(map[string]*model.UsageCategory)
	keyLabels := make(map[string][2]string)

	for rows.Next() {
		var (
			modelKey string
			provKey  string
			srcKey   string
			keyHash  string
			remark   sql.NullString
			display  sql.NullString
			requests int64
			failures int64
			tokens   int64
		)
		if err := rows.Scan(&modelKey, &provKey, &srcKey, &keyHash, &remark, &display, &requests, &failures, &tokens); err == nil {
			addCategory(modelsMap, modelKey, modelKey, requests, failures, tokens)
			addCategory(providersMap, provKey, provKey, requests, failures, tokens)
			addCategory(sourcesMap, srcKey, usageSourceDisplay(srcKey), requests, failures, tokens)

			rem := ""
			if remark.Valid {
				rem = remark.String
			}
			disp := ""
			if display.Valid {
				disp = display.String
			}
			curr := keyLabels[keyHash]
			if rem > curr[0] {
				curr[0] = rem
			}
			if disp > curr[1] {
				curr[1] = disp
			}
			keyLabels[keyHash] = curr

			addCategory(apiKeysMap, keyHash, apiKeyCategoryLabel(curr[0], curr[1]), requests, failures, tokens)
		}
	}
	rows.Close()

	return model.UsageAnalysis{
		Models:    sortCategories(modelsMap),
		Providers: sortCategories(providersMap),
		Sources:   sortCategories(sourcesMap),
		ApiKeys:   sortCategories(apiKeysMap),
	}, nil
}

func addCategory(m map[string]*model.UsageCategory, key, label string, reqs, fails, toks int64) {
	cat, exists := m[key]
	if !exists {
		cat = &model.UsageCategory{
			Key:   key,
			Label: label,
		}
		m[key] = cat
	}
	cat.Requests += reqs
	cat.Failures += fails
	cat.Tokens += toks
}

func sortCategories(m map[string]*model.UsageCategory) []model.UsageCategory {
	var list []model.UsageCategory
	for _, c := range m {
		list = append(list, *c)
	}
	// Sort by tokens DESC, requests DESC, key ASC
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			swap := false
			if list[j].Tokens > list[i].Tokens {
				swap = true
			} else if list[j].Tokens == list[i].Tokens {
				if list[j].Requests > list[i].Requests {
					swap = true
				} else if list[j].Requests == list[i].Requests {
					if list[j].Key < list[i].Key {
						swap = true
					}
				}
			}
			if swap {
				list[i], list[j] = list[j], list[i]
			}
		}
	}
	return list
}

// LoadEvents returns paginated usage records matching query filters.
func (s *Storage) LoadEvents(q model.UsageQuery) (model.UsageEventPage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	filter := buildUsageFilter(q)

	var total int
	countSql := fmt.Sprintf("SELECT COUNT(*) FROM usage_events%s", filter.clause)
	_ = s.db.QueryRow(countSql, filter.params...).Scan(&total)

	pageSize := 50
	if q.PageSize != nil && *q.PageSize >= 20 && *q.PageSize <= 200 {
		pageSize = *q.PageSize
	}
	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}
	page := 1
	if q.Page != nil && *q.Page >= 1 {
		page = *q.Page
	}
	if page > totalPages {
		page = totalPages
	}
	offset := (page - 1) * pageSize

	sqlQuery := fmt.Sprintf(`
		SELECT
			event_key, timestamp, latency_ms, ttft_ms, source, auth_index, failed,
			provider, model, alias, reasoning_effort, service_tier,
			response_service_tier, executor_type, endpoint, auth_type,
			api_key_hash, api_key_display, api_key_remark, request_id,
			api_group_key, client_ip, x_forwarded_for, user_agent, generate,
			cached_tokens, collector_source,
			input_tokens, output_tokens, reasoning_tokens, cache_read_tokens,
			cache_creation_tokens, total_tokens, canceled, failure_status,
			failure_body
		FROM usage_events%s
		ORDER BY timestamp_ms DESC, id DESC
		LIMIT ? OFFSET ?
	`, filter.clause)

	params := append(filter.params, pageSize, offset)
	rows, err := s.db.Query(sqlQuery, params...)
	if err != nil {
		return model.UsageEventPage{}, fmt.Errorf("查询 SQLite 使用事件失败: %w", err)
	}
	defer rows.Close()

	prices := s.loadModelPricesLocked()
	var items []model.UsageRecord

	for rows.Next() {
		var (
			eventKey            string
			timestamp           string
			latencyMs           int64
			ttftMs              sql.NullInt64
			source              string
			authIndex           string
			failed              int
			provider            string
			mod                 string
			alias               string
			reasoningEffort     string
			serviceTier         string
			responseServiceTier string
			executorType        string
			endpoint            string
			authType            string
			apiKeyHash          string
			apiKeyDisplay       string
			apiKeyRemark        string
			requestId           string
			apiGroupKey         string
			clientIp            sql.NullString
			xForwardedFor       sql.NullString
			userAgent           sql.NullString
			generate            int
			cachedTokens        int64
			collectorSource     string
			inputTokens         int64
			outputTokens        int64
			reasoningTokens     int64
			cacheReadTokens     int64
			cacheCreationTokens int64
			totalTokens         int64
			canceled            int
			failureStatus       int
			failureBody         string
		)

		if err := rows.Scan(
			&eventKey, &timestamp, &latencyMs, &ttftMs, &source, &authIndex, &failed,
			&provider, &mod, &alias, &reasoningEffort, &serviceTier,
			&responseServiceTier, &executorType, &endpoint, &authType,
			&apiKeyHash, &apiKeyDisplay, &apiKeyRemark, &requestId,
			&apiGroupKey, &clientIp, &xForwardedFor, &userAgent, &generate,
			&cachedTokens, &collectorSource,
			&inputTokens, &outputTokens, &reasoningTokens, &cacheReadTokens,
			&cacheCreationTokens, &totalTokens, &canceled, &failureStatus,
			&failureBody,
		); err == nil {
			var ttft *int64
			if ttftMs.Valid {
				v := ttftMs.Int64
				ttft = &v
			}
			var cIp *string
			if clientIp.Valid {
				v := clientIp.String
				cIp = &v
			}
			var xff *string
			if xForwardedFor.Valid {
				v := xForwardedFor.String
				xff = &v
			}
			var ua *string
			if userAgent.Valid {
				v := userAgent.String
				ua = &v
			}

			// Estimate cost for this single record
			cost := 0.0
			if _, p, ok := ResolveModelPrice(mod, alias, prices); ok {
				longInput := uint64(0)
				longOutput := uint64(0)
				longCacheRead := uint64(0)
				longCacheCreation := uint64(0)
				if inputTokens > LongContextInputTokenThreshold {
					longInput = uint64(inputTokens)
					longOutput = uint64(outputTokens)
					longCacheRead = uint64(cacheReadTokens)
					longCacheCreation = uint64(cacheCreationTokens)
				}
				tokens := CostTokens{
					Input:             uint64(inputTokens),
					Output:            uint64(outputTokens),
					CacheRead:         uint64(cacheReadTokens),
					CacheCreation:     uint64(cacheCreationTokens),
					LongInput:         longInput,
					LongOutput:        longOutput,
					LongCacheRead:     longCacheRead,
					LongCacheCreation: longCacheCreation,
				}
				tier := serviceTier
				if responseServiceTier != "" {
					tier = responseServiceTier
				}
				cost = CostForPrice(mod, tier, tokens, p)
			}

			items = append(items, model.UsageRecord{
				Id:                  eventKey,
				Timestamp:           timestamp,
				LatencyMs:           latencyMs,
				TtftMs:              ttft,
				Source:              source,
				SourceDisplay:       usageSourceDisplay(source),
				AuthIndex:           authIndex,
				Failed:              failed != 0,
				Canceled:            canceled != 0,
				FailureStatus:       uint16(failureStatus),
				FailureBody:         failureBody,
				Provider:            provider,
				ApiGroupKey:         apiGroupKey,
				Model:               mod,
				Alias:               alias,
				ClientIp:            cIp,
				XForwardedFor:       xff,
				UserAgent:           ua,
				ReasoningEffort:     reasoningEffort,
				ServiceTier:         serviceTier,
				ResponseServiceTier: responseServiceTier,
				ExecutorType:        executorType,
				Endpoint:            endpoint,
				AuthType:            authType,
				ApiKeyHash:          apiKeyHash,
				ApiKeyDisplay:       apiKeyDisplay,
				ApiKeyRemark:        apiKeyRemark,
				RequestId:           requestId,
				Generate:            generate != 0,
				CachedTokens:        cachedTokens,
				CollectorSource:     collectorSource,
				InputTokens:         inputTokens,
				OutputTokens:        outputTokens,
				ReasoningTokens:     reasoningTokens,
				CacheReadTokens:     cacheReadTokens,
				CacheCreationTokens: cacheCreationTokens,
				TotalTokens:         totalTokens,
				Cost:                cost,
			})
		}
	}

	if items == nil {
		items = []model.UsageRecord{}
	}

	return model.UsageEventPage{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

// LoadPricing calculates usage pricing rows and coverage.
func (s *Storage) LoadPricing(q model.UsageQuery) (model.UsagePricing, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	filter := buildUsageFilter(q)
	prices := s.loadModelPricesLocked()

	groups, err := s.loadCostGroupsLocked(filter)
	if err != nil {
		return model.UsagePricing{}, err
	}

	rowsMap := make(map[string]*model.UsagePriceRow)
	totalRequests := int64(0)
	pricedRequests := int64(0)
	totalCost := 0.0

	for _, g := range groups {
		totalRequests += g.requests
		row, exists := rowsMap[g.model]
		if !exists {
			row = &model.UsagePriceRow{Model: g.model}
			rowsMap[g.model] = row
		}
		row.Requests += g.requests
		row.InputTokens += int64(g.tokens.Input)
		row.OutputTokens += int64(g.tokens.Output)
		row.CacheReadTokens += int64(g.tokens.CacheRead)
		row.CacheCreationTokens += int64(g.tokens.CacheCreation)
		row.TotalTokens += g.totalTokens

		if matchedModel, p, ok := ResolveModelPrice(g.model, g.alias, prices); ok {
			identity := strings.ToLower(fmt.Sprintf("%s %s %s", g.executorType, g.provider, g.authType))
			tier := g.serviceTier
			if !strings.Contains(identity, "codex") && strings.TrimSpace(g.responseServiceTier) != "" {
				tier = g.responseServiceTier
			}
			cost := CostForPrice(matchedModel, tier, g.tokens, p)
			row.EstimatedCost += cost
			priceCopy := p
			row.Price = &priceCopy
			totalCost += cost
			pricedRequests += g.requests
		}
	}

	// Add prices that had 0 requests in this window
	for _, p := range prices {
		if _, exists := rowsMap[p.Model]; !exists {
			priceCopy := p
			rowsMap[p.Model] = &model.UsagePriceRow{
				Model: p.Model,
				Price: &priceCopy,
			}
		}
	}

	var rowsList []model.UsagePriceRow
	for _, r := range rowsMap {
		rowsList = append(rowsList, *r)
	}

	// Sort: priced first, then requests desc, model asc
	for i := 0; i < len(rowsList); i++ {
		for j := i + 1; j < len(rowsList); j++ {
			iHasPrice := rowsList[i].Price != nil
			jHasPrice := rowsList[j].Price != nil
			swap := false
			if !iHasPrice && jHasPrice {
				swap = true
			} else if iHasPrice == jHasPrice {
				if rowsList[j].Requests > rowsList[i].Requests {
					swap = true
				} else if rowsList[j].Requests == rowsList[i].Requests {
					if rowsList[j].Model < rowsList[i].Model {
						swap = true
					}
				}
			}
			if swap {
				rowsList[i], rowsList[j] = rowsList[j], rowsList[i]
			}
		}
	}

	return model.UsagePricing{
		Rows:           rowsList,
		TotalCost:      totalCost,
		TotalRequests:  totalRequests,
		PricedRequests: pricedRequests,
		SavedPrices:    len(prices),
	}, nil
}

type usageCostGroup struct {
	model               string
	alias               string
	serviceTier         string
	responseServiceTier string
	executorType        string
	provider            string
	authType            string
	requests            int64
	tokens              CostTokens
	totalTokens         int64
}

func (s *Storage) loadCostGroupsLocked(filter usageSqlFilter) ([]usageCostGroup, error) {
	sqlQuery := fmt.Sprintf(`
		SELECT
			model, alias, service_tier, response_service_tier, executor_type, provider, auth_type,
			COUNT(*),
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(cache_read_tokens), 0),
			COALESCE(SUM(cache_creation_tokens), 0),
			COALESCE(SUM(CASE WHEN input_tokens > %d THEN input_tokens ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN input_tokens > %d THEN output_tokens ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN input_tokens > %d THEN cache_read_tokens ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN input_tokens > %d THEN cache_creation_tokens ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0)
		FROM usage_events%s
		GROUP BY model, alias, service_tier, response_service_tier, executor_type, provider, auth_type
	`, LongContextInputTokenThreshold, LongContextInputTokenThreshold, LongContextInputTokenThreshold, LongContextInputTokenThreshold, filter.clause)

	rows, err := s.db.Query(sqlQuery, filter.params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []usageCostGroup
	for rows.Next() {
		var g usageCostGroup
		var reqs, inp, out, cr, cc, linp, lout, lcr, lcc, totalToks int64
		if err := rows.Scan(
			&g.model, &g.alias, &g.serviceTier, &g.responseServiceTier, &g.executorType, &g.provider, &g.authType,
			&reqs, &inp, &out, &cr, &cc, &linp, &lout, &lcr, &lcc, &totalToks,
		); err == nil {
			g.requests = reqs
			g.tokens = CostTokens{
				Input:             uint64(inp),
				Output:            uint64(out),
				CacheRead:         uint64(cr),
				CacheCreation:     uint64(cc),
				LongInput:         uint64(linp),
				LongOutput:        uint64(lout),
				LongCacheRead:     uint64(lcr),
				LongCacheCreation: uint64(lcc),
			}
			g.totalTokens = totalToks
			groups = append(groups, g)
		}
	}
	return groups, nil
}

func (s *Storage) loadEstimatedCostLocked(filter usageSqlFilter) (float64, int64) {
	prices := s.loadModelPricesLocked()
	groups, err := s.loadCostGroupsLocked(filter)
	if err != nil {
		return 0, 0
	}

	totalCost := 0.0
	pricedRequests := int64(0)
	for _, g := range groups {
		if matchedModel, p, ok := ResolveModelPrice(g.model, g.alias, prices); ok {
			identity := strings.ToLower(fmt.Sprintf("%s %s %s", g.executorType, g.provider, g.authType))
			tier := g.serviceTier
			if !strings.Contains(identity, "codex") && strings.TrimSpace(g.responseServiceTier) != "" {
				tier = g.responseServiceTier
			}
			cost := CostForPrice(matchedModel, tier, g.tokens, p)
			totalCost += cost
			pricedRequests += g.requests
		}
	}
	return totalCost, pricedRequests
}

func (s *Storage) loadModelPricesLocked() map[string]model.ModelPrice {
	result := BundledModelPrices()

	rows, err := s.db.Query(`
		SELECT model, prompt_per_1m, completion_per_1m, cache_per_1m,
		       cache_read_per_1m, cache_creation_per_1m, prompt_configured,
		       completion_configured, cache_read_configured, cache_creation_configured,
		       source, source_model_id, updated_at_ms
		FROM model_prices
	`)
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var p model.ModelPrice
		var pCfg, cCfg, crCfg, ccCfg int
		if err := rows.Scan(
			&p.Model, &p.Prompt, &p.Completion, &p.Cache,
			&p.CacheRead, &p.CacheCreation, &pCfg, &cCfg, &crCfg, &ccCfg,
			&p.Source, &p.SourceModelId, &p.UpdatedAtMs,
		); err == nil {
			if strings.EqualFold(p.Source, "litellm") {
				continue // Ignore historical litellm cache
			}
			p.PromptConfigured = pCfg != 0
			p.CompletionConfigured = cCfg != 0
			p.CacheReadConfigured = crCfg != 0
			p.CacheCreationConfigured = ccCfg != 0

			// Remove case-insensitive existing baseline key
			for k := range result {
				if strings.EqualFold(k, p.Model) {
					delete(result, k)
					break
				}
			}
			result[p.Model] = p
		}
	}
	return result
}

// SaveModelPrice inserts or updates a custom model price.
func (s *Storage) SaveModelPrice(price model.ModelPrice) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	modelName := strings.TrimSpace(price.Model)
	if modelName == "" {
		return fmt.Errorf("模型名称不能为空")
	}

	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO model_prices (
			model, prompt_per_1m, completion_per_1m, cache_per_1m,
			cache_read_per_1m, cache_creation_per_1m, prompt_configured,
			completion_configured, cache_read_configured, cache_creation_configured,
			source, source_model_id, updated_at_ms
		) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, 1, 'manual', '', ?)
		ON CONFLICT(model) DO UPDATE SET
			prompt_per_1m = excluded.prompt_per_1m,
			completion_per_1m = excluded.completion_per_1m,
			cache_per_1m = excluded.cache_per_1m,
			cache_read_per_1m = excluded.cache_read_per_1m,
			cache_creation_per_1m = excluded.cache_creation_per_1m,
			prompt_configured = 1,
			completion_configured = 1,
			cache_read_configured = 1,
			cache_creation_configured = 1,
			source = 'manual',
			source_model_id = '',
			updated_at_ms = excluded.updated_at_ms
	`, modelName, price.Prompt, price.Completion, price.CacheRead, price.CacheRead, price.CacheCreation, now)
	return err
}

// DeleteModelPrice removes a model price entry.
func (s *Storage) DeleteModelPrice(modelName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("DELETE FROM model_prices WHERE model = ? COLLATE NOCASE", strings.TrimSpace(modelName))
	return err
}

// SyncModelPrices syncs prices from remote GitHub or builtin catalog.
func (s *Storage) SyncModelPrices(proxyURL, query string) (model.ModelPriceSyncResult, error) {
	remotePrices, usedBuiltin, err := FetchRemotePrices(proxyURL)
	if err != nil {
		return model.ModelPriceSyncResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Read existing manual prices to preserve them
	manualModels := make(map[string]bool)
	rows, err := s.db.Query("SELECT model FROM model_prices WHERE source = 'manual'")
	if err == nil {
		for rows.Next() {
			var m string
			if rows.Scan(&m) == nil {
				manualModels[strings.ToLower(strings.TrimSpace(m))] = true
			}
		}
		rows.Close()
	}

	tx, err := s.db.Begin()
	if err != nil {
		return model.ModelPriceSyncResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	_, _ = tx.Exec("DELETE FROM model_prices WHERE source = 'github'")

	imported := 0
	skipped := 0

	stmt, err := tx.Prepare(`
		INSERT INTO model_prices (
			model, prompt_per_1m, completion_per_1m, cache_per_1m,
			cache_read_per_1m, cache_creation_per_1m, prompt_configured,
			completion_configured, cache_read_configured, cache_creation_configured,
			source, source_model_id, updated_at_ms
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(model) DO UPDATE SET
			prompt_per_1m = excluded.prompt_per_1m,
			completion_per_1m = excluded.completion_per_1m,
			cache_per_1m = excluded.cache_per_1m,
			cache_read_per_1m = excluded.cache_read_per_1m,
			cache_creation_per_1m = excluded.cache_creation_per_1m,
			source = excluded.source,
			updated_at_ms = excluded.updated_at_ms
	`)
	if err != nil {
		return model.ModelPriceSyncResult{}, err
	}
	defer stmt.Close()

	for _, p := range remotePrices {
		if manualModels[strings.ToLower(strings.TrimSpace(p.Model))] {
			skipped++
			continue
		}
		_, err := stmt.Exec(
			p.Model, p.Prompt, p.Completion, p.CacheRead,
			p.CacheRead, p.CacheCreation, boolToInt(p.PromptConfigured),
			boolToInt(p.CompletionConfigured), boolToInt(p.CacheReadConfigured), boolToInt(p.CacheCreationConfigured),
			p.Source, p.SourceModelId, p.UpdatedAtMs,
		)
		if err == nil {
			imported++
		}
	}

	if err := tx.Commit(); err != nil {
		return model.ModelPriceSyncResult{}, err
	}

	return model.ModelPriceSyncResult{
		Imported:    imported,
		Skipped:     skipped,
		Unmatched:   []string{},
		UsedBuiltin: usedBuiltin,
	}, nil
}

// GetStorageSettings returns database file size and limits.
func (s *Storage) GetStorageSettings() (model.UsageStorageSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.loadStorageSettingsLocked(0)
}

// SaveStorageSettings sets database maximum size in MB and prunes if needed.
func (s *Storage) SaveStorageSettings(maxMb uint64) (model.UsageStorageSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		INSERT INTO usage_metadata (key, value) VALUES ('max_database_size_mb', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`, strconv.FormatUint(maxMb, 10))
	if err != nil {
		return model.UsageStorageSettings{}, err
	}

	deleted, _ := s.enforceLimitLocked()
	return s.loadStorageSettingsLocked(deleted)
}

// ShrinkDatabase forces database reduction to a target MB.
func (s *Storage) ShrinkDatabase(targetMb uint64) (model.UsageStorageSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	deleted := s.pruneToBytesLocked(int64(targetMb) * 1024 * 1024)
	return s.loadStorageSettingsLocked(deleted)
}

// RepairCacheRecords cleans historical Claude token discrepancies and invalid records.
func (s *Storage) RepairCacheRecords() (model.UsageRepairResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var candidateCount int64
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM usage_events
		WHERE lower(trim(model)) = 'unknown'
		   OR (input_tokens > 0
		       AND cache_read_tokens + cache_creation_tokens > input_tokens
		       AND (lower(executor_type) = 'claudeexecutor'
		            OR lower(provider) = 'claude'
		            OR lower(provider) LIKE '%anthropic%'))
	`).Scan(&candidateCount)
	if err != nil {
		return model.UsageRepairResult{}, fmt.Errorf("检查异常行失败: %w", err)
	}

	if candidateCount <= 0 {
		return model.UsageRepairResult{}, nil
	}

	backupDir := filepath.Join(filepath.Dir(s.dbPath), "backups")
	_ = os.MkdirAll(backupDir, 0755)
	backupPath := filepath.Join(backupDir, fmt.Sprintf("usage-before-history-repair-v2-%d.db", time.Now().UnixNano()))

	// Consistent snapshot via VACUUM INTO
	_, _ = s.db.Exec("VACUUM INTO ?", backupPath)

	tx, err := s.db.Begin()
	if err != nil {
		return model.UsageRepairResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	resMigrated, err := tx.Exec(`
		UPDATE usage_events
		SET input_tokens = input_tokens + cache_read_tokens + cache_creation_tokens,
		    total_tokens = CASE
		        WHEN total_tokens = 0 OR total_tokens = input_tokens + output_tokens
		        THEN input_tokens + cache_read_tokens + cache_creation_tokens + output_tokens
		        ELSE total_tokens
		    END,
		    cached_tokens = MAX(cached_tokens, cache_read_tokens + cache_creation_tokens)
		WHERE input_tokens > 0
		  AND cache_read_tokens + cache_creation_tokens > input_tokens
		  AND lower(trim(model)) <> 'unknown'
		  AND (lower(executor_type) = 'claudeexecutor'
		       OR lower(provider) = 'claude'
		       OR lower(provider) LIKE '%anthropic%')
	`)
	if err != nil {
		return model.UsageRepairResult{}, err
	}
	repaired, _ := resMigrated.RowsAffected()

	resDeleted, err := tx.Exec("DELETE FROM usage_events WHERE lower(trim(model)) = 'unknown'")
	if err != nil {
		return model.UsageRepairResult{}, err
	}
	deleted, _ := resDeleted.RowsAffected()

	if err := tx.Commit(); err != nil {
		return model.UsageRepairResult{}, err
	}

	bPath := backupPath
	return model.UsageRepairResult{
		Scanned:    uint64(candidateCount),
		Repaired:   uint64(repaired),
		Deleted:    uint64(deleted),
		BackupPath: &bPath,
	}, nil
}

func (s *Storage) loadStorageSettingsLocked(deleted uint64) (model.UsageStorageSettings, error) {
	dbSize := int64(0)
	if fi, err := os.Stat(s.dbPath); err == nil {
		dbSize = fi.Size()
	}
	walSize := int64(0)
	if fi, err := os.Stat(s.dbPath + "-wal"); err == nil {
		walSize = fi.Size()
	}

	maxMb := uint64(0)
	var maxVal string
	if err := s.db.QueryRow("SELECT value FROM usage_metadata WHERE key = 'max_database_size_mb'").Scan(&maxVal); err == nil {
		if parsed, err := strconv.ParseUint(maxVal, 10, 64); err == nil {
			maxMb = parsed
		}
	}

	totalRecords := uint64(0)
	var cnt int64
	if err := s.db.QueryRow("SELECT COUNT(*) FROM usage_events").Scan(&cnt); err == nil && cnt > 0 {
		totalRecords = uint64(cnt)
	}

	return model.UsageStorageSettings{
		DatabasePath:      s.dbPath,
		DatabaseSizeBytes: dbSize,
		WalSizeBytes:      walSize,
		MaxDatabaseSizeMb: maxMb,
		TotalRecords:      totalRecords,
		DeletedRecords:    deleted,
	}, nil
}

func (s *Storage) enforceLimitLocked() (uint64, error) {
	var maxVal string
	if err := s.db.QueryRow("SELECT value FROM usage_metadata WHERE key = 'max_database_size_mb'").Scan(&maxVal); err != nil {
		return 0, nil
	}
	maxMb, err := strconv.ParseUint(maxVal, 10, 64)
	if err != nil || maxMb == 0 {
		return 0, nil
	}

	targetBytes := int64(maxMb) * 1024 * 1024
	return s.pruneToBytesLocked(targetBytes), nil
}

func (s *Storage) pruneToBytesLocked(maxBytes int64) uint64 {
	dbSize := int64(0)
	if fi, err := os.Stat(s.dbPath); err == nil {
		dbSize += fi.Size()
	}
	if fi, err := os.Stat(s.dbPath + "-wal"); err == nil {
		dbSize += fi.Size()
	}

	if dbSize <= maxBytes {
		return 0
	}

	// 1. Wal checkpoint truncate
	_, _ = s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE)")

	// 2. Clean temporary inbox rows
	_, _ = s.db.Exec("DELETE FROM usage_inbox WHERE status IN ('processed', 'decode_failed', 'discarded')")

	// 3. Loop prune oldest usage_events
	deletedTotal := uint64(0)
	for {
		var activePages, freePages, pageSize int64
		_ = s.db.QueryRow("PRAGMA page_count").Scan(&activePages)
		_ = s.db.QueryRow("PRAGMA freelist_count").Scan(&freePages)
		_ = s.db.QueryRow("PRAGMA page_size").Scan(&pageSize)

		activeBytes := (activePages - freePages) * pageSize
		if activeBytes <= maxBytes {
			break
		}

		var count int64
		_ = s.db.QueryRow("SELECT COUNT(*) FROM usage_events").Scan(&count)
		if count <= 0 {
			break
		}

		excess := activeBytes - maxBytes
		estimated := int64(math.Ceil(float64(count) * float64(excess) / float64(activeBytes)))
		batch := estimated
		if batch < 100 {
			batch = 100
		}
		if batch > count {
			batch = count
		}

		res, err := s.db.Exec(`
			DELETE FROM usage_events WHERE id IN (
				SELECT id FROM usage_events ORDER BY timestamp_ms ASC, id ASC LIMIT ?
			)
		`, batch)
		if err != nil {
			break
		}
		del, _ := res.RowsAffected()
		if del <= 0 {
			break
		}
		deletedTotal += uint64(del)
	}

	if deletedTotal > 0 {
		_, _ = s.db.Exec("VACUUM")
		_, _ = s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
	}

	return deletedTotal
}

// Utility parsing functions
func IsIgnorableUsageMessage(msg string) bool {
	msg = strings.TrimSpace(msg)
	if msg == "" || msg == "null" {
		return true
	}
	if strings.Contains(msg, `"request_id"`) {
		return false
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(msg), &obj); err != nil {
		return false
	}
	if len(obj) == 1 {
		if val, ok := obj["refresh"].(bool); ok && val {
			return true
		}
		if val, ok := obj["support_refresh"].(bool); ok && val {
			return true
		}
	}
	return false
}

func parseAndNormalizeUsageRecord(rawJSON string, collectorSource string) (model.UsageRecord, bool, error) {
	var raw struct {
		Id                  string `json:"id"`
		RequestId           string `json:"request_id"`
		Timestamp           string `json:"timestamp"`
		TimestampMs         int64  `json:"timestamp_ms"`
		CreatedAt           int64  `json:"created_at"`
		LatencyMs           int64  `json:"latency_ms"`
		DurationMs          int64  `json:"duration_ms"`
		TtftMs              *int64 `json:"ttft_ms"`
		Source              string `json:"source"`
		AuthIndex           string `json:"auth_index"`
		Failed              bool   `json:"failed"`
		Canceled            bool   `json:"canceled"`
		FailureStatus       int    `json:"failure_status"`
		StatusCode          int    `json:"status_code"`
		FailureBody         string `json:"failure_body"`
		Provider            string `json:"provider"`
		Model               string `json:"model"`
		Alias               string `json:"alias"`
		ReasoningEffort     string `json:"reasoning_effort"`
		ServiceTier         string `json:"service_tier"`
		ResponseServiceTier string `json:"response_service_tier"`
		ExecutorType        string `json:"executor_type"`
		Endpoint            string `json:"endpoint"`
		AuthType            string `json:"auth_type"`
		ApiKey              string `json:"api_key"`
		ApiKeyHash          string `json:"api_key_hash"`
		ApiKeyDisplay       string `json:"api_key_display"`
		ApiKeyRemark        string `json:"api_key_remark"`
		ClientIp            string `json:"client_ip"`
		XForwardedFor       string `json:"x_forwarded_for"`
		UserAgent           string `json:"user_agent"`
		Generate            *bool  `json:"generate"`
		CachedTokens        int64  `json:"cached_tokens"`
		PromptTokens        int64  `json:"prompt_tokens"`
		InputTokens         int64  `json:"input_tokens"`
		CompletionTokens    int64  `json:"completion_tokens"`
		OutputTokens        int64  `json:"output_tokens"`
		ReasoningTokens     int64  `json:"reasoning_tokens"`
		CacheReadTokens     int64  `json:"cache_read_tokens"`
		CacheCreationTokens int64  `json:"cache_creation_tokens"`
		TotalTokens         int64  `json:"total_tokens"`
	}

	if err := json.Unmarshal([]byte(rawJSON), &raw); err != nil {
		return model.UsageRecord{}, false, err
	}

	id := raw.Id
	if id == "" {
		id = raw.RequestId
	}
	if id == "" {
		return model.UsageRecord{}, false, fmt.Errorf("缺少 request_id 或 id")
	}

	tsStr := raw.Timestamp
	if tsStr == "" {
		if raw.TimestampMs > 0 {
			tsStr = time.UnixMilli(raw.TimestampMs).Format(time.RFC3339)
		} else if raw.CreatedAt > 0 {
			tsStr = time.Unix(raw.CreatedAt, 0).Format(time.RFC3339)
		} else {
			tsStr = time.Now().Format(time.RFC3339)
		}
	}

	latency := raw.LatencyMs
	if latency <= 0 {
		latency = raw.DurationMs
	}

	inp := raw.InputTokens
	if inp <= 0 {
		inp = raw.PromptTokens
	}
	out := raw.OutputTokens
	if out <= 0 {
		out = raw.CompletionTokens
	}

	// Normalize tokens
	tokVals := NormalizeTokens(raw.ExecutorType, raw.Provider, raw.AuthType, TokenValues{
		Input:            clampU64(inp),
		Output:           clampU64(out),
		Reasoning:        clampU64(raw.ReasoningTokens),
		Cached:           clampU64(raw.CachedTokens),
		CacheRead:        clampU64(raw.CacheReadTokens),
		CacheReadPresent: raw.CacheReadTokens > 0,
		CacheCreation:    clampU64(raw.CacheCreationTokens),
		Total:            clampU64(raw.TotalTokens),
	})

	failed := raw.Failed
	status := raw.FailureStatus
	if status == 0 {
		status = raw.StatusCode
	}
	if status >= 400 {
		failed = true
	}

	canceled := raw.Canceled
	if status == 499 || strings.Contains(strings.ToLower(raw.FailureBody), "context canceled") {
		canceled = true
	}

	keyHash := raw.ApiKeyHash
	keyDisplay := raw.ApiKeyDisplay
	if keyHash == "" && raw.ApiKey != "" {
		keyHash = sha256Hex(raw.ApiKey)
		keyDisplay = maskApiKey(raw.ApiKey)
	}

	apiGroupKey := keyHash
	if apiGroupKey == "" {
		apiGroupKey = raw.Provider
	}
	if apiGroupKey == "" {
		apiGroupKey = raw.Endpoint
	}
	if apiGroupKey == "" {
		apiGroupKey = "unknown"
	}

	generate := true
	if raw.Generate != nil {
		generate = *raw.Generate
	} else if !failed && strings.EqualFold(raw.ExecutorType, "CodexWebsocketsExecutor") && tokVals.Total == 0 {
		generate = false
	}

	var cIp *string
	if raw.ClientIp != "" {
		cIp = &raw.ClientIp
	}
	var xff *string
	if raw.XForwardedFor != "" {
		xff = &raw.XForwardedFor
	}
	var ua *string
	if raw.UserAgent != "" {
		ua = &raw.UserAgent
	}

	record := model.UsageRecord{
		Id:                  id,
		Timestamp:           tsStr,
		LatencyMs:           latency,
		TtftMs:              raw.TtftMs,
		Source:              raw.Source,
		AuthIndex:           raw.AuthIndex,
		Failed:              failed,
		Canceled:            canceled,
		FailureStatus:       uint16(status),
		FailureBody:         raw.FailureBody,
		Provider:            raw.Provider,
		Model:               raw.Model,
		Alias:               raw.Alias,
		ReasoningEffort:     raw.ReasoningEffort,
		ServiceTier:         raw.ServiceTier,
		ResponseServiceTier: raw.ResponseServiceTier,
		ExecutorType:        raw.ExecutorType,
		Endpoint:            raw.Endpoint,
		AuthType:            raw.AuthType,
		ApiKeyHash:          keyHash,
		ApiKeyDisplay:       keyDisplay,
		ApiKeyRemark:        raw.ApiKeyRemark,
		RequestId:           id,
		ApiGroupKey:         apiGroupKey,
		ClientIp:            cIp,
		XForwardedFor:       xff,
		UserAgent:           ua,
		Generate:            generate,
		CachedTokens:        int64(tokVals.Cached),
		CollectorSource:     collectorSource,
		InputTokens:         int64(tokVals.Input),
		OutputTokens:        int64(tokVals.Output),
		ReasoningTokens:     int64(tokVals.Reasoning),
		CacheReadTokens:     int64(tokVals.CacheRead),
		CacheCreationTokens: int64(tokVals.CacheCreation),
		TotalTokens:         int64(tokVals.Total),
	}

	return record, true, nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func maskApiKey(key string) string {
	if len(key) <= 8 {
		return "****"
	}
	return key[:3] + "..." + key[len(key)-4:]
}

func usageSourceDisplay(source string) string {
	s := strings.TrimSpace(source)
	if s == "" {
		return "未知来源"
	}
	if strings.HasPrefix(s, "sk-") && len(s) > 10 {
		return maskApiKey(s)
	}
	return s
}

func apiKeyCategoryLabel(remark, display string) string {
	if remark != "" {
		return remark
	}
	if display != "" {
		return display
	}
	return "未记录密钥"
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func clampU64(v int64) uint64 {
	if v < 0 {
		return 0
	}
	return uint64(v)
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}

func parseTimestampMs(ts string) int64 {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}

func parseLocalHour(ts string) string {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		t = time.Now()
	}
	return t.Local().Format("2006-01-02-15")
}

func parseTimeQueryMs(val string) int64 {
	val = strings.TrimSpace(val)
	if val == "" {
		return 0
	}
	if ms, err := strconv.ParseInt(val, 10, 64); err == nil && ms > 0 {
		return ms
	}
	if t, err := time.Parse(time.RFC3339, val); err == nil {
		return t.UnixMilli()
	}
	return 0
}

func queryWindowMinutes(q model.UsageQuery, minMs, maxMs int64) float64 {
	start := int64(0)
	end := int64(0)
	if q.Start != nil {
		start = parseTimeQueryMs(*q.Start)
	}
	if q.End != nil {
		end = parseTimeQueryMs(*q.End)
	}
	if start == 0 {
		start = minMs
	}
	if end == 0 {
		end = maxMs
	}
	if end <= start {
		return 1.0
	}
	mins := float64(end-start) / 60000.0
	if mins < 1.0 {
		return 1.0
	}
	return mins
}
