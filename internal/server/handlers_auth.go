package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"weplane/internal/auth"
	"weplane/internal/notify"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	sess, err := s.auth.Authenticate(req.Username, req.Password)
	if err != nil {
		s.audit.Record(authAudit(r, "auth.login", req.Username, err))
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "用户名或密码错误")
		return
	}
	s.setSessionCookie(w, sess.Token, sess.ExpiresAt)
	s.audit.Record(authAudit(r, "auth.login", sess.Username, nil))
	if bark := s.settings.Get().Bark; bark.Enabled && bark.NotifyLogin && bark.DeviceKey != "" {
		ip := r.RemoteAddr
		go func(user, remote string) {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()
			_ = notify.SendBark(ctx, bark, "wePlane 登录提醒", fmt.Sprintf("管理员 %s 已登录（来源：%s）", user, remote))
		}(sess.Username, ip)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"username": sess.Username,
		"mockMode": s.provider.IsMock(),
	})
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	if s.auth.HasUsers() {
		writeError(w, http.StatusForbidden, "already_initialized", "系统已完成初始化")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	if err := s.auth.CreateOrUpdateUser(req.Username, req.Password); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	sess, err := s.auth.Authenticate(req.Username, req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "auth_error", err.Error())
		return
	}
	s.setSessionCookie(w, sess.Token, sess.ExpiresAt)
	writeJSON(w, http.StatusOK, map[string]any{
		"username": sess.Username,
		"mockMode": s.provider.IsMock(),
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.SessionCookieName); err == nil {
		s.auth.DeleteSession(c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	needsSetup := !s.auth.HasUsers()
	c, err := r.Cookie(auth.SessionCookieName)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"authenticated": false,
			"needsSetup":    needsSetup,
			"mockMode":      s.provider.IsMock(),
		})
		return
	}
	sess, ok := s.auth.GetSession(c.Value)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"authenticated": false,
			"needsSetup":    needsSetup,
			"mockMode":      s.provider.IsMock(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"username":      sess.Username,
		"needsSetup":    false,
		"mockMode":      s.provider.IsMock(),
	})
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.cfg.SecureCookie,
	})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	username := currentUser(r)
	err := s.auth.ChangePassword(username, req.OldPassword, req.NewPassword)
	s.recordAudit(r, "auth.password", username, err)
	if err != nil {
		writeError(w, http.StatusBadRequest, "password_change_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
