package server

import (
	"encoding/json"
	"net/http"
	"runtime"

	"weplane/internal/config"
	"weplane/internal/notify"
	"weplane/internal/version"
)

type runtimeInfoResponse struct {
	Version      string `json:"version"`
	Commit       string `json:"commit"`
	BuildTime    string `json:"buildTime"`
	Addr         string `json:"addr"`
	DataDir      string `json:"dataDir"`
	DockerSocket string `json:"dockerSocket"`
	MockMode     bool   `json:"mockMode"`
	GoVersion    string `json:"goVersion"`
	OS           string `json:"os"`
	Arch         string `json:"arch"`
}

func (s *Server) handleGetSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"settings": s.settings.Get(),
		"runtime": runtimeInfoResponse{
			Version:      version.Version,
			Commit:       version.Commit,
			BuildTime:    version.BuildTime,
			Addr:         s.cfg.Addr,
			DataDir:      s.cfg.DataDir,
			DockerSocket: s.cfg.DockerSocket,
			MockMode:     s.provider.IsMock(),
			GoVersion:    runtime.Version(),
			OS:           runtime.GOOS,
			Arch:         runtime.GOARCH,
		},
	})
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req config.PanelSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	updated, err := s.settings.Update(req)
	s.recordAudit(r, "settings.update", "panel", err)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings_save_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleTestBark(w http.ResponseWriter, r *http.Request) {
	cfg := s.settings.Get().Bark
	if r.Body != nil {
		var override config.BarkSettings
		if err := json.NewDecoder(r.Body).Decode(&override); err == nil {
			if override.ServerURL != "" {
				cfg.ServerURL = override.ServerURL
			}
			if override.DeviceKey != "" {
				cfg.DeviceKey = override.DeviceKey
			}
			if override.Group != "" {
				cfg.Group = override.Group
			}
		}
	}

	err := notify.SendBark(r.Context(), cfg, "wePlane 测试推送", "这是一条来自 wePlane 的 Bark 推送测试消息。")
	s.recordAudit(r, "settings.bark-test", "bark", err)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bark_test_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
