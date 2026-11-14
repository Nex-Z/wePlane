//go:build linux

package main

import (
	"weplane/internal/config"
	"weplane/internal/platform"
	"weplane/internal/platform/linux"
)

func newNativeProvider(cfg config.Config) (platform.Provider, error) {
	return linux.NewProvider(cfg.DockerSocket)
}
