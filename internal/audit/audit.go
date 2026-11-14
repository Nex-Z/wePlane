package audit

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
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
	path string
}

func NewLogger(dataDir string) (*Logger, error) {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, err
	}
	return &Logger{path: filepath.Join(dataDir, "audit.jsonl")}, nil
}

func (l *Logger) Record(e Entry) {
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now()
	}
	b, err := json.Marshal(e)
	if err != nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(b, '\n'))
}

func (l *Logger) Recent(limit int) ([]Entry, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	f, err := os.Open(l.path)
	if errors.Is(err, os.ErrNotExist) {
		return []Entry{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var all []Entry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var e Entry
		if err := json.Unmarshal(scanner.Bytes(), &e); err == nil {
			all = append(all, e)
		}
	}

	if len(all) > limit {
		all = all[len(all)-limit:]
	}
	// Reverse so newest appears first.
	for i, j := 0, len(all)-1; i < j; i, j = i+1, j-1 {
		all[i], all[j] = all[j], all[i]
	}
	return all, nil
}
