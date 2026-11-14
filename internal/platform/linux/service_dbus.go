//go:build linux

package linux

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"weplane/internal/platform"

	"github.com/godbus/dbus/v5"
)

const (
	systemdDest    = "org.freedesktop.systemd1"
	systemdPath    = dbus.ObjectPath("/org/freedesktop/systemd1")
	systemdManager = "org.freedesktop.systemd1.Manager"
)

var validUnitName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@_.:-]*$`)

var criticalUnits = map[string]bool{
	"ssh.service":        true,
	"sshd.service":       true,
	"systemd-journald.service": true,
	"networking.service": true,
	"NetworkManager.service":   true,
	"docker.service":     true,
	"containerd.service": true,
	"weplane.service":    true,
}

type dbusUnit struct {
	Name        string
	Description string
	LoadState   string
	ActiveState string
	SubState    string
	Following   string
	UnitPath    dbus.ObjectPath
	JobID       uint32
	JobType     string
	JobPath     dbus.ObjectPath
}

type serviceProvider struct {
	conn *dbus.Conn
}

func newServiceProvider(conn *dbus.Conn) *serviceProvider {
	return &serviceProvider{conn: conn}
}

func (s *serviceProvider) manager() dbus.BusObject {
	return s.conn.Object(systemdDest, systemdPath)
}

func (s *serviceProvider) ListUnits(ctx context.Context) ([]platform.ServiceUnit, error) {
	var raw []dbusUnit
	call := s.manager().CallWithContext(ctx, systemdManager+".ListUnits", 0)
	if err := call.Store(&raw); err != nil {
		return nil, fmt.Errorf("systemd ListUnits: %w", err)
	}

	out := make([]platform.ServiceUnit, 0, len(raw))
	for _, u := range raw {
		if !strings.HasSuffix(u.Name, ".service") {
			continue
		}
		fileState := "unknown"
		var stateStr string
		if err := s.manager().CallWithContext(ctx, systemdManager+".GetUnitFileState", 0, u.Name).Store(&stateStr); err == nil {
			fileState = stateStr
		}
		var mainPID uint32
		var memBytes uint64
		if u.ActiveState == "active" && u.UnitPath != "" {
			obj := s.conn.Object(systemdDest, u.UnitPath)
			var svcProps map[string]dbus.Variant
			if err := obj.CallWithContext(ctx, "org.freedesktop.DBus.Properties.GetAll", 0, "org.freedesktop.systemd1.Service").Store(&svcProps); err == nil {
				if v, ok := svcProps["MainPID"]; ok {
					mainPID, _ = v.Value().(uint32)
				}
				if v, ok := svcProps["MemoryCurrent"]; ok {
					if val, ok := v.Value().(uint64); ok && val != ^uint64(0) {
						memBytes = val
					}
				}
			}
		}
		out = append(out, platform.ServiceUnit{
			Name:          u.Name,
			Description:   u.Description,
			LoadState:     u.LoadState,
			ActiveState:   u.ActiveState,
			SubState:      u.SubState,
			UnitFileState: fileState,
			MainPID:       mainPID,
			MemoryBytes:   memBytes,
			IsCritical:    criticalUnits[u.Name],
		})
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

func (s *serviceProvider) GetUnit(ctx context.Context, name string) (*platform.ServiceDetail, error) {
	if !validUnitName.MatchString(name) {
		return nil, fmt.Errorf("invalid unit name: %q", name)
	}

	var unitPath dbus.ObjectPath
	if err := s.manager().CallWithContext(ctx, systemdManager+".LoadUnit", 0, name).Store(&unitPath); err != nil {
		return nil, fmt.Errorf("systemd LoadUnit(%s): %w", name, err)
	}

	obj := s.conn.Object(systemdDest, unitPath)
	var unitProps map[string]dbus.Variant
	if err := obj.CallWithContext(ctx, "org.freedesktop.DBus.Properties.GetAll", 0, "org.freedesktop.systemd1.Unit").Store(&unitProps); err != nil {
		return nil, fmt.Errorf("systemd GetAll(Unit): %w", err)
	}
	var svcProps map[string]dbus.Variant
	_ = obj.CallWithContext(ctx, "org.freedesktop.DBus.Properties.GetAll", 0, "org.freedesktop.systemd1.Service").Store(&svcProps)

	fileState := "unknown"
	_ = s.manager().CallWithContext(ctx, systemdManager+".GetUnitFileState", 0, name).Store(&fileState)

	var mainPID uint32
	if v, ok := svcProps["MainPID"]; ok {
		mainPID, _ = v.Value().(uint32)
	}
	var memBytes uint64
	if v, ok := svcProps["MemoryCurrent"]; ok {
		if val, ok := v.Value().(uint64); ok && val != ^uint64(0) {
			memBytes = val
		}
	}

	activeEnter := ""
	if v, ok := unitProps["ActiveEnterTimestamp"]; ok {
		if usec, ok := v.Value().(uint64); ok && usec > 0 {
			activeEnter = time.UnixMicro(int64(usec)).Format(time.RFC3339)
		}
	}

	fragmentPath := variantString(unitProps["FragmentPath"])
	unitContent := readSafeUnitFile(fragmentPath)

	return &platform.ServiceDetail{
		ServiceUnit: platform.ServiceUnit{
			Name:          name,
			Description:   variantString(unitProps["Description"]),
			LoadState:     variantString(unitProps["LoadState"]),
			ActiveState:   variantString(unitProps["ActiveState"]),
			SubState:      variantString(unitProps["SubState"]),
			UnitFileState: fileState,
			MainPID:       mainPID,
			MemoryBytes:   memBytes,
			IsCritical:    criticalUnits[name],
		},
		FragmentPath:  fragmentPath,
		ActiveEnterAt: activeEnter,
		UnitContent:   unitContent,
	}, nil
}

func (s *serviceProvider) DaemonReload(ctx context.Context) error {
	return s.manager().CallWithContext(ctx, systemdManager+".Reload", 0).Err
}

func (s *serviceProvider) CreateUnit(ctx context.Context, req platform.CreateServiceRequest) (string, error) {
	unitName, err := platform.NormalizeServiceName(req.Name)
	if err != nil {
		return "", err
	}
	content, err := platform.BuildSystemdUnitContent(req)
	if err != nil {
		return "", err
	}

	unitPath := filepath.Join("/etc/systemd/system", unitName)
	if _, err := os.Stat(unitPath); err == nil {
		return "", fmt.Errorf("服务 %s 已存在（%s）", unitName, unitPath)
	}
	if err := os.WriteFile(unitPath, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("写入 Unit 文件失败: %w", err)
	}
	if err := s.DaemonReload(ctx); err != nil {
		return "", fmt.Errorf("已写入 Unit 文件，但 daemon-reload 失败: %w", err)
	}
	if req.Enable {
		if err := s.ControlUnit(ctx, unitName, platform.ServiceActionEnable); err != nil {
			return "", fmt.Errorf("已创建服务，但开启自启失败: %w", err)
		}
	}
	if req.Start {
		if err := s.ControlUnit(ctx, unitName, platform.ServiceActionStart); err != nil {
			return "", fmt.Errorf("已创建服务，但启动失败: %w", err)
		}
	}
	return unitName, nil
}

func (s *serviceProvider) DeleteUnit(ctx context.Context, name string) error {
	unitName, err := platform.NormalizeServiceName(name)
	if err != nil {
		return err
	}
	if criticalUnits[unitName] {
		return fmt.Errorf("拒绝删除系统关键服务 %s", unitName)
	}
	unitPath := filepath.Join("/etc/systemd/system", unitName)
	if _, err := os.Stat(unitPath); os.IsNotExist(err) {
		return fmt.Errorf("仅支持删除 /etc/systemd/system 下的自定义服务文件")
	} else if err != nil {
		return fmt.Errorf("检查 Unit 文件失败: %w", err)
	}

	_ = s.ControlUnit(ctx, unitName, platform.ServiceActionStop)
	_ = s.ControlUnit(ctx, unitName, platform.ServiceActionDisable)
	if err := os.Remove(unitPath); err != nil {
		return fmt.Errorf("删除 Unit 文件失败: %w", err)
	}
	if err := s.DaemonReload(ctx); err != nil {
		return fmt.Errorf("已删除 Unit 文件，但 daemon-reload 失败: %w", err)
	}
	return nil
}

func readSafeUnitFile(path string) string {
	if !strings.HasPrefix(path, "/etc/systemd/") &&
		!strings.HasPrefix(path, "/lib/systemd/") &&
		!strings.HasPrefix(path, "/usr/lib/systemd/") {
		return ""
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(b)
}

func (s *serviceProvider) ControlUnit(ctx context.Context, name string, action platform.ServiceAction) error {
	if !validUnitName.MatchString(name) {
		return fmt.Errorf("invalid unit name: %q", name)
	}

	switch action {
	case platform.ServiceActionStart:
		var job dbus.ObjectPath
		return s.manager().CallWithContext(ctx, systemdManager+".StartUnit", 0, name, "replace").Store(&job)
	case platform.ServiceActionStop:
		var job dbus.ObjectPath
		return s.manager().CallWithContext(ctx, systemdManager+".StopUnit", 0, name, "replace").Store(&job)
	case platform.ServiceActionRestart:
		var job dbus.ObjectPath
		return s.manager().CallWithContext(ctx, systemdManager+".RestartUnit", 0, name, "replace").Store(&job)
	case platform.ServiceActionEnable:
		return s.manager().CallWithContext(ctx, systemdManager+".EnableUnitFiles", 0, []string{name}, false, true).Err
	case platform.ServiceActionDisable:
		return s.manager().CallWithContext(ctx, systemdManager+".DisableUnitFiles", 0, []string{name}, false).Err
	default:
		return fmt.Errorf("unsupported service action: %s", action)
	}
}

func (s *serviceProvider) StreamLogs(ctx context.Context, name string, tail int) (<-chan platform.LogLine, error) {
	if !validUnitName.MatchString(name) {
		return nil, fmt.Errorf("invalid unit name: %q", name)
	}
	if tail <= 0 || tail > 1000 {
		tail = 100
	}

	cmd := exec.CommandContext(ctx, "journalctl", "-u", name, "-n", strconv.Itoa(tail), "-f", "-o", "short-iso", "--no-pager")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start journalctl: %w", err)
	}

	ch := make(chan platform.LogLine, 64)
	go func() {
		defer close(ch)
		defer cmd.Wait()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			select {
			case <-ctx.Done():
				return
			case ch <- platform.LogLine{
				Timestamp: time.Now(),
				Stream:    "journal",
				Message:   line,
			}:
			}
		}
	}()
	return ch, nil
}

func variantString(v dbus.Variant) string {
	if s, ok := v.Value().(string); ok {
		return s
	}
	return ""
}
