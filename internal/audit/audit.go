package audit

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"weplane/internal/db"
)

type Entry struct {
	Timestamp time.Time `json:"timestamp"`
	User      string    `json:"user"`
	RemoteIP  string    `json:"remoteIp"`
	Action    string    `json:"action"`
	Target    string    `json:"target"`
	Status    string    `json:"status"` // success | error
	Detail    string    `json:"detail,omitempty"`
}

type Logger struct {
	mu   sync.Mutex
	conn *sql.DB
}

func NewLogger(dataDir string) (*Logger, error) {
	conn, err := db.Open(dataDir)
	if err != nil {
		return nil, err
	}
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ts INTEGER NOT NULL,
			user TEXT NOT NULL,
			remote_ip TEXT NOT NULL,
			action TEXT NOT NULL,
			target TEXT NOT NULL,
			status TEXT NOT NULL,
			detail TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts DESC, id DESC);`,
	}
	for _, stmt := range stmts {
		if _, err := conn.Exec(stmt); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}

	l := &Logger{conn: conn}
	l.migrateLegacyJSONL(filepath.Join(dataDir, "audit.jsonl"))
	return l, nil
}

func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conn != nil {
		err := l.conn.Close()
		l.conn = nil
		return err
	}
	return nil
}

func (l *Logger) migrateLegacyJSONL(legacyPath string) {
	var count int
	if err := l.conn.QueryRow(`SELECT COUNT(*) FROM audit_logs`).Scan(&count); err != nil || count > 0 {
		return
	}
	f, err := os.Open(legacyPath)
	if err != nil {
		return
	}
	defer f.Close()

	tx, err := l.conn.Begin()
	if err != nil {
		return
	}
	stmt, err := tx.Prepare(`INSERT INTO audit_logs (ts, user, remote_ip, action, target, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return
	}
	defer stmt.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var e Entry
		if err := json.Unmarshal(scanner.Bytes(), &e); err == nil {
			_, _ = stmt.Exec(e.Timestamp.Unix(), e.User, e.RemoteIP, e.Action, e.Target, e.Status, e.Detail)
		}
	}
	_ = tx.Commit()
}

func (l *Logger) Record(e Entry) {
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now()
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conn == nil {
		return
	}
	_, _ = l.conn.Exec(
		`INSERT INTO audit_logs (ts, user, remote_ip, action, target, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		e.Timestamp.Unix(), e.User, e.RemoteIP, e.Action, e.Target, e.Status, e.Detail,
	)
}

func (l *Logger) Recent(limit int) ([]Entry, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conn == nil {
		return []Entry{}, nil
	}

	rows, err := l.conn.Query(
		`SELECT ts, user, remote_ip, action, target, status, detail FROM audit_logs ORDER BY id DESC LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Entry, 0, limit)
	for rows.Next() {
		var ts int64
		var e Entry
		if err := rows.Scan(&ts, &e.User, &e.RemoteIP, &e.Action, &e.Target, &e.Status, &e.Detail); err == nil {
			e.Timestamp = time.Unix(ts, 0)
			out = append(out, e)
		}
	}
	return out, nil
}
