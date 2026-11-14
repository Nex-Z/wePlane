//go:build linux

package linux

import (
	"bufio"
	"context"
	"fmt"
	"math"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"weplane/internal/platform"
)

type cpuTimes struct {
	total uint64
	idle  uint64
}

type netCounters struct {
	rx uint64
	tx uint64
}

type diskCounters struct {
	readSectors  uint64
	writeSectors uint64
	reads        uint64
	writes       uint64
}

type systemProvider struct {
	mu               sync.Mutex
	prevCPU          *cpuTimes
	prevNet          map[string]netCounters
	prevNetTime      time.Time
	prevDisk         *diskCounters
	prevDiskTime     time.Time
	prevProcCPU      map[int]uint64
	prevProcSysTotal uint64
	svc              *serviceProvider
	ctr              *containerProvider
	cachedWorkloads  platform.WorkloadSummary
	workloadsUpdated time.Time
}

func newSystemProvider(svc *serviceProvider, ctr *containerProvider) *systemProvider {
	return &systemProvider{
		prevNet:     make(map[string]netCounters),
		prevProcCPU: make(map[int]uint64),
		svc:         svc,
		ctr:         ctr,
	}
}

func (s *systemProvider) GetHostInfo(_ context.Context) (*platform.HostInfo, error) {
	hostname, _ := os.Hostname()
	uptimeSec := readUptime()

	var uts syscall.Utsname
	kernel := ""
	if err := syscall.Uname(&uts); err == nil {
		kernel = int8SliceToString(uts.Release[:])
	}

	return &platform.HostInfo{
		Hostname:  hostname,
		OS:        readOSRelease(),
		Kernel:    kernel,
		Arch:      runtime.GOARCH,
		CPUModel:    readCPUModel(),
		CPUCores:    runtime.NumCPU(),
		UptimeSec:   uptimeSec,
		BootTime:    time.Now().Add(-time.Duration(uptimeSec) * time.Second),
		Timezone:    readTimezone(),
		IPAddresses: readIPv4Addresses(),
		MockMode:    false,
	}, nil
}

func (s *systemProvider) GetSnapshot(ctx context.Context) (*platform.MetricsSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cpuPct := s.readCPUPercent()
	l1, l5, l15, procsRun, procsTotal := readLoadAvg()
	mem, swap := readMemInfo()
	disks := readDisks()
	diskIO := s.readDiskIO()
	nets := s.readNetworks()
	cpuTemp := readCPUTemp()
	workloads := s.readWorkloads(ctx)

	var alerts []platform.SystemAlert
	for _, d := range disks {
		if d.UsedPercent >= 85.0 {
			level := "warning"
			if d.UsedPercent >= 95.0 {
				level = "critical"
			}
			alerts = append(alerts, platform.SystemAlert{
				ID:      "disk-" + d.MountPoint,
				Level:   level,
				Source:  d.MountPoint,
				Message: fmt.Sprintf("挂载点 %s 空间使用率已达 %.1f%%", d.MountPoint, d.UsedPercent),
			})
		}
	}
	if mem.UsedPercent >= 90.0 {
		alerts = append(alerts, platform.SystemAlert{
			ID:      "mem-high",
			Level:   "warning",
			Source:  "memory",
			Message: fmt.Sprintf("内存使用率较高 (%.1f%%)", mem.UsedPercent),
		})
	}

	return &platform.MetricsSnapshot{
		Timestamp:       time.Now(),
		CPUUsagePercent: cpuPct,
		CPUTempC:        cpuTemp,
		Load1:           l1,
		Load5:           l5,
		Load15:          l15,
		ProcsRunning:    procsRun,
		ProcsTotal:      procsTotal,
		UptimeSec:       readUptime(),
		Memory:          mem,
		Swap:            swap,
		Disks:           disks,
		DiskIO:          diskIO,
		Networks:        nets,
		Alerts:          alerts,
		Workloads:       workloads,
	}, nil
}

func (s *systemProvider) readCPUPercent() float64 {
	cur, err := readProcStatCPU()
	if err != nil {
		return 0
	}
	if s.prevCPU == nil {
		s.prevCPU = &cur
		return 0
	}
	totalDelta := float64(cur.total - s.prevCPU.total)
	idleDelta := float64(cur.idle - s.prevCPU.idle)
	s.prevCPU = &cur
	if totalDelta <= 0 {
		return 0
	}
	pct := (1.0 - idleDelta/totalDelta) * 100.0
	return math.Round(math.Max(0, math.Min(100, pct))*10) / 10
}

func readProcStatCPU() (cpuTimes, error) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return cpuTimes{}, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		var total, idle uint64
		for i, raw := range fields[1:] {
			v, _ := strconv.ParseUint(raw, 10, 64)
			total += v
			if i == 3 || i == 4 { // idle + iowait
				idle += v
			}
		}
		return cpuTimes{total: total, idle: idle}, nil
	}
	return cpuTimes{}, fmt.Errorf("cpu line not found")
}

func readLoadAvg() (float64, float64, float64, int, int) {
	b, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0, 0, 0
	}
	fields := strings.Fields(string(b))
	if len(fields) < 3 {
		return 0, 0, 0, 0, 0
	}
	l1, _ := strconv.ParseFloat(fields[0], 64)
	l5, _ := strconv.ParseFloat(fields[1], 64)
	l15, _ := strconv.ParseFloat(fields[2], 64)
	var procsRun, procsTotal int
	if len(fields) >= 4 {
		if r, tot, ok := strings.Cut(fields[3], "/"); ok {
			procsRun, _ = strconv.Atoi(r)
			procsTotal, _ = strconv.Atoi(tot)
		}
	}
	return l1, l5, l15, procsRun, procsTotal
}

func readUptime() uint64 {
	b, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(b))
	if len(fields) == 0 {
		return 0
	}
	sec, _ := strconv.ParseFloat(fields[0], 64)
	return uint64(sec)
}

func readMemInfo() (platform.MemoryMetrics, platform.MemoryMetrics) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return platform.MemoryMetrics{}, platform.MemoryMetrics{}
	}
	defer f.Close()

	vals := make(map[string]uint64)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		parts := strings.SplitN(scanner.Text(), ":", 2)
		if len(parts) != 2 {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) == 0 {
			continue
		}
		kb, _ := strconv.ParseUint(fields[0], 10, 64)
		vals[parts[0]] = kb * 1024
	}

	memTotal := vals["MemTotal"]
	memAvail := vals["MemAvailable"]
	if memAvail == 0 {
		memAvail = vals["MemFree"] + vals["Buffers"] + vals["Cached"]
	}
	memUsed := uint64(0)
	if memTotal > memAvail {
		memUsed = memTotal - memAvail
	}
	memPct := 0.0
	if memTotal > 0 {
		memPct = math.Round(float64(memUsed)/float64(memTotal)*1000) / 10
	}

	swapTotal := vals["SwapTotal"]
	swapFree := vals["SwapFree"]
	swapUsed := uint64(0)
	if swapTotal > swapFree {
		swapUsed = swapTotal - swapFree
	}
	swapPct := 0.0
	if swapTotal > 0 {
		swapPct = math.Round(float64(swapUsed)/float64(swapTotal)*1000) / 10
	}

	return platform.MemoryMetrics{
			TotalBytes:     memTotal,
			UsedBytes:      memUsed,
			AvailableBytes: memAvail,
			UsedPercent:    memPct,
		}, platform.MemoryMetrics{
			TotalBytes:     swapTotal,
			UsedBytes:      swapUsed,
			AvailableBytes: swapFree,
			UsedPercent:    swapPct,
		}
}

func readDisks() []platform.DiskMetrics {
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer f.Close()

	allowedFS := map[string]bool{
		"ext4": true, "ext3": true, "xfs": true, "btrfs": true, "zfs": true, "vfat": true, "ntfs3": true,
	}
	seenDev := make(map[string]bool)
	var out []platform.DiskMetrics

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 {
			continue
		}
		dev, mount, fsType := fields[0], fields[1], fields[2]
		if !allowedFS[fsType] || seenDev[dev] {
			continue
		}
		var st syscall.Statfs_t
		if err := syscall.Statfs(mount, &st); err != nil || st.Blocks == 0 {
			continue
		}
		seenDev[dev] = true
		total := st.Blocks * uint64(st.Bsize)
		avail := st.Bavail * uint64(st.Bsize)
		used := total - (st.Bfree * uint64(st.Bsize))
		pct := 0.0
		if total > 0 {
			pct = math.Round(float64(used)/float64(total)*1000) / 10
		}
		_ = avail
		out = append(out, platform.DiskMetrics{
			MountPoint:  mount,
			Device:      dev,
			FSType:      fsType,
			TotalBytes:  total,
			UsedBytes:   used,
			UsedPercent: pct,
		})
	}
	return out
}

func (s *systemProvider) readDiskIO() platform.DiskIOMetrics {
	f, err := os.Open("/proc/diskstats")
	if err != nil {
		return platform.DiskIOMetrics{}
	}
	defer f.Close()

	var cur diskCounters
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 14 {
			continue
		}
		name := fields[2]
		// Only aggregate whole physical/virtual disks (skip loop, ram, dm-, and partitions)
		if strings.HasPrefix(name, "loop") || strings.HasPrefix(name, "ram") || strings.HasPrefix(name, "dm-") {
			continue
		}
		isWhole := false
		if strings.HasPrefix(name, "nvme") && !strings.Contains(name, "p") {
			isWhole = true
		} else if (strings.HasPrefix(name, "sd") || strings.HasPrefix(name, "vd") || strings.HasPrefix(name, "hd")) && len(name) == 3 {
			isWhole = true
		} else if strings.HasPrefix(name, "mmcblk") && !strings.Contains(name, "p") {
			isWhole = true
		}
		if !isWhole {
			continue
		}
		rOps, _ := strconv.ParseUint(fields[3], 10, 64)
		rSec, _ := strconv.ParseUint(fields[5], 10, 64)
		wOps, _ := strconv.ParseUint(fields[7], 10, 64)
		wSec, _ := strconv.ParseUint(fields[9], 10, 64)
		cur.reads += rOps
		cur.readSectors += rSec
		cur.writes += wOps
		cur.writeSectors += wSec
	}

	now := time.Now()
	if s.prevDisk == nil {
		s.prevDisk = &cur
		s.prevDiskTime = now
		return platform.DiskIOMetrics{}
	}
	elapsed := now.Sub(s.prevDiskTime).Seconds()
	var out platform.DiskIOMetrics
	if elapsed > 0.1 {
		if cur.readSectors >= s.prevDisk.readSectors {
			out.ReadBytesPerSec = math.Round(float64(cur.readSectors-s.prevDisk.readSectors) * 512.0 / elapsed)
		}
		if cur.writeSectors >= s.prevDisk.writeSectors {
			out.WriteBytesPerSec = math.Round(float64(cur.writeSectors-s.prevDisk.writeSectors) * 512.0 / elapsed)
		}
		if cur.reads >= s.prevDisk.reads {
			out.ReadIOPS = math.Round(float64(cur.reads-s.prevDisk.reads) / elapsed)
		}
		if cur.writes >= s.prevDisk.writes {
			out.WriteIOPS = math.Round(float64(cur.writes-s.prevDisk.writes) / elapsed)
		}
	}
	s.prevDisk = &cur
	s.prevDiskTime = now
	return out
}

func (s *systemProvider) readNetworks() []platform.NetworkMetrics {
	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return nil
	}
	defer f.Close()

	now := time.Now()
	elapsed := now.Sub(s.prevNetTime).Seconds()
	var out []platform.NetworkMetrics

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		idx := strings.Index(line, ":")
		if idx <= 0 {
			continue
		}
		iface := strings.TrimSpace(line[:idx])
		if iface == "lo" || strings.HasPrefix(iface, "veth") || strings.HasPrefix(iface, "br-") {
			continue
		}
		fields := strings.Fields(line[idx+1:])
		if len(fields) < 9 {
			continue
		}
		rx, _ := strconv.ParseUint(fields[0], 10, 64)
		tx, _ := strconv.ParseUint(fields[8], 10, 64)

		var rxRate, txRate float64
		if prev, ok := s.prevNet[iface]; ok && elapsed > 0.1 {
			if rx >= prev.rx {
				rxRate = float64(rx-prev.rx) / elapsed
			}
			if tx >= prev.tx {
				txRate = float64(tx-prev.tx) / elapsed
			}
		}
		s.prevNet[iface] = netCounters{rx: rx, tx: tx}

		operBytes, _ := os.ReadFile(filepath.Join("/sys/class/net", iface, "operstate"))
		oper := strings.TrimSpace(string(operBytes))
		isUp := oper == "up" || oper == "unknown"

		out = append(out, platform.NetworkMetrics{
			Interface:     iface,
			RxBytesPerSec: math.Round(rxRate),
			TxBytesPerSec: math.Round(txRate),
			RxTotalBytes:  rx,
			TxTotalBytes:  tx,
			IsUp:          isUp,
		})
	}
	s.prevNetTime = now
	return out
}

func readOSRelease() string {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return "Linux"
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
		}
	}
	return "Linux"
}

func readCPUModel() string {
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return "Unknown CPU"
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "Unknown CPU"
}

func (s *systemProvider) readWorkloads(ctx context.Context) platform.WorkloadSummary {
	if time.Since(s.workloadsUpdated) < 6*time.Second {
		return s.cachedWorkloads
	}
	var w platform.WorkloadSummary
	if s.svc != nil {
		if units, err := s.svc.ListUnits(ctx); err == nil {
			w.ServicesTotal = len(units)
			for _, u := range units {
				if u.ActiveState == "active" {
					w.ServicesActive++
				} else if u.ActiveState == "failed" {
					w.ServicesFailed++
				} else {
					w.ServicesInactive++
				}
			}
		}
	}
	if s.ctr != nil {
		if ctrs, err := s.ctr.ListContainers(ctx, true); err == nil {
			w.ContainersTotal = len(ctrs)
			for _, c := range ctrs {
				if c.State == "running" {
					w.ContainersRunning++
				} else if c.State == "restarting" || c.State == "dead" || (strings.Contains(c.Status, "Exited (") && !strings.HasPrefix(c.Status, "Exited (0)")) {
					w.ContainersError++
				} else {
					w.ContainersStopped++
				}
			}
		}
	}
	s.cachedWorkloads = w
	s.workloadsUpdated = time.Now()
	return w
}

func readCPUTemp() *float64 {
	zones, err := filepath.Glob("/sys/class/thermal/thermal_zone*/temp")
	if err != nil || len(zones) == 0 {
		return nil
	}
	for _, z := range zones {
		b, err := os.ReadFile(z)
		if err != nil {
			continue
		}
		milli, err := strconv.ParseFloat(strings.TrimSpace(string(b)), 64)
		if err == nil && milli > 0 && milli < 150000 {
			c := math.Round((milli/1000.0)*10) / 10
			return &c
		}
	}
	return nil
}

func readTimezone() string {
	tzName, _ := time.Now().Zone()
	if b, err := os.ReadFile("/etc/timezone"); err == nil {
		area := strings.TrimSpace(string(b))
		if area != "" {
			if tzName != "" {
				return fmt.Sprintf("%s (%s)", area, tzName)
			}
			return area
		}
	}
	if tzName != "" {
		return tzName
	}
	return "Local"
}

func (s *systemProvider) TopProcesses(_ context.Context, sortBy string, limit int) ([]platform.ProcessInfo, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	sysStat, _ := readProcStatCPU()
	sysDelta := float64(0)
	if s.prevProcSysTotal > 0 && sysStat.total > s.prevProcSysTotal {
		sysDelta = float64(sysStat.total - s.prevProcSysTotal)
	}
	numCores := float64(runtime.NumCPU())

	mem, _ := readMemInfo()
	memTotal := float64(mem.TotalBytes)
	pageSize := uint64(os.Getpagesize())
	uidMap := readPasswdUIDs()

	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}

	nextProcCPU := make(map[int]uint64, len(entries))
	out := make([]platform.ProcessInfo, 0, 128)

	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(ent.Name())
		if err != nil || pid <= 0 {
			continue
		}

		statBytes, err := os.ReadFile(filepath.Join("/proc", ent.Name(), "stat"))
		if err != nil {
			continue
		}
		statStr := string(statBytes)
		lParen := strings.IndexByte(statStr, '(')
		rParen := strings.LastIndexByte(statStr, ')')
		if lParen < 0 || rParen <= lParen || rParen+2 >= len(statStr) {
			continue
		}
		name := statStr[lParen+1 : rParen]
		rest := strings.Fields(statStr[rParen+2:])
		if len(rest) < 13 {
			continue
		}
		state := rest[0]
		utime, _ := strconv.ParseUint(rest[11], 10, 64)
		stime, _ := strconv.ParseUint(rest[12], 10, 64)
		procTotal := utime + stime
		nextProcCPU[pid] = procTotal

		cpuPct := 0.0
		if prev, ok := s.prevProcCPU[pid]; ok && sysDelta > 0 && procTotal >= prev {
			cpuPct = math.Round((float64(procTotal-prev)/sysDelta)*numCores*1000) / 10
		}

		var memBytes uint64
		if statmBytes, err := os.ReadFile(filepath.Join("/proc", ent.Name(), "statm")); err == nil {
			mf := strings.Fields(string(statmBytes))
			if len(mf) >= 2 {
				rssPages, _ := strconv.ParseUint(mf[1], 10, 64)
				memBytes = rssPages * pageSize
			}
		}
		memPct := 0.0
		if memTotal > 0 {
			memPct = math.Round(float64(memBytes)/memTotal*1000) / 10
		}

		cmd := name
		if cmdBytes, err := os.ReadFile(filepath.Join("/proc", ent.Name(), "cmdline")); err == nil && len(cmdBytes) > 0 {
			cmd = strings.TrimSpace(strings.ReplaceAll(string(cmdBytes), "\x00", " "))
			if cmd == "" {
				cmd = name
			}
		}

		user := readProcUser(filepath.Join("/proc", ent.Name(), "status"), uidMap)

		out = append(out, platform.ProcessInfo{
			PID:        pid,
			Name:       name,
			User:       user,
			State:      state,
			CPUPercent: cpuPct,
			MemPercent: memPct,
			MemBytes:   memBytes,
			Command:    cmd,
		})
	}

	s.prevProcCPU = nextProcCPU
	s.prevProcSysTotal = sysStat.total

	sort.Slice(out, func(i, j int) bool {
		if sortBy == "mem" {
			return out[i].MemBytes > out[j].MemBytes
		}
		if out[i].CPUPercent != out[j].CPUPercent {
			return out[i].CPUPercent > out[j].CPUPercent
		}
		return out[i].MemBytes > out[j].MemBytes
	})

	if limit < len(out) {
		out = out[:limit]
	}
	return out, nil
}

func readPasswdUIDs() map[string]string {
	m := make(map[string]string)
	f, err := os.Open("/etc/passwd")
	if err != nil {
		return m
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		parts := strings.Split(sc.Text(), ":")
		if len(parts) >= 3 {
			m[parts[2]] = parts[0]
		}
	}
	return m
}

func readProcUser(statusPath string, uidMap map[string]string) string {
	f, err := os.Open(statusPath)
	if err != nil {
		return "--"
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "Uid:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if name, ok := uidMap[fields[1]]; ok {
					return name
				}
				return fields[1]
			}
		}
	}
	return "--"
}

func readIPv4Addresses() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		if isVirtualContainerInterface(iface.Name) {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipNet, ok := a.(*net.IPNet)
			if !ok || ipNet.IP.IsLoopback() {
				continue
			}
			if v4 := ipNet.IP.To4(); v4 != nil {
				out = append(out, v4.String())
			}
		}
	}
	return out
}

func isVirtualContainerInterface(name string) bool {
	lower := strings.ToLower(name)
	prefixes := []string{"docker", "br-", "veth", "virbr", "cni", "flannel", "kube", "podman"}
	for _, p := range prefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

func int8SliceToString(s []int8) string {
	buf := make([]byte, 0, len(s))
	for _, b := range s {
		if b == 0 {
			break
		}
		buf = append(buf, byte(b))
	}
	return string(buf)
}
