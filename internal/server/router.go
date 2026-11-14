package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"weplane/internal/audit"
	"weplane/internal/auth"
	"weplane/internal/config"
	"weplane/internal/metrics"
	"weplane/internal/platform"
	"weplane/internal/webembed"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type ctxKey string

const userCtxKey ctxKey = "weplane_user"

// Server wires HTTP/WS routes to auth, audit, and the OS platform provider.
type Server struct {
	cfg      config.Config
	provider platform.Provider
	auth     *auth.Store
	audit    *audit.Logger
	history  *metrics.HistoryStore
	settings *config.SettingsStore
	router   chi.Router
}

func New(cfg config.Config, provider platform.Provider, authStore *auth.Store, auditLogger *audit.Logger, history ...*metrics.HistoryStore) *Server {
	var hist *metrics.HistoryStore
	if len(history) > 0 && history[0] != nil {
		hist = history[0]
	} else {
		hist = metrics.NewHistoryStore(provider.IsMock())
	}
	s := &Server{
		cfg:      cfg,
		provider: provider,
		auth:     authStore,
		audit:    auditLogger,
		history:  hist,
		settings: config.NewSettingsStore(cfg.DataDir),
		router:   chi.NewRouter(),
	}
	s.mountRoutes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) mountRoutes() {
	r := s.router
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/auth/login", s.handleLogin)
		api.Post("/auth/logout", s.handleLogout)
		api.Post("/auth/setup", s.handleSetup)
		api.Get("/auth/me", s.handleMe)

		api.Group(func(priv chi.Router) {
			priv.Use(s.requireAuth)

			priv.Get("/system/info", s.handleHostInfo)
			priv.Get("/system/snapshot", s.handleSnapshot)
			priv.Get("/system/history", s.handleHistory)
			priv.Get("/system/processes", s.handleTopProcesses)

			priv.Get("/services", s.handleListServices)
			priv.Post("/services", s.handleCreateService)
			priv.Post("/services/daemon-reload", s.handleDaemonReload)
			priv.Get("/services/{unit}", s.handleGetService)
			priv.Delete("/services/{unit}", s.handleDeleteService)
			priv.Post("/services/{unit}/action", s.handleControlService)

			priv.Get("/containers", s.handleListContainers)
			priv.Post("/containers", s.handleCreateContainer)
			priv.Get("/containers/{id}", s.handleInspectContainer)
			priv.Delete("/containers/{id}", s.handleDeleteContainer)
			priv.Post("/containers/{id}/action", s.handleControlContainer)

			priv.Post("/compose/deploy", s.handleDeployCompose)
			priv.Post("/compose/{project}/action", s.handleControlCompose)

			priv.Get("/audit", s.handleListAudit)
			priv.Post("/auth/password", s.handleChangePassword)
			priv.Get("/settings", s.handleGetSettings)
			priv.Put("/settings", s.handleUpdateSettings)
			priv.Post("/settings/bark/test", s.handleTestBark)

			priv.Get("/files", s.handleListFiles)
			priv.Get("/files/content", s.handleReadFile)
			priv.Put("/files/content", s.handleWriteFile)
			priv.Post("/files/mkdir", s.handleMkdir)
			priv.Post("/files/upload", s.handleUploadFile)
			priv.Get("/files/download", s.handleDownloadFile)
			priv.Delete("/files", s.handleDeleteFile)

			priv.Get("/events/metrics", s.handleMetricsSSE)
			priv.Get("/ws/logs", s.handleLogsWS)
			priv.Get("/ws/terminal", s.handleTerminalWS)
		})
	})

	r.Handle("/*", webembed.Handler())
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(auth.SessionCookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
			return
		}
		sess, ok := s.auth.GetSession(c.Value)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "会话已过期，请重新登录")
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, sess.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func currentUser(r *http.Request) string {
	if u, ok := r.Context().Value(userCtxKey).(string); ok {
		return u
	}
	return "anonymous"
}

func (s *Server) recordAudit(r *http.Request, action, target string, err error) {
	if s.audit == nil {
		return
	}
	status := "success"
	detail := ""
	if err != nil {
		status = "error"
		detail = err.Error()
	}
	s.audit.Record(audit.Entry{
		User:     currentUser(r),
		RemoteIP: r.RemoteAddr,
		Action:   action,
		Target:   target,
		Status:   status,
		Detail:   detail,
	})
}

func hasConfirmHeader(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("X-Weplane-Confirm"), "true")
}

type apiEnvelope struct {
	Data  any       `json:"data,omitempty"`
	Error *apiError `json:"error,omitempty"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(apiEnvelope{Data: data})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(apiEnvelope{
		Error: &apiError{Code: code, Message: message},
	})
}
