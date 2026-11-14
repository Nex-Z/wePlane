package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"weplane/internal/config"
)

var barkClient = &http.Client{Timeout: 8 * time.Second}

// SendBark sends a push notification via the Bark v2 JSON API.
func SendBark(ctx context.Context, cfg config.BarkSettings, title, body string) error {
	key := strings.TrimSpace(cfg.DeviceKey)
	if key == "" {
		return fmt.Errorf("请填写 Bark Device Key")
	}

	server := strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/")
	if server == "" {
		server = "https://api.day.app"
	}

	// Allow pasting a full Bark URL like https://api.day.app/<key>/ in DeviceKey.
	if strings.HasPrefix(key, "http://") || strings.HasPrefix(key, "https://") {
		trimmed := strings.TrimRight(key, "/")
		if idx := strings.LastIndex(trimmed, "/"); idx > 0 {
			server = trimmed[:idx]
			key = trimmed[idx+1:]
		}
	}

	payload := map[string]any{
		"title":      title,
		"body":       body,
		"device_key": key,
	}
	if group := strings.TrimSpace(cfg.Group); group != "" {
		payload["group"] = group
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, server+"/push", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := barkClient.Do(req)
	if err != nil {
		return fmt.Errorf("请求 Bark 服务失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("Bark 返回错误 %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}
