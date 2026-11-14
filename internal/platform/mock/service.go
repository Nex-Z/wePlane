package mock

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"weplane/internal/platform"
)

type serviceProvider struct {
	mu    sync.RWMutex
	units map[string]*platform.ServiceDetail
}

func newServiceProvider() *serviceProvider {
	now := time.Now()
	seed := []*platform.ServiceDetail{
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "ssh.service", Description: "OpenBSD Secure Shell server",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 1042, MemoryBytes: 18 * 1024 * 1024, IsCritical: true,
			},
			ExecStart: "/usr/sbin/sshd -D", FragmentPath: "/usr/lib/systemd/system/ssh.service",
			ActiveEnterAt: now.Add(-14 * 24 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "docker.service", Description: "Docker Application Container Engine",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 1388, MemoryBytes: 142 * 1024 * 1024, IsCritical: true,
			},
			ExecStart: "/usr/bin/dockerd -H fd://", FragmentPath: "/usr/lib/systemd/system/docker.service",
			ActiveEnterAt: now.Add(-14 * 24 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "containerd.service", Description: "containerd container runtime",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 1210, MemoryBytes: 68 * 1024 * 1024, IsCritical: true,
			},
			ExecStart: "/usr/bin/containerd", FragmentPath: "/usr/lib/systemd/system/containerd.service",
			ActiveEnterAt: now.Add(-14 * 24 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "caddy.service", Description: "Caddy Web Server & Reverse Proxy",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 1624, MemoryBytes: 44 * 1024 * 1024,
			},
			ExecStart: "/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile", FragmentPath: "/usr/lib/systemd/system/caddy.service",
			ActiveEnterAt: now.Add(-6 * 24 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "tailscaled.service", Description: "Tailscale node agent",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 1510, MemoryBytes: 56 * 1024 * 1024,
			},
			ExecStart: "/usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state", FragmentPath: "/usr/lib/systemd/system/tailscaled.service",
			ActiveEnterAt: now.Add(-14 * 24 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "postgresql.service", Description: "PostgreSQL RDBMS",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 1790, MemoryBytes: 215 * 1024 * 1024,
			},
			ExecStart: "/usr/lib/postgresql/17/bin/postgres", FragmentPath: "/usr/lib/systemd/system/postgresql.service",
			ActiveEnterAt: now.Add(-10 * 24 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "backup-sync.service", Description: "Nightly Restic Offsite Backup",
				LoadState: "loaded", ActiveState: "failed", SubState: "failed",
				UnitFileState: "enabled", MainPID: 0, MemoryBytes: 0,
			},
			ExecStart: "/usr/local/bin/backup-sync.sh", FragmentPath: "/etc/systemd/system/backup-sync.service",
			ActiveEnterAt: now.Add(-12 * time.Hour).Format(time.RFC3339),
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "nginx.service", Description: "A high performance web server",
				LoadState: "loaded", ActiveState: "inactive", SubState: "dead",
				UnitFileState: "disabled", MainPID: 0, MemoryBytes: 0,
			},
			ExecStart: "/usr/sbin/nginx -g daemon on;", FragmentPath: "/usr/lib/systemd/system/nginx.service",
			ActiveEnterAt: "",
		},
		{
			ServiceUnit: platform.ServiceUnit{
				Name: "weplane.service", Description: "wePlane Server Control Center",
				LoadState: "loaded", ActiveState: "active", SubState: "running",
				UnitFileState: "enabled", MainPID: 2048, MemoryBytes: 28 * 1024 * 1024, IsCritical: true,
			},
			ExecStart: "/usr/local/bin/weplane serve", FragmentPath: "/etc/systemd/system/weplane.service",
			ActiveEnterAt: now.Add(-3 * time.Hour).Format(time.RFC3339),
		},
	}

	m := make(map[string]*platform.ServiceDetail, len(seed))
	for _, u := range seed {
		m[u.Name] = u
	}
	return &serviceProvider{units: m}
}

func (s *serviceProvider) ListUnits(_ context.Context) ([]platform.ServiceUnit, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]platform.ServiceUnit, 0, len(s.units))
	for _, u := range s.units {
		out = append(out, u.ServiceUnit)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].ActiveState != out[j].ActiveState {
			if out[i].ActiveState == "failed" {
				return true
			}
			if out[j].ActiveState == "failed" {
				return false
			}
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (s *serviceProvider) GetUnit(_ context.Context, name string) (*platform.ServiceDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	u, ok := s.units[name]
	if !ok {
		return nil, fmt.Errorf("unit %q not found", name)
	}
	copyVal := *u
	return &copyVal, nil
}

func (s *serviceProvider) ControlUnit(_ context.Context, name string, action platform.ServiceAction) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	u, ok := s.units[name]
	if !ok {
		return fmt.Errorf("unit %q not found", name)
	}

	switch action {
	case platform.ServiceActionStart, platform.ServiceActionRestart:
		u.ActiveState = "active"
		u.SubState = "running"
		if u.MainPID == 0 {
			u.MainPID = 3200 + uint32(time.Now().Unix()%500)
		}
		if u.MemoryBytes == 0 {
			u.MemoryBytes = 24 * 1024 * 1024
		}
		u.ActiveEnterAt = time.Now().Format(time.RFC3339)
	case platform.ServiceActionStop:
		u.ActiveState = "inactive"
		u.SubState = "dead"
		u.MainPID = 0
		u.MemoryBytes = 0
	case platform.ServiceActionEnable:
		u.UnitFileState = "enabled"
	case platform.ServiceActionDisable:
		u.UnitFileState = "disabled"
	default:
		return fmt.Errorf("unsupported service action: %s", action)
	}
	return nil
}

func (s *serviceProvider) StreamLogs(ctx context.Context, name string, tail int) (<-chan platform.LogLine, error) {
	s.mu.RLock()
	u, ok := s.units[name]
	s.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("unit %q not found", name)
	}

	ch := make(chan platform.LogLine, 64)
	go func() {
		defer close(ch)

		base := time.Now().Add(-time.Duration(tail) * time.Second)
		initial := []string{
			fmt.Sprintf("Started %s (%s).", u.Name, u.Description),
			fmt.Sprintf("[%s] listening and ready for incoming work", u.Name),
			fmt.Sprintf("[%s] healthcheck passed (pid=%d)", u.Name, u.MainPID),
		}
		if u.ActiveState == "failed" {
			initial = append(initial, fmt.Sprintf("[%s] ERROR: exit-code 1 (connection timeout to remote target)", u.Name))
		}
		for i, msg := range initial {
			select {
			case <-ctx.Done():
				return
			case ch <- platform.LogLine{Timestamp: base.Add(time.Duration(i) * time.Second), Stream: "journal", Message: msg}:
			}
		}

		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		seq := 1
		for {
			select {
			case <-ctx.Done():
				return
			case t := <-ticker.C:
				msg := fmt.Sprintf("[%s] heartbeat tick #%d (state=%s)", u.Name, seq, u.ActiveState)
				seq++
				select {
				case ch <- platform.LogLine{Timestamp: t, Stream: "journal", Message: msg}:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
