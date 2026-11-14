package platform

import "time"

// HostInfo describes static and semi-static properties of the host machine.
type HostInfo struct {
	Hostname  string    `json:"hostname"`
	OS        string    `json:"os"`
	Kernel    string    `json:"kernel"`
	Arch      string    `json:"arch"`
	CPUModel    string    `json:"cpuModel"`
	CPUCores    int       `json:"cpuCores"`
	UptimeSec   uint64    `json:"uptimeSec"`
	BootTime    time.Time `json:"bootTime"`
	Timezone    string    `json:"timezone"`
	IPAddresses []string  `json:"ipAddresses"`
	MockMode    bool      `json:"mockMode"`
}

// MemoryMetrics represents RAM or swap usage in bytes.
type MemoryMetrics struct {
	TotalBytes     uint64  `json:"totalBytes"`
	UsedBytes      uint64  `json:"usedBytes"`
	AvailableBytes uint64  `json:"availableBytes"`
	UsedPercent    float64 `json:"usedPercent"`
}

// DiskMetrics represents filesystem usage for a mount point.
type DiskMetrics struct {
	MountPoint  string  `json:"mountPoint"`
	Device      string  `json:"device"`
	FSType      string  `json:"fsType"`
	TotalBytes  uint64  `json:"totalBytes"`
	UsedBytes   uint64  `json:"usedBytes"`
	UsedPercent float64 `json:"usedPercent"`
}

// DiskIOMetrics represents aggregated block device read/write throughput.
type DiskIOMetrics struct {
	ReadBytesPerSec  float64 `json:"readBytesPerSec"`
	WriteBytesPerSec float64 `json:"writeBytesPerSec"`
	ReadIOPS         float64 `json:"readIops"`
	WriteIOPS        float64 `json:"writeIops"`
}

// NetworkMetrics represents throughput and link state of a network interface.
type NetworkMetrics struct {
	Interface     string  `json:"interface"`
	RxBytesPerSec float64 `json:"rxBytesPerSec"`
	TxBytesPerSec float64 `json:"txBytesPerSec"`
	RxTotalBytes  uint64  `json:"rxTotalBytes"`
	TxTotalBytes  uint64  `json:"txTotalBytes"`
	IsUp          bool    `json:"isUp"`
}

// SystemAlert surfaces abnormal host or service conditions.
type SystemAlert struct {
	ID      string `json:"id"`
	Level   string `json:"level"` // info, warning, critical
	Source  string `json:"source"`
	Message string `json:"message"`
}

// WorkloadSummary aggregates service and container counts for the overview.
type WorkloadSummary struct {
	ServicesTotal     int `json:"servicesTotal"`
	ServicesActive    int `json:"servicesActive"`
	ServicesInactive  int `json:"servicesInactive"`
	ServicesFailed    int `json:"servicesFailed"`
	ContainersTotal   int `json:"containersTotal"`
	ContainersRunning int `json:"containersRunning"`
	ContainersStopped int `json:"containersStopped"`
	ContainersError   int `json:"containersError"`
}

// MetricsSnapshot is a point-in-time reading of host resource utilization.
type MetricsSnapshot struct {
	Timestamp       time.Time        `json:"timestamp"`
	CPUUsagePercent float64          `json:"cpuUsagePercent"`
	CPUTempC        *float64         `json:"cpuTempC,omitempty"`
	Load1           float64          `json:"load1"`
	Load5           float64          `json:"load5"`
	Load15          float64          `json:"load15"`
	ProcsRunning    int              `json:"procsRunning"`
	ProcsTotal      int              `json:"procsTotal"`
	UptimeSec       uint64           `json:"uptimeSec"`
	Memory          MemoryMetrics    `json:"memory"`
	Swap            MemoryMetrics    `json:"swap"`
	Disks           []DiskMetrics    `json:"disks"`
	DiskIO          DiskIOMetrics    `json:"diskIO"`
	Networks        []NetworkMetrics `json:"networks"`
	Alerts          []SystemAlert    `json:"alerts"`
	Workloads       WorkloadSummary  `json:"workloads"`
}

// ServiceAction defines allowed lifecycle operations on a systemd unit.
type ServiceAction string

const (
	ServiceActionStart   ServiceAction = "start"
	ServiceActionStop    ServiceAction = "stop"
	ServiceActionRestart ServiceAction = "restart"
	ServiceActionEnable  ServiceAction = "enable"
	ServiceActionDisable ServiceAction = "disable"
)

// ServiceUnit represents a systemd service unit in list views.
type ServiceUnit struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	LoadState     string `json:"loadState"`
	ActiveState   string `json:"activeState"`   // active, inactive, failed, activating
	SubState      string `json:"subState"`      // running, dead, exited, failed
	UnitFileState string `json:"unitFileState"` // enabled, disabled, static, masked
	MainPID       uint32 `json:"mainPID"`
	MemoryBytes   uint64 `json:"memoryBytes"`
	IsCritical    bool   `json:"isCritical"`
}

// ServiceDetail provides extended metadata for the service detail drawer.
type ServiceDetail struct {
	ServiceUnit
	ExecStart     string `json:"execStart"`
	FragmentPath  string `json:"fragmentPath"`
	ActiveEnterAt string `json:"activeEnterAt"`
	UnitContent   string `json:"unitContent,omitempty"`
}

// ContainerAction defines allowed lifecycle operations on a Docker container.
type ContainerAction string

const (
	ContainerActionStart   ContainerAction = "start"
	ContainerActionStop    ContainerAction = "stop"
	ContainerActionRestart ContainerAction = "restart"
)

// ContainerPort describes a published container port mapping.
type ContainerPort struct {
	PrivatePort uint16 `json:"privatePort"`
	PublicPort  uint16 `json:"publicPort,omitempty"`
	Type        string `json:"type"`
	IP          string `json:"ip,omitempty"`
}

// ContainerSummary represents a Docker container in list views.
type ContainerSummary struct {
	ID               string          `json:"id"`
	ShortID          string          `json:"shortId"`
	Name             string          `json:"name"`
	Image            string          `json:"image"`
	State            string          `json:"state"` // running, exited, paused, restarting
	Status           string          `json:"status"`
	CreatedAt        time.Time       `json:"createdAt"`
	ComposeProject   string          `json:"composeProject,omitempty"`
	ComposeService   string          `json:"composeService,omitempty"`
	Ports            []ContainerPort  `json:"ports"`
	Networks         []string         `json:"networks"`
	Mounts           []ContainerMount `json:"mounts"`
	CPUPercent       float64          `json:"cpuPercent"`
	MemoryBytes      uint64          `json:"memoryBytes"`
	MemoryLimitBytes uint64          `json:"memoryLimitBytes"`
	IsCritical       bool            `json:"isCritical"`
}

// ContainerMount describes a bind mount or volume attached to a container.
type ContainerMount struct {
	Type        string `json:"type"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Mode        string `json:"mode"`
	RW          bool   `json:"rw"`
}

// ContainerDetail provides extended inspection fields for the container drawer.
type ContainerDetail struct {
	ContainerSummary
	Command       string   `json:"command"`
	EnvKeys       []string `json:"envKeys"`
	RestartPolicy string   `json:"restartPolicy"`
}

// LogLine represents a single line from journald or container logs.
type LogLine struct {
	Timestamp time.Time `json:"timestamp"`
	Stream    string    `json:"stream"` // stdout, stderr, journal
	Message   string    `json:"message"`
}

// ProcessInfo represents a running OS process for Top-N resource views.
type ProcessInfo struct {
	PID        int     `json:"pid"`
	Name       string  `json:"name"`
	User       string  `json:"user"`
	State      string  `json:"state"`
	CPUPercent float64 `json:"cpuPercent"`
	MemPercent float64 `json:"memPercent"`
	MemBytes   uint64  `json:"memBytes"`
	Command    string  `json:"command"`
}

// CreateContainerRequest defines parameters to create and optionally start a container.
type CreateContainerRequest struct {
	Name          string   `json:"name"`
	Image         string   `json:"image"`
	Ports         []string `json:"ports"`   // e.g. "8080:80"
	Volumes       []string `json:"volumes"` // e.g. "/srv/data:/data"
	Env           []string `json:"env"`     // e.g. "TZ=Asia/Shanghai"
	RestartPolicy string   `json:"restartPolicy"`
	AutoStart     bool     `json:"autoStart"`
}

// ComposeDeployRequest defines a Docker Compose project deployment payload.
type ComposeDeployRequest struct {
	Project string `json:"project"`
	WorkDir string `json:"workDir,omitempty"`
	YAML    string `json:"yaml"`
}

// CreateServiceRequest defines parameters to create a new systemd service unit.
type CreateServiceRequest struct {
	Name             string `json:"name"`
	Description      string `json:"description"`
	ExecStart        string `json:"execStart"`
	WorkingDirectory string `json:"workingDirectory"`
	User             string `json:"user"`
	Restart          string `json:"restart"`
	Environment      string `json:"environment"`
	After            string `json:"after"`
	UnitContent      string `json:"unitContent"`
	Enable           bool   `json:"enable"`
	Start            bool   `json:"start"`
}
