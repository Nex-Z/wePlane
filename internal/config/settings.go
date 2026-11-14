package config

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"weplane/internal/db"
)

// BarkSettings configures Bark push notifications.
type BarkSettings struct {
	Enabled     bool   `json:"enabled"`
	ServerURL   string `json:"serverUrl"`
	DeviceKey   string `json:"deviceKey"`
	Group       string `json:"group"`
	NotifyAlert bool   `json:"notifyAlert"`
	NotifyLogin bool   `json:"notifyLogin"`
}

// PanelSettings stores user-configurable alert thresholds and UI preferences.
type PanelSettings struct {
	CPUAlertPercent    float64      `json:"cpuAlertPercent"`
	MemAlertPercent    float64      `json:"memAlertPercent"`
	DiskAlertPercent   float64      `json:"diskAlertPercent"`
	RefreshIntervalSec int          `json:"refreshIntervalSec"`
	DefaultLogTail     int          `json:"defaultLogTail"`
	Bark               BarkSettings `json:"bark"`
}

func DefaultPanelSettings() PanelSettings {
	return PanelSettings{
		CPUAlertPercent:    85,
		MemAlertPercent:    85,
		DiskAlertPercent:   90,
		RefreshIntervalSec: 2,
		DefaultLogTail:     100,
		Bark: BarkSettings{
			Enabled:     false,
			ServerURL:   "https://api.day.app",
			Group:       "wePlane",
			NotifyAlert: true,
			NotifyLogin: false,
		},
	}
}

// SettingsStore persists PanelSettings in SQLite (<DataDir>/weplane.db).
type SettingsStore struct {
	mu      sync.RWMutex
	conn    *sql.DB
	current PanelSettings
}

func NewSettingsStore(dataDir string) *SettingsStore {
	s := &SettingsStore{
		current: DefaultPanelSettings(),
	}
	if dataDir != "" {
		if conn, err := db.Open(dataDir); err == nil {
			if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`); err == nil {
				s.conn = conn
				s.loadOrMigrate(filepath.Join(dataDir, "settings.json"))
			} else {
				_ = conn.Close()
			}
		}
	}
	return s
}

func (s *SettingsStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		err := s.conn.Close()
		s.conn = nil
		return err
	}
	return nil
}

func (s *SettingsStore) loadOrMigrate(legacyFile string) {
	if s.conn == nil {
		return
	}
	var raw string
	err := s.conn.QueryRow(`SELECT value FROM settings WHERE key = 'panel'`).Scan(&raw)
	if err == nil {
		var loaded PanelSettings
		if json.Unmarshal([]byte(raw), &loaded) == nil {
			s.current = normalizeSettings(loaded)
		}
		return
	}

	b, err := os.ReadFile(legacyFile)
	if err == nil {
		var loaded PanelSettings
		if json.Unmarshal(b, &loaded) == nil {
			s.current = normalizeSettings(loaded)
			_, _ = s.conn.Exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('panel', ?)`, string(b))
		}
	}
}

func (s *SettingsStore) Get() PanelSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

func (s *SettingsStore) Update(next PanelSettings) (PanelSettings, error) {
	normalized := normalizeSettings(next)
	b, err := json.Marshal(normalized)
	if err != nil {
		return PanelSettings{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		if _, err := s.conn.Exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('panel', ?)`, string(b)); err != nil {
			return PanelSettings{}, err
		}
	}
	s.current = normalized
	return normalized, nil
}

func normalizeSettings(in PanelSettings) PanelSettings {
	def := DefaultPanelSettings()
	if in.CPUAlertPercent < 10 || in.CPUAlertPercent > 100 {
		in.CPUAlertPercent = def.CPUAlertPercent
	}
	if in.MemAlertPercent < 10 || in.MemAlertPercent > 100 {
		in.MemAlertPercent = def.MemAlertPercent
	}
	if in.DiskAlertPercent < 10 || in.DiskAlertPercent > 100 {
		in.DiskAlertPercent = def.DiskAlertPercent
	}
	if in.RefreshIntervalSec != 2 && in.RefreshIntervalSec != 5 && in.RefreshIntervalSec != 10 {
		in.RefreshIntervalSec = def.RefreshIntervalSec
	}
	if in.DefaultLogTail != 100 && in.DefaultLogTail != 200 && in.DefaultLogTail != 500 {
		in.DefaultLogTail = def.DefaultLogTail
	}
	in.Bark.ServerURL = strings.TrimRight(strings.TrimSpace(in.Bark.ServerURL), "/")
	if in.Bark.ServerURL == "" {
		in.Bark.ServerURL = def.Bark.ServerURL
	}
	in.Bark.DeviceKey = strings.TrimSpace(in.Bark.DeviceKey)
	in.Bark.Group = strings.TrimSpace(in.Bark.Group)
	if in.Bark.Group == "" {
		in.Bark.Group = def.Bark.Group
	}
	return in
}
