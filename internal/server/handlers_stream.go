package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"weplane/internal/platform"

	"github.com/coder/websocket"
)

func (s *Server) handleMetricsSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "sse_unsupported", "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	sendSnapshot := func() bool {
		snap, err := s.provider.System().GetSnapshot(r.Context())
		if err != nil {
			return false
		}
		payload, err := json.Marshal(snap)
		if err != nil {
			return false
		}
		_, err = fmt.Fprintf(w, "event: metrics\ndata: %s\n\n", payload)
		if err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	if !sendSnapshot() {
		return
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			if !sendSnapshot() {
				return
			}
		}
	}
}

func (s *Server) handleLogsWS(w http.ResponseWriter, r *http.Request) {
	logType := r.URL.Query().Get("type")
	target := r.URL.Query().Get("target")
	tail, _ := strconv.Atoi(r.URL.Query().Get("tail"))
	if tail <= 0 {
		tail = 100
	}

	var (
		ch  <-chan platform.LogLine
		err error
	)
	switch logType {
	case "service":
		ch, err = s.provider.Service().StreamLogs(r.Context(), target, tail)
	case "container":
		ch, err = s.provider.Container().StreamLogs(r.Context(), target, tail)
	default:
		writeError(w, http.StatusBadRequest, "bad_request", "type must be service or container")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "log_stream_error", err.Error())
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Same-origin cookie auth is already enforced by requireAuth.
	})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "stream closed")

	ctx := conn.CloseRead(r.Context())
	for {
		select {
		case <-ctx.Done():
			return
		case line, ok := <-ch:
			if !ok {
				return
			}
			b, err := json.Marshal(line)
			if err != nil {
				continue
			}
			if err := conn.Write(ctx, websocket.MessageText, b); err != nil {
				return
			}
		}
	}
}
