package mock

import (
	"sync"
	"time"

	"weplane/internal/platform"
)

// Provider implements platform.Provider with realistic in-memory mock data
// so the full UI and API workflows can be developed and tested on Windows.
type Provider struct {
	sys *systemProvider
	svc *serviceProvider
	ctr *containerProvider
}

// NewProvider creates a stateful mock provider seeded with Debian 13 homelab fixtures.
func NewProvider() *Provider {
	svc := newServiceProvider()
	ctr := newContainerProvider()
	return &Provider{
		sys: newSystemProvider(svc, ctr),
		svc: svc,
		ctr: ctr,
	}
}

func (p *Provider) System() platform.SystemProvider       { return p.sys }
func (p *Provider) Service() platform.ServiceProvider     { return p.svc }
func (p *Provider) Container() platform.ContainerProvider { return p.ctr }
func (p *Provider) IsMock() bool                          { return true }
func (p *Provider) Close() error                          { return nil }

type mockState struct {
	mu        sync.Mutex
	startedAt time.Time
}
