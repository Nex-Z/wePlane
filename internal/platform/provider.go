package platform

import "context"

// Provider aggregates OS-specific implementations for system metrics,
// systemd services, and Docker containers.
type Provider interface {
	System() SystemProvider
	Service() ServiceProvider
	Container() ContainerProvider
	IsMock() bool
	Close() error
}

// SystemProvider exposes host metadata and live resource metrics.
type SystemProvider interface {
	GetHostInfo(ctx context.Context) (*HostInfo, error)
	GetSnapshot(ctx context.Context) (*MetricsSnapshot, error)
	TopProcesses(ctx context.Context, sortBy string, limit int) ([]ProcessInfo, error)
}

// ServiceProvider manages systemd units and reads journald logs.
type ServiceProvider interface {
	ListUnits(ctx context.Context) ([]ServiceUnit, error)
	GetUnit(ctx context.Context, name string) (*ServiceDetail, error)
	CreateUnit(ctx context.Context, req CreateServiceRequest) (string, error)
	DeleteUnit(ctx context.Context, name string) error
	ControlUnit(ctx context.Context, name string, action ServiceAction) error
	DaemonReload(ctx context.Context) error
	StreamLogs(ctx context.Context, name string, tail int) (<-chan LogLine, error)
}

// ContainerProvider manages Docker containers and reads container logs.
type ContainerProvider interface {
	ListContainers(ctx context.Context, all bool) ([]ContainerSummary, error)
	InspectContainer(ctx context.Context, id string) (*ContainerDetail, error)
	ControlContainer(ctx context.Context, id string, action ContainerAction) error
	DeleteContainer(ctx context.Context, id string) error
	CreateContainer(ctx context.Context, req CreateContainerRequest) (string, error)
	DeployCompose(ctx context.Context, req ComposeDeployRequest) (string, error)
	ControlCompose(ctx context.Context, project, action string) (string, error)
	StreamLogs(ctx context.Context, id string, tail int) (<-chan LogLine, error)
}
