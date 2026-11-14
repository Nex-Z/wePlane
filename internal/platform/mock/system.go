package mock

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"weplane/internal/platform"
)

type systemProvider struct {
	mu         sync.Mutex
	bootTime   time.Time
	lastCPU    float64
	rxTotal    uint64
	txTotal    uint64
	services   *serviceProvider
	containers *containerProvider
	rng        *rand.Rand
}

func newSystemProvider(svc *serviceProvider, ctr *containerProvider) *systemProvider {
	return &systemProvider{
		bootTime:   time.Now().Add(-14*24*time.Hour - 6*time.Hour - 23*time.Minute),
		lastCPU:    24.5,
		rxTotal:    142_850_120_400,
		txTotal:    68_420_910_200,
		services:   svc,
		containers: ctr,
		rng:        rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *systemProvider) GetHostInfo(_ context.Context) (*platform.HostInfo, error) {
	return &platform.HostInfo{
		Hostname:    "debian-homelab",
		OS:          "Debian GNU/Linux 13 (trixie)",
		Kernel:      "6.12.12-amd64",
		Arch:        "amd64",
		CPUModel:    "AMD Ryzen 5 5600G with Radeon Graphics",
		CPUCores:    12,
		UptimeSec:   uint64(time.Since(s.bootTime).Seconds()),
		BootTime:    s.bootTime,
		Timezone:    "Asia/Shanghai (CST)",
		IPAddresses: []string{"192.168.10.24", "100.84.12.9"},
		MockMode:    true,
	}, nil
}

func (s *systemProvider) GetSnapshot(ctx context.Context) (*platform.MetricsSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delta := (s.rng.Float64() - 0.48) * 8.0
	s.lastCPU = math.Max(4.0, math.Min(92.0, s.lastCPU+delta))

	rxRate := 125_000 + s.rng.Float64()*950_000
	txRate := 48_000 + s.rng.Float64()*420_000
	s.rxTotal += uint64(rxRate * 2)
	s.txTotal += uint64(txRate * 2)

	memTotal := uint64(32) * 1024 * 1024 * 1024
	memUsed := uint64(142)*1024*1024*1024/10 + uint64(s.rng.Float64()*512*1024*1024)
	memAvail := memTotal - memUsed

	swapTotal := uint64(4 * 1024 * 1024 * 1024)
	swapUsed := uint64(256 * 1024 * 1024)

	disks := []platform.DiskMetrics{
		{
			MountPoint:  "/",
			Device:      "/dev/nvme0n1p2",
			FSType:      "ext4",
			TotalBytes:  500 * 1024 * 1024 * 1024,
			UsedBytes:   214 * 1024 * 1024 * 1024,
			UsedPercent: 42.8,
		},
		{
			MountPoint:  "/mnt/data",
			Device:      "/dev/sda1",
			FSType:      "ext4",
			TotalBytes:  4000 * 1024 * 1024 * 1024,
			UsedBytes:   3440 * 1024 * 1024 * 1024,
			UsedPercent: 86.0,
		},
	}

	alerts := []platform.SystemAlert{
		{
			ID:      "disk-mnt-data",
			Level:   "warning",
			Source:  "/mnt/data",
			Message: "挂载点 /mnt/data 空间使用率已达 86.0%",
		},
	}

	var workloads platform.WorkloadSummary
	if s.services != nil {
		units, _ := s.services.ListUnits(ctx)
		workloads.ServicesTotal = len(units)
		for _, u := range units {
			if u.ActiveState == "active" {
				workloads.ServicesActive++
			} else if u.ActiveState == "failed" {
				workloads.ServicesFailed++
				alerts = append(alerts, platform.SystemAlert{
					ID:      fmt.Sprintf("svc-%s", u.Name),
					Level:   "critical",
					Source:  u.Name,
					Message: fmt.Sprintf("systemd 服务 %s 当前处于 failed 状态", u.Name),
				})
			} else {
				workloads.ServicesInactive++
			}
		}
	}
	if s.containers != nil {
		ctrs, _ := s.containers.ListContainers(ctx, true)
		workloads.ContainersTotal = len(ctrs)
		for _, c := range ctrs {
			if c.State == "running" {
				workloads.ContainersRunning++
			} else if c.State == "restarting" || c.State == "dead" || (strings.Contains(c.Status, "Exited (") && !strings.HasPrefix(c.Status, "Exited (0)")) {
				workloads.ContainersError++
			} else {
				workloads.ContainersStopped++
			}
		}
	}

	diskReadRate := 1.2*1024*1024 + s.rng.Float64()*14.0*1024*1024
	diskWriteRate := 0.6*1024*1024 + s.rng.Float64()*8.5*1024*1024
	cpuTemp := math.Round((42.0+s.lastCPU*0.28+(s.rng.Float64()-0.5)*2.0)*10) / 10

	return &platform.MetricsSnapshot{
		Timestamp:       time.Now(),
		CPUUsagePercent: math.Round(s.lastCPU*10) / 10,
		CPUTempC:        &cpuTemp,
		Load1:           math.Round((s.lastCPU/100.0*4.2+0.15)*100) / 100,
		Load5:           1.18,
		Load15:          0.94,
		ProcsRunning:    1 + s.rng.Intn(3),
		ProcsTotal:      186,
		UptimeSec:       uint64(time.Since(s.bootTime).Seconds()),
		Memory: platform.MemoryMetrics{
			TotalBytes:     memTotal,
			UsedBytes:      memUsed,
			AvailableBytes: memAvail,
			UsedPercent:    math.Round(float64(memUsed)/float64(memTotal)*1000) / 10,
		},
		Swap: platform.MemoryMetrics{
			TotalBytes:     swapTotal,
			UsedBytes:      swapUsed,
			AvailableBytes: swapTotal - swapUsed,
			UsedPercent:    6.2,
		},
		Disks: disks,
		DiskIO: platform.DiskIOMetrics{
			ReadBytesPerSec:  math.Round(diskReadRate),
			WriteBytesPerSec: math.Round(diskWriteRate),
			ReadIOPS:         math.Round(diskReadRate / 65536),
			WriteIOPS:        math.Round(diskWriteRate / 65536),
		},
		Networks: []platform.NetworkMetrics{
			{
				Interface:     "enp3s0",
				RxBytesPerSec: rxRate,
				TxBytesPerSec: txRate,
				RxTotalBytes:  s.rxTotal,
				TxTotalBytes:  s.txTotal,
				IsUp:          true,
			},
			{
				Interface:     "tailscale0",
				RxBytesPerSec: rxRate * 0.08,
				TxBytesPerSec: txRate * 0.05,
				RxTotalBytes:  8_120_400_120,
				TxTotalBytes:  3_410_220_080,
				IsUp:          true,
			},
		},
		Alerts:    alerts,
		Workloads: workloads,
	}, nil
}

func (s *systemProvider) TopProcesses(_ context.Context, sortBy string, limit int) ([]platform.ProcessInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 || limit > 100 {
		limit = 10
	}
	memTotal := float64(32 * 1024 * 1024 * 1024)

	seed := []platform.ProcessInfo{
		{PID: 2184, Name: "jellyfin", User: "media", State: "S", CPUPercent: 8.4, MemBytes: 640 * 1024 * 1024, Command: "/jellyfin/jellyfin --datadir /config"},
		{PID: 1388, Name: "dockerd", User: "root", State: "S", CPUPercent: 4.1, MemBytes: 142 * 1024 * 1024, Command: "/usr/bin/dockerd -H fd://"},
		{PID: 1790, Name: "postgres", User: "postgres", State: "S", CPUPercent: 3.6, MemBytes: 285 * 1024 * 1024, Command: "/usr/lib/postgresql/17/bin/postgres -D /var/lib/postgresql/17/main"},
		{PID: 2290, Name: "qbittorrent-nox", User: "media", State: "R", CPUPercent: 3.2, MemBytes: 210 * 1024 * 1024, Command: "/usr/bin/qbittorrent-nox --webui-port=8081"},
		{PID: 1624, Name: "caddy", User: "caddy", State: "S", CPUPercent: 1.9, MemBytes: 44 * 1024 * 1024, Command: "/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile"},
		{PID: 2410, Name: "grafana", User: "grafana", State: "S", CPUPercent: 1.4, MemBytes: 156 * 1024 * 1024, Command: "/usr/share/grafana/bin/grafana server"},
		{PID: 1510, Name: "tailscaled", User: "root", State: "S", CPUPercent: 1.1, MemBytes: 56 * 1024 * 1024, Command: "/usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state"},
		{PID: 1210, Name: "containerd", User: "root", State: "S", CPUPercent: 0.9, MemBytes: 68 * 1024 * 1024, Command: "/usr/bin/containerd"},
		{PID: 2048, Name: "weplane", User: "weplane", State: "S", CPUPercent: 0.7, MemBytes: 28 * 1024 * 1024, Command: "/usr/local/bin/weplane serve --addr 0.0.0.0:8080"},
		{PID: 2512, Name: "vaultwarden", User: "vault", State: "S", CPUPercent: 0.4, MemBytes: 42 * 1024 * 1024, Command: "/vaultwarden"},
		{PID: 1042, Name: "sshd", User: "root", State: "S", CPUPercent: 0.2, MemBytes: 18 * 1024 * 1024, Command: "sshd: /usr/sbin/sshd -D [listener]"},
		{PID: 512, Name: "systemd-journald", User: "root", State: "S", CPUPercent: 0.3, MemBytes: 94 * 1024 * 1024, Command: "/lib/systemd/systemd-journald"},
		{PID: 980, Name: "chronyd", User: "_chrony", State: "S", CPUPercent: 0.1, MemBytes: 6 * 1024 * 1024, Command: "/usr/sbin/chronyd -F 1"},
		{PID: 1120, Name: "unattended-upgr", User: "root", State: "S", CPUPercent: 0.1, MemBytes: 31 * 1024 * 1024, Command: "/usr/bin/python3 /usr/share/unattended-upgrades/unattended-upgrade-shutdown"},
		{PID: 845, Name: "dbus-daemon", User: "messagebus", State: "S", CPUPercent: 0.1, MemBytes: 8 * 1024 * 1024, Command: "@dbus-daemon --system --address=systemd:"},
	}

	for i := range seed {
		jitter := (s.rng.Float64() - 0.5) * 0.8
		seed[i].CPUPercent = math.Round(math.Max(0.1, seed[i].CPUPercent+jitter)*10) / 10
		seed[i].MemPercent = math.Round(float64(seed[i].MemBytes)/memTotal*1000) / 10
	}

	sort.Slice(seed, func(i, j int) bool {
		if sortBy == "mem" {
			return seed[i].MemBytes > seed[j].MemBytes
		}
		return seed[i].CPUPercent > seed[j].CPUPercent
	})

	if limit < len(seed) {
		seed = seed[:limit]
	}
	return seed, nil
}
