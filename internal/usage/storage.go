package usage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"easycliproxyapi/internal/core"
	"easycliproxyapi/internal/model"
)

type Storage struct {
	db *sql.DB
	mu sync.RWMutex
}

func DbPath() string {
	return filepath.Join(core.BaseDir(), "cpa-usage.db")
}

func NewStorage(dbPath string) (*Storage, error) {
	if dbPath == "" {
		dbPath = DbPath()
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, fmt.Errorf("打开 SQLite 数据库失败: %w", err)
	}

	s := &Storage{db: db}
	if err := s.initSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}

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

func (s *Storage) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS usage_inbox (
		id TEXT PRIMARY KEY,
		inserted_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS usage_records (
		id TEXT PRIMARY KEY,
		timestamp INTEGER,
		time_formatted TEXT,
		model TEXT,
		provider TEXT,
		prompt_tokens INTEGER,
		completion_tokens INTEGER,
		total_tokens INTEGER,
		duration_ms INTEGER,
		status_code INTEGER,
		cost REAL
	);

	CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
	`
	_, err := s.db.Exec(schema)
	return err
}

// InsertBatch inserts a batch of usage records idempotently using usage_inbox.
func (s *Storage) InsertBatch(records []model.UsageRecord) (int, error) {
	if len(records) == 0 {
		return 0, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	stmtInbox, err := tx.Prepare("INSERT OR IGNORE INTO usage_inbox (id, inserted_at) VALUES (?, ?)")
	if err != nil {
		return 0, err
	}
	defer stmtInbox.Close()

	stmtRecord, err := tx.Prepare(`
		INSERT INTO usage_records (
			id, timestamp, time_formatted, model, provider,
			prompt_tokens, completion_tokens, total_tokens,
			duration_ms, status_code, cost
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return 0, err
	}
	defer stmtRecord.Close()

	insertedCount := 0
	nowUnix := time.Now().Unix()

	for _, r := range records {
		if r.Id == "" {
			continue
		}

		res, err := stmtInbox.Exec(r.Id, nowUnix)
		if err != nil {
			continue
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			// Already processed (idempotent duplicate)
			continue
		}

		timeFormatted := r.TimeFormatted
		if timeFormatted == "" && r.Timestamp > 0 {
			timeFormatted = time.Unix(r.Timestamp, 0).Format("2006-01-02 15:04:05")
		}

		totalTokens := r.TotalTokens
		if totalTokens <= 0 {
			totalTokens = r.PromptTokens + r.CompletionTokens
		}

		_, err = stmtRecord.Exec(
			r.Id, r.Timestamp, timeFormatted, r.Model, r.Provider,
			r.PromptTokens, r.CompletionTokens, totalTokens,
			r.DurationMs, r.StatusCode, r.Cost,
		)
		if err == nil {
			insertedCount++
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return insertedCount, nil
}

// GetSummary calculates aggregate metrics across all and today's records.
func (s *Storage) GetSummary() (model.UsageSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var summary model.UsageSummary

	// Total aggregates
	rowTotal := s.db.QueryRow(`
		SELECT
			COUNT(*),
			COALESCE(SUM(prompt_tokens), 0),
			COALESCE(SUM(completion_tokens), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(cost), 0.0)
		FROM usage_records
	`)
	if err := rowTotal.Scan(
		&summary.TotalRequests,
		&summary.TotalPromptTokens,
		&summary.TotalCompletionTokens,
		&summary.TotalTokens,
		&summary.TotalCost,
	); err != nil {
		return summary, err
	}

	// Today's start unix timestamp (local time)
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()

	rowToday := s.db.QueryRow(`
		SELECT
			COUNT(*),
			COALESCE(SUM(cost), 0.0)
		FROM usage_records
		WHERE timestamp >= ?
	`, todayStart)
	_ = rowToday.Scan(&summary.TodayRequests, &summary.TodayCost)

	return summary, nil
}

// GetRecentRecords returns a paginated list of recent usage records.
func (s *Storage) GetRecentRecords(limit, offset int) ([]model.UsageRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := s.db.Query(`
		SELECT
			id, timestamp, time_formatted, model, provider,
			prompt_tokens, completion_tokens, total_tokens,
			duration_ms, status_code, cost
		FROM usage_records
		ORDER BY timestamp DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.UsageRecord
	for rows.Next() {
		var r model.UsageRecord
		if err := rows.Scan(
			&r.Id, &r.Timestamp, &r.TimeFormatted, &r.Model, &r.Provider,
			&r.PromptTokens, &r.CompletionTokens, &r.TotalTokens,
			&r.DurationMs, &r.StatusCode, &r.Cost,
		); err == nil {
			results = append(results, r)
		}
	}

	if results == nil {
		results = []model.UsageRecord{}
	}

	return results, nil
}

// GetDailyTrend returns aggregated points grouped by day for the last N days.
func (s *Storage) GetDailyTrend(days int) ([]model.DailyTrendPoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if days <= 0 {
		days = 7
	}

	cutoff := time.Now().AddDate(0, 0, -days).Unix()

	rows, err := s.db.Query(`
		SELECT
			strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch', 'localtime')) AS day,
			COUNT(*),
			COALESCE(SUM(prompt_tokens), 0),
			COALESCE(SUM(completion_tokens), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(cost), 0.0)
		FROM usage_records
		WHERE timestamp >= ?
		GROUP BY day
		ORDER BY day ASC
	`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []model.DailyTrendPoint
	for rows.Next() {
		var p model.DailyTrendPoint
		if err := rows.Scan(
			&p.Date, &p.Requests, &p.PromptTokens,
			&p.CompletionTokens, &p.TotalTokens, &p.Cost,
		); err == nil {
			points = append(points, p)
		}
	}

	if points == nil {
		points = []model.DailyTrendPoint{}
	}

	return points, nil
}
