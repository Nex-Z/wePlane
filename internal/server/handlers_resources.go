package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"weplane/internal/audit"
	"weplane/internal/platform"

	"github.com/go-chi/chi/v5"
)

func authAudit(r *http.Request, action, target string, err error) audit.Entry {
	status := "success"
	detail := ""
	if err != nil {
		status = "error"
		detail = err.Error()
	}
	return audit.Entry{
		User:     target,
		RemoteIP: r.RemoteAddr,
		Action:   action,
		Target:   target,
		Status:   status,
		Detail:   detail,
	}
}

func (s *Server) handleHostInfo(w http.ResponseWriter, r *http.Request) {
	info, err := s.provider.System().GetHostInfo(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "system_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := s.provider.System().GetSnapshot(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "system_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	var from, to time.Time

	if rawFrom := r.URL.Query().Get("from"); rawFrom != "" {
		if t, err := time.Parse(time.RFC3339, rawFrom); err == nil {
			from = t
		}
	}
	if rawTo := r.URL.Query().Get("to"); rawTo != "" {
		if t, err := time.Parse(time.RFC3339, rawTo); err == nil {
			to = t
		}
	}
	if from.IsZero() {
		rng := r.URL.Query().Get("range")
		dur := 5 * time.Minute
		switch rng {
		case "2m":
			dur = 2 * time.Minute
		case "5m":
			dur = 5 * time.Minute
		case "15m":
			dur = 15 * time.Minute
		case "30m":
			dur = 30 * time.Minute
		case "1h":
			dur = 1 * time.Hour
		case "3h":
			dur = 3 * time.Hour
		case "6h":
			dur = 6 * time.Hour
		case "12h":
			dur = 12 * time.Hour
		case "24h":
			dur = 24 * time.Hour
		case "3d":
			dur = 3 * 24 * time.Hour
		case "7d":
			dur = 7 * 24 * time.Hour
		case "15d":
			dur = 15 * 24 * time.Hour
		case "30d":
			dur = 30 * 24 * time.Hour
		case "90d":
			dur = 90 * 24 * time.Hour
		case "180d":
			dur = 180 * 24 * time.Hour
		}
		from = now.Add(-dur)
	}
	if to.IsZero() {
		to = now
	}

	points := s.history.Query(from, to, 120)
	writeJSON(w, http.StatusOK, points)
}

func (s *Server) handleTopProcesses(w http.ResponseWriter, r *http.Request) {
	sortBy := r.URL.Query().Get("sort")
	if sortBy != "mem" {
		sortBy = "cpu"
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 10
	}
	procs, err := s.provider.System().TopProcesses(r.Context(), sortBy, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "process_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, procs)
}

func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request) {
	units, err := s.provider.Service().ListUnits(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "systemd_error", err.Error())
		return
	}
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	state := strings.TrimSpace(r.URL.Query().Get("state"))

	if q != "" || state != "" {
		filtered := make([]platform.ServiceUnit, 0, len(units))
		for _, u := range units {
			if state != "" && u.ActiveState != state {
				continue
			}
			if q != "" && !strings.Contains(strings.ToLower(u.Name), q) && !strings.Contains(strings.ToLower(u.Description), q) {
				continue
			}
			filtered = append(filtered, u)
		}
		units = filtered
	}
	writeJSON(w, http.StatusOK, units)
}

func (s *Server) handleGetService(w http.ResponseWriter, r *http.Request) {
	unit := chi.URLParam(r, "unit")
	detail, err := s.provider.Service().GetUnit(r.Context(), unit)
	if err != nil {
		writeError(w, http.StatusNotFound, "unit_not_found", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleControlService(w http.ResponseWriter, r *http.Request) {
	unit := chi.URLParam(r, "unit")
	var req struct {
		Action platform.ServiceAction `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	if (req.Action == platform.ServiceActionStop || req.Action == platform.ServiceActionDisable) && !hasConfirmHeader(r) {
		writeError(w, http.StatusPreconditionRequired, "confirm_required", "停止或禁用服务需要二次确认")
		return
	}

	err := s.provider.Service().ControlUnit(r.Context(), unit, req.Action)
	s.recordAudit(r, "service."+string(req.Action), unit, err)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "systemd_action_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"unit": unit, "action": req.Action})
}

func (s *Server) handleListContainers(w http.ResponseWriter, r *http.Request) {
	all := r.URL.Query().Get("all") != "false"
	list, err := s.provider.Container().ListContainers(r.Context(), all)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "docker_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleInspectContainer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	detail, err := s.provider.Container().InspectContainer(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "container_not_found", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleControlContainer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Action platform.ContainerAction `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	if req.Action == platform.ContainerActionStop && !hasConfirmHeader(r) {
		writeError(w, http.StatusPreconditionRequired, "confirm_required", "停止容器需要二次确认")
		return
	}

	err := s.provider.Container().ControlContainer(r.Context(), id, req.Action)
	s.recordAudit(r, "container."+string(req.Action), id, err)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "docker_action_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "action": req.Action})
}

func (s *Server) handleListAudit(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	entries, err := s.audit.Recent(limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "audit_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entries)
}
