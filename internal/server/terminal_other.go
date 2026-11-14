//go:build !linux

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
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

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	s.recordAudit(r, "terminal.open", "mock-shell", nil)

	prompt := "\x1b[36mroot@weplane-mock\x1b[0m:\x1b[34m/\x1b[0m# "
	welcome := "\r\nwePlane Web Terminal (Mock 模式)\r\n输入 \x1b[33mhelp\x1b[0m 查看模拟命令，生产 Linux 环境将直连 /bin/bash PTY。\r\n\r\n" + prompt
	_ = conn.Write(ctx, websocket.MessageText, []byte(welcome))

	var lineBuf strings.Builder
	for {
		_, msg, err := conn.Read(ctx)
		if err != nil {
			return
		}
		input := string(msg)
		var ctrl terminalControlMsg
		if len(msg) > 0 && msg[0] == '{' && json.Unmarshal(msg, &ctrl) == nil && ctrl.Type != "" {
			if ctrl.Type == "resize" {
				continue
			}
			if ctrl.Type == "input" {
				input = ctrl.Data
			}
		}

		for _, ch := range input {
			switch ch {
			case '\r', '\n':
				cmd := strings.TrimSpace(lineBuf.String())
				lineBuf.Reset()
				out := "\r\n" + evalMockCommand(cmd)
				if cmd == "clear" {
					out = "\x1b[2J\x1b[H"
				}
				_ = conn.Write(ctx, websocket.MessageText, []byte(out+prompt))
			case 0x7f, '\b':
				cur := lineBuf.String()
				if len(cur) > 0 {
					runes := []rune(cur)
					lineBuf.Reset()
					lineBuf.WriteString(string(runes[:len(runes)-1]))
					_ = conn.Write(ctx, websocket.MessageText, []byte("\b \b"))
				}
			case 0x03: // Ctrl+C
				lineBuf.Reset()
				_ = conn.Write(ctx, websocket.MessageText, []byte("^C\r\n"+prompt))
			default:
				if ch >= 32 {
					lineBuf.WriteRune(ch)
					_ = conn.Write(ctx, websocket.MessageText, []byte(string(ch)))
				}
			}
		}
	}
}

func evalMockCommand(cmd string) string {
	switch {
	case cmd == "":
		return ""
	case cmd == "help":
		return "可用模拟命令: help, uname -a, whoami, pwd, ls, date, uptime, clear\r\n"
	case cmd == "whoami":
		return "root\r\n"
	case cmd == "pwd":
		return "/\r\n"
	case cmd == "ls":
		return "compose.yml  nginx.conf  weplane.log  README.md\r\n"
	case cmd == "uname -a":
		return "Linux weplane-mock 6.12.0-amd64 #1 SMP Debian 13 x86_64 GNU/Linux\r\n"
	case cmd == "date":
		return time.Now().Format(time.RFC1123) + "\r\n"
	case cmd == "uptime":
		return "up 14 days, 3 hours, load average: 0.42, 0.38, 0.31\r\n"
	case strings.HasPrefix(cmd, "echo "):
		return strings.TrimPrefix(cmd, "echo ") + "\r\n"
	default:
		return fmt.Sprintf("mock-sh: %s: command simulated (Linux 生产环境将执行真实 bash)\r\n", cmd)
	}
}
