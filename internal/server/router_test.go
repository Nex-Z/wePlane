package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"weplane/internal/audit"
	"weplane/internal/auth"
	"weplane/internal/config"
	"weplane/internal/platform/mock"
	"weplane/internal/server"
)

func newTestServer(t *testing.T) http.Handler {
	t.Helper()
	dir := t.TempDir()
	cfg := config.Config{DataDir: dir, MockMode: true}

	authStore, err := auth.NewStore(dir)
	if err != nil {
		t.Fatalf("auth.NewStore: %v", err)
	}
	if err := authStore.EnsureMockAdmin(); err != nil {
		t.Fatalf("EnsureMockAdmin: %v", err)
	}
	auditLogger, err := audit.NewLogger(dir)
	if err != nil {
		t.Fatalf("audit.NewLogger: %v", err)
	}
	srv := server.New(cfg, mock.NewProvider(), authStore, auditLogger)
	t.Cleanup(func() { _ = srv.Close() })
	return srv.Handler()
}

func TestAuthAndProtectedEndpoints(t *testing.T) {
	h := newTestServer(t)

	// 1. Unauthenticated request is rejected
	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/snapshot", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	// 2. Login as mock admin
	loginBody, _ := json.Marshal(map[string]string{"username": "admin", "password": "weplane"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on login, got %d: %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected session cookie")
	}
	sessionCookie := cookies[0]

	// 3. Authenticated snapshot succeeds
	req = httptest.NewRequest(http.MethodGet, "/api/v1/system/snapshot", nil)
	req.AddCookie(sessionCookie)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on snapshot, got %d", rec.Code)
	}

	// 4. Stopping a service without confirm header returns 428
	stopBody, _ := json.Marshal(map[string]string{"action": "stop"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/services/caddy.service/action", bytes.NewReader(stopBody))
	req.AddCookie(sessionCookie)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("expected 428 without confirm header, got %d", rec.Code)
	}

	// 5. Stopping with confirm header succeeds
	req = httptest.NewRequest(http.MethodPost, "/api/v1/services/caddy.service/action", bytes.NewReader(stopBody))
	req.AddCookie(sessionCookie)
	req.Header.Set("X-Weplane-Confirm", "true")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with confirm header, got %d: %s", rec.Code, rec.Body.String())
	}

	// 6. File listing works in mock mode
	req = httptest.NewRequest(http.MethodGet, "/api/v1/files?path=/", nil)
	req.AddCookie(sessionCookie)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on files list, got %d: %s", rec.Code, rec.Body.String())
	}
}
