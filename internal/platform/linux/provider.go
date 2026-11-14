//go:build linux

package linux

import (
	"weplane/internal/platform"

	"github.com/godbus/dbus/v5"
)

// Provider implements platform.Provider using native Linux interfaces
// (/proc, /sys, systemd D-Bus, and Docker Engine Unix socket).
type Provider struct {
	sys *systemProvider
	svc *serviceProvider
	ctr *containerProvider
}

// NewProvider initializes native Linux system, systemd, and Docker clients.
func NewProvider(dockerSock string) (*Provider, error) {
	conn, err := dbus.SystemBus()
	if err != nil {
		return nil, err
	}
	if dockerSock == "" {
		dockerSock = "/var/run/docker.sock"
	}
	svc := newServiceProvider(conn)
	ctr := newContainerProvider(dockerSock)
	return &Provider{
		sys: newSystemProvider(svc, ctr),
		svc: svc,
		ctr: ctr,
	}, nil
}

func (p *Provider) System() platform.SystemProvider       { return p.sys }
func (p *Provider) Service() platform.ServiceProvider     { return p.svc }
func (p *Provider) Container() platform.ContainerProvider { return p.ctr }
func (p *Provider) IsMock() bool                          { return false }

func (p *Provider) Close() error {
	if p.svc != nil && p.svc.conn != nil {
		return p.svc.conn.Close()
	}
	return nil
}
