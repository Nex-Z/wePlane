//go:build !linux

package main

import (
	"fmt"
	"runtime"

	"weplane/internal/config"
	"weplane/internal/platform"
)

func newNativeProvider(_ config.Config) (platform.Provider, error) {
	return nil, fmt.Errorf("native provider is only supported on linux (current OS: %s); use --mock", runtime.GOOS)
}
