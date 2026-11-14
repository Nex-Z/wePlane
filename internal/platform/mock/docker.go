package mock

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"weplane/internal/platform"
)

type containerProvider struct {
	mu         sync.RWMutex
	containers map[string]*platform.ContainerDetail
}

func newContainerProvider() *containerProvider {
	now := time.Now()
	seed := []*platform.ContainerDetail{
		{
			ContainerSummary: platform.ContainerSummary{
				ID: "a1b2c3d4e5f60001", ShortID: "a1b2c3d4e5f6", Name: "jellyfin",
				Image: "jellyfin/jellyfin:10.10.3", State: "running", Status: "Up 12 days",
				CreatedAt: now.Add(-12 * 24 * time.Hour), ComposeProject: "media-stack", ComposeService: "jellyfin",
				Ports:      []platform.ContainerPort{{PrivatePort: 8096, PublicPort: 8096, Type: "tcp", IP: "0.0.0.0"}},
				Networks:   []string{"media-stack_default"},
				Mounts:     []platform.ContainerMount{{Type: "bind", Source: "/mnt/data/media", Destination: "/media", Mode: "ro", RW: false}},
				CPUPercent: 4.2, MemoryBytes: 640 * 1024 * 1024, MemoryLimitBytes: 4 * 1024 * 1024 * 1024,
			},
			Command: "/jellyfin/jellyfin", RestartPolicy: "unless-stopped",
			EnvKeys: []string{"TZ", "PUID", "PGID", "JELLYFIN_PublishedServerUrl"},
		},
		{
			ContainerSummary: platform.ContainerSummary{
				ID: "b2c3d4e5f6a10002", ShortID: "b2c3d4e5f6a1", Name: "qbittorrent",
				Image: "lscr.io/linuxserver/qbittorrent:latest", State: "running", Status: "Up 12 days",
				CreatedAt: now.Add(-12 * 24 * time.Hour), ComposeProject: "media-stack", ComposeService: "qbittorrent",
				Ports:      []platform.ContainerPort{{PrivatePort: 8080, PublicPort: 8081, Type: "tcp", IP: "0.0.0.0"}},
				Networks:   []string{"media-stack_default"},
				Mounts:     []platform.ContainerMount{{Type: "bind", Source: "/mnt/data/downloads", Destination: "/downloads", Mode: "rw", RW: true}},
				CPUPercent: 1.8, MemoryBytes: 210 * 1024 * 1024, MemoryLimitBytes: 2 * 1024 * 1024 * 1024,
			},
			Command: "/init", RestartPolicy: "unless-stopped",
			EnvKeys: []string{"TZ", "PUID", "PGID", "WEBUI_PORT"},
		},
		{
			ContainerSummary: platform.ContainerSummary{
				ID: "c3d4e5f6a1b20003", ShortID: "c3d4e5f6a1b2", Name: "grafana",
				Image: "grafana/grafana-oss:11.4.0", State: "running", Status: "Up 6 days",
				CreatedAt: now.Add(-20 * 24 * time.Hour), ComposeProject: "monitoring", ComposeService: "grafana",
				Ports:      []platform.ContainerPort{{PrivatePort: 3000, PublicPort: 3000, Type: "tcp", IP: "127.0.0.1"}},
				Networks:   []string{"monitoring_net"},
				Mounts:     []platform.ContainerMount{{Type: "volume", Source: "grafana-storage", Destination: "/var/lib/grafana", Mode: "rw", RW: true}},
				CPUPercent: 0.6, MemoryBytes: 156 * 1024 * 1024, MemoryLimitBytes: 1024 * 1024 * 1024,
			},
			Command: "/run.sh", RestartPolicy: "always",
			EnvKeys: []string{"GF_SECURITY_ADMIN_USER", "GF_USERS_ALLOW_SIGN_UP"},
		},
		{
			ContainerSummary: platform.ContainerSummary{
				ID: "d4e5f6a1b2c30004", ShortID: "d4e5f6a1b2c3", Name: "prometheus",
				Image: "prom/prometheus:v3.1.0", State: "exited", Status: "Exited (0) 2 hours ago",
				CreatedAt: now.Add(-20 * 24 * time.Hour), ComposeProject: "monitoring", ComposeService: "prometheus",
				Ports:      []platform.ContainerPort{{PrivatePort: 9090, PublicPort: 9090, Type: "tcp", IP: "127.0.0.1"}},
				Networks:   []string{"monitoring_net"},
				Mounts:     []platform.ContainerMount{{Type: "volume", Source: "prom-data", Destination: "/prometheus", Mode: "rw", RW: true}},
				CPUPercent: 0, MemoryBytes: 0, MemoryLimitBytes: 1024 * 1024 * 1024,
			},
			Command: "/bin/prometheus --config.file=/etc/prometheus/prometheus.yml", RestartPolicy: "unless-stopped",
			EnvKeys: []string{"TZ"},
		},
		{
			ContainerSummary: platform.ContainerSummary{
				ID: "e5f6a1b2c3d40005", ShortID: "e5f6a1b2c3d4", Name: "vaultwarden",
				Image: "vaultwarden/server:1.32.7", State: "running", Status: "Up 14 days",
				CreatedAt: now.Add(-45 * 24 * time.Hour),
				Ports:      []platform.ContainerPort{{PrivatePort: 80, PublicPort: 8222, Type: "tcp", IP: "127.0.0.1"}},
				Networks:   []string{"bridge"},
				Mounts:     []platform.ContainerMount{{Type: "bind", Source: "/srv/vaultwarden/data", Destination: "/data", Mode: "rw", RW: true}},
				CPUPercent: 0.2, MemoryBytes: 42 * 1024 * 1024, MemoryLimitBytes: 512 * 1024 * 1024, IsCritical: true,
			},
			Command: "/start.sh", RestartPolicy: "always",
			EnvKeys: []string{"DOMAIN", "SIGNUPS_ALLOWED", "ADMIN_TOKEN"},
		},
	}

	m := make(map[string]*platform.ContainerDetail, len(seed))
	for _, c := range seed {
		m[c.ID] = c
	}
	return &containerProvider{containers: m}
}

func (c *containerProvider) ListContainers(_ context.Context, all bool) ([]platform.ContainerSummary, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make([]platform.ContainerSummary, 0, len(c.containers))
	for _, ctr := range c.containers {
		if !all && ctr.State != "running" {
			continue
		}
		out = append(out, ctr.ContainerSummary)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].ComposeProject != out[j].ComposeProject {
			return out[i].ComposeProject < out[j].ComposeProject
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (c *containerProvider) InspectContainer(_ context.Context, id string) (*platform.ContainerDetail, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	ctr, ok := c.findLocked(id)
	if !ok {
		return nil, fmt.Errorf("container %q not found", id)
	}
	copyVal := *ctr
	return &copyVal, nil
}

func (c *containerProvider) ControlContainer(_ context.Context, id string, action platform.ContainerAction) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	ctr, ok := c.findLocked(id)
	if !ok {
		return fmt.Errorf("container %q not found", id)
	}

	switch action {
	case platform.ContainerActionStart, platform.ContainerActionRestart:
		ctr.State = "running"
		ctr.Status = "Up Less than a minute"
		if ctr.MemoryBytes == 0 {
			ctr.MemoryBytes = 96 * 1024 * 1024
		}
		if ctr.CPUPercent == 0 {
			ctr.CPUPercent = 1.1
		}
	case platform.ContainerActionStop:
		ctr.State = "exited"
		ctr.Status = "Exited (0) Just now"
		ctr.CPUPercent = 0
		ctr.MemoryBytes = 0
	default:
		return fmt.Errorf("unsupported container action: %s", action)
	}
	return nil
}

func (c *containerProvider) DeleteContainer(_ context.Context, id string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	ctr, ok := c.findLocked(id)
	if !ok {
		return fmt.Errorf("container %q not found", id)
	}
	if ctr.IsCritical {
		return fmt.Errorf("拒绝删除关键容器 %s", ctr.Name)
	}
	delete(c.containers, ctr.ID)
	return nil
}

func (c *containerProvider) CreateContainer(_ context.Context, req platform.CreateContainerRequest) (string, error) {
	if strings.TrimSpace(req.Image) == "" {
		return "", fmt.Errorf("镜像名称不能为空")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("app-%d", time.Now().Unix()%10000)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.findLocked(name); exists {
		return "", fmt.Errorf("容器 %q 已存在", name)
	}

	id := fmt.Sprintf("f0e1d2c3b4a5%04d", len(c.containers)+1)
	state := "created"
	status := "Created"
	var mem uint64
	var cpu float64
	if req.AutoStart {
		state = "running"
		status = "Up Less than a minute"
		mem = 48 * 1024 * 1024
		cpu = 0.5
	}

	var ports []platform.ContainerPort
	for _, p := range req.Ports {
		parts := strings.Split(strings.TrimSpace(p), ":")
		if len(parts) == 2 {
			pub, _ := strconv.Atoi(parts[0])
			priv, _ := strconv.Atoi(strings.Split(parts[1], "/")[0])
			ports = append(ports, platform.ContainerPort{
				IP: "0.0.0.0", PublicPort: uint16(pub), PrivatePort: uint16(priv), Type: "tcp",
			})
		}
	}

	var mounts []platform.ContainerMount
	for _, v := range req.Volumes {
		parts := strings.SplitN(strings.TrimSpace(v), ":", 2)
		if len(parts) == 2 {
			mounts = append(mounts, platform.ContainerMount{
				Type: "bind", Source: parts[0], Destination: parts[1], Mode: "rw", RW: true,
			})
		}
	}

	var envKeys []string
	for _, e := range req.Env {
		if k, _, ok := strings.Cut(e, "="); ok && strings.TrimSpace(k) != "" {
			envKeys = append(envKeys, strings.TrimSpace(k))
		}
	}

	c.containers[id] = &platform.ContainerDetail{
		ContainerSummary: platform.ContainerSummary{
			ID: id, ShortID: id[:12], Name: name, Image: req.Image,
			State: state, Status: status, CreatedAt: time.Now(),
			Ports: ports, Networks: []string{"bridge"}, Mounts: mounts,
			CPUPercent: cpu, MemoryBytes: mem, MemoryLimitBytes: 1024 * 1024 * 1024,
		},
		EnvKeys:       envKeys,
		RestartPolicy: req.RestartPolicy,
	}
	return id, nil
}

func (c *containerProvider) DeployCompose(_ context.Context, req platform.ComposeDeployRequest) (string, error) {
	proj := strings.TrimSpace(req.Project)
	if proj == "" {
		return "", fmt.Errorf("项目名称不能为空")
	}
	if strings.TrimSpace(req.YAML) == "" {
		return "", fmt.Errorf("Compose YAML 内容不能为空")
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	id := fmt.Sprintf("c0a1b2c3d4e5%04d", len(c.containers)+1)
	svcName := proj + "-app"
	c.containers[id] = &platform.ContainerDetail{
		ContainerSummary: platform.ContainerSummary{
			ID: id, ShortID: id[:12], Name: svcName, Image: "nginx:alpine",
			State: "running", Status: "Up Less than a minute", CreatedAt: time.Now(),
			ComposeProject: proj, ComposeService: "app",
			Ports:            []platform.ContainerPort{{IP: "0.0.0.0", PublicPort: 8088, PrivatePort: 80, Type: "tcp"}},
			Networks:         []string{proj + "_default"},
			CPUPercent:       0.3,
			MemoryBytes:      24 * 1024 * 1024,
			MemoryLimitBytes: 512 * 1024 * 1024,
		},
		RestartPolicy: "unless-stopped",
	}
	return fmt.Sprintf("Project %s started (mock)", proj), nil
}

func (c *containerProvider) ControlCompose(_ context.Context, project, action string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	found := false
	for id, ctr := range c.containers {
		if ctr.ComposeProject != project {
			continue
		}
		found = true
		switch action {
		case "up", "restart":
			ctr.State = "running"
			ctr.Status = "Up Less than a minute"
			if ctr.MemoryBytes == 0 {
				ctr.MemoryBytes = 64 * 1024 * 1024
			}
		case "down":
			delete(c.containers, id)
		default:
			return "", fmt.Errorf("unsupported compose action: %s", action)
		}
	}
	if !found {
		return "", fmt.Errorf("compose project %q not found", project)
	}
	return fmt.Sprintf("compose %s %s completed", project, action), nil
}

func (c *containerProvider) StreamLogs(ctx context.Context, id string, tail int) (<-chan platform.LogLine, error) {
	c.mu.RLock()
	ctr, ok := c.findLocked(id)
	c.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("container %q not found", id)
	}

	ch := make(chan platform.LogLine, 64)
	go func() {
		defer close(ch)
		base := time.Now().Add(-time.Duration(tail) * time.Second)
		seed := []platform.LogLine{
			{Timestamp: base, Stream: "stdout", Message: fmt.Sprintf("[%s] starting %s", ctr.Name, ctr.Image)},
			{Timestamp: base.Add(time.Second), Stream: "stdout", Message: fmt.Sprintf("[%s] server listening on internal port", ctr.Name)},
		}
		for _, line := range seed {
			select {
			case <-ctx.Done():
				return
			case ch <- line:
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
				line := platform.LogLine{
					Timestamp: t,
					Stream:    "stdout",
					Message:   fmt.Sprintf("[%s] GET /health 200 OK (seq=%d)", ctr.Name, seq),
				}
				seq++
				select {
				case ch <- line:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}

func (c *containerProvider) findLocked(idOrName string) (*platform.ContainerDetail, bool) {
	if ctr, ok := c.containers[idOrName]; ok {
		return ctr, true
	}
	for _, ctr := range c.containers {
		if ctr.ShortID == idOrName || ctr.Name == idOrName {
			return ctr, true
		}
	}
	return nil, false
}
