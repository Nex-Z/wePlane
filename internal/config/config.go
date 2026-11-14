package config

import (
	"os"
	"path/filepath"
)

// Config holds runtime settings for the wePlane server.
type Config struct {
	Addr         string
	DataDir      string
	DockerSocket string
	MockMode     bool
	SecureCookie bool
}

// DefaultConfig returns sensible defaults for local dev or Linux service execution.
func DefaultConfig() Config {
	dataDir := os.Getenv("WEPLANE_DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(".", "data")
	}
	addr := os.Getenv("WEPLANE_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	dockerSock := os.Getenv("WEPLANE_DOCKER_SOCK")
	if dockerSock == "" {
		dockerSock = "/var/run/docker.sock"
	}
	return Config{
		Addr:         addr,
		DataDir:      dataDir,
		DockerSocket: dockerSock,
	}
}
