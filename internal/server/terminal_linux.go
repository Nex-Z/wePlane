//go:build linux

package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sync"

	"github.com/coder/websocket"
	"github.com/creack/pty"
)

type terminalControlMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
	Data string `json:"data"`
}

func (s *Server) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "closed")

	shell := "/bin/bash"
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = "/"
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	s.recordAudit(r, "terminal.open", shell, err)
	if err != nil {
		_ = conn.Write(ctx, websocket.MessageText, []byte("\r\n[wePlane] 启动终端失败: "+err.Error()+"\r\n"))
		return
	}
	defer func() {
		_ = ptmx.Close()
		_ = cmd.Wait()
	}()

	var writeMu sync.Mutex
	wsWrite := func(data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.Write(ctx, websocket.MessageText, data)
	}

	// PTY -> WebSocket
	go func() {
		defer cancel()
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				if wErr := wsWrite(buf[:n]); wErr != nil {
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					_ = wsWrite([]byte("\r\n[wePlane] 终端会话已结束\r\n"))
				}
				return
			}
		}
	}()

	// WebSocket -> PTY
	for {
		_, msg, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var ctrl terminalControlMsg
		if len(msg) > 0 && msg[0] == '{' && json.Unmarshal(msg, &ctrl) == nil && ctrl.Type != "" {
			switch ctrl.Type {
			case "resize":
				if ctrl.Cols > 0 && ctrl.Rows > 0 {
					_ = pty.Setsize(ptmx, &pty.Winsize{Rows: ctrl.Rows, Cols: ctrl.Cols})
				}
			case "input":
				if ctrl.Data != "" {
					_, _ = ptmx.Write([]byte(ctrl.Data))
				}
			}
			continue
		}
		_, _ = ptmx.Write(msg)
	}
}
