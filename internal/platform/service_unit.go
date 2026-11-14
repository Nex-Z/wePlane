package platform

import (
	"fmt"
	"regexp"
	"strings"
)

var validServiceNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@_.:-]*\.service$`)

// NormalizeServiceName ensures the service unit name ends with .service and contains only safe characters.
func NormalizeServiceName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", fmt.Errorf("服务名称不能为空")
	}
	if !strings.HasSuffix(name, ".service") {
		name += ".service"
	}
	if !validServiceNamePattern.MatchString(name) || strings.Contains(name, "..") {
		return "", fmt.Errorf("服务名称不合法：%q", raw)
	}
	return name, nil
}

// BuildSystemdUnitContent validates CreateServiceRequest and renders the final systemd unit file content.
func BuildSystemdUnitContent(req CreateServiceRequest) (string, error) {
	if raw := strings.TrimSpace(req.UnitContent); raw != "" {
		if !strings.HasSuffix(raw, "\n") {
			raw += "\n"
		}
		return raw, nil
	}

	execStart := strings.TrimSpace(req.ExecStart)
	if execStart == "" {
		return "", fmt.Errorf("启动命令 ExecStart 不能为空")
	}

	desc := strings.TrimSpace(req.Description)
	if desc == "" {
		desc = strings.TrimSuffix(strings.TrimSpace(req.Name), ".service")
	}
	after := strings.TrimSpace(req.After)
	if after == "" {
		after = "network-online.target"
	}
	restart := strings.TrimSpace(req.Restart)
	if restart == "" {
		restart = "on-failure"
	}

	var b strings.Builder
	b.WriteString("[Unit]\n")
	fmt.Fprintf(&b, "Description=%s\n", desc)
	fmt.Fprintf(&b, "After=%s\n", after)
	if strings.Contains(after, "network-online.target") {
		b.WriteString("Wants=network-online.target\n")
	}
	b.WriteString("\n[Service]\n")
	b.WriteString("Type=simple\n")
	if u := strings.TrimSpace(req.User); u != "" {
		fmt.Fprintf(&b, "User=%s\n", u)
	}
	if wd := strings.TrimSpace(req.WorkingDirectory); wd != "" {
		fmt.Fprintf(&b, "WorkingDirectory=%s\n", wd)
	}
	for _, line := range strings.Split(req.Environment, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fmt.Fprintf(&b, "Environment=%q\n", line)
	}
	fmt.Fprintf(&b, "ExecStart=%s\n", execStart)
	fmt.Fprintf(&b, "Restart=%s\n", restart)
	b.WriteString("RestartSec=5s\n")
	b.WriteString("\n[Install]\n")
	b.WriteString("WantedBy=multi-user.target\n")
	return b.String(), nil
}
