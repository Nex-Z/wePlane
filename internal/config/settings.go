package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

// SettingsStore persists PanelSettings to <DataDir>/settings.json.
type SettingsStore struct {
	mu       sync.RWMutex
	filePath string
	current  PanelSettings
}

func NewSettingsStore(dataDir string) *SettingsStore {
	s := &SettingsStore{
		filePath: filepath.Join(dataDir, "settings.json"),
		current:  DefaultPanelSettings(),
	}
	s.load()
	return s
}

func (s *SettingsStore) load() {
	b, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	var loaded PanelSettings
	if err := json.Unmarshal(b, &loaded); err != nil {
		return
	}
	s.current = normalizeSettings(loaded)
}

func (s *SettingsStore) Get() PanelSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

func (s *SettingsStore) Update(next PanelSettings) (PanelSettings, error) {
	normalized := normalizeSettings(next)
	b, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return PanelSettings{}, err
	}
	if err := os.MkdirAll(filepath.Dir(s.filePath), 0o700); err != nil && !errors.Is(err, os.ErrExist) {
		return PanelSettings{}, err
	}
	if err := os.WriteFile(s.filePath, b, 0o600); err != nil {
		return PanelSettings{}, err
	}
	s.mu.Lock()
	s.current = normalized
	s.mu.Unlock()
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
