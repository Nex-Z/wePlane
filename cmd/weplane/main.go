package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"weplane/internal/audit"
	"weplane/internal/auth"
	"weplane/internal/config"
	"weplane/internal/metrics"
	"weplane/internal/platform"
	"weplane/internal/platform/mock"
	"weplane/internal/server"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "user" {
		if err := runUserCmd(os.Args[2:]); err != nil {
			log.Fatalf("user command failed: %v", err)
		}
		return
	}

	args := os.Args[1:]
	if len(args) > 0 && args[0] == "serve" {
		args = args[1:]
	}

	cfg := config.DefaultConfig()
	defaultMock := runtime.GOOS != "linux"

	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	fs.StringVar(&cfg.Addr, "addr", cfg.Addr, "HTTP listen address")
	fs.StringVar(&cfg.DataDir, "data-dir", cfg.DataDir, "directory for users and audit logs")
	fs.StringVar(&cfg.DockerSocket, "docker-sock", cfg.DockerSocket, "path to Docker Unix socket")
	fs.BoolVar(&cfg.MockMode, "mock", defaultMock, "use in-memory mock provider instead of native Linux interfaces")
	fs.BoolVar(&cfg.SecureCookie, "secure-cookie", false, "set Secure flag on session cookies (enable behind HTTPS)")
	_ = fs.Parse(args)

	authStore, err := auth.NewStore(cfg.DataDir)
	if err != nil {
		log.Fatalf("init auth store: %v", err)
	}
	defer authStore.Close()
	if cfg.MockMode {
		if err := authStore.EnsureMockAdmin(); err != nil {
			log.Fatalf("seed mock admin: %v", err)
		}
	}

	auditLogger, err := audit.NewLogger(cfg.DataDir)
	if err != nil {
		log.Fatalf("init audit logger: %v", err)
	}
	defer auditLogger.Close()

	var provider platform.Provider
	if cfg.MockMode {
		provider = mock.NewProvider()
		log.Printf("wePlane starting in MOCK mode (default login: admin / weplane)")
	} else {
		provider, err = newNativeProvider(cfg)
		if err != nil {
			log.Fatalf("init linux provider: %v", err)
		}
		log.Printf("wePlane starting in NATIVE Linux mode")
	}
	defer provider.Close()

	hist := metrics.NewHistoryStore(provider.IsMock(), cfg.DataDir)
	defer hist.Close()
	samplerCtx, samplerCancel := context.WithCancel(context.Background())
	defer samplerCancel()
	hist.StartSampler(samplerCtx, provider.System(), 10*time.Second)

	srv := server.New(cfg, provider, authStore, auditLogger, hist)
	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("listening on http://%s", cfg.Addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}

func runUserCmd(args []string) error {
	if len(args) == 0 || args[0] != "add" {
		return fmt.Errorf("usage: weplane user add --username <name> --password <pass> [--data-dir ./data]")
	}
	cfg := config.DefaultConfig()
	var username, password string

	fs := flag.NewFlagSet("user add", flag.ExitOnError)
	fs.StringVar(&cfg.DataDir, "data-dir", cfg.DataDir, "directory for users and audit logs")
	fs.StringVar(&username, "username", "", "username")
	fs.StringVar(&password, "password", "", "password (min 6 chars)")
	_ = fs.Parse(args[1:])

	store, err := auth.NewStore(cfg.DataDir)
	if err != nil {
		return err
	}
	if err := store.CreateOrUpdateUser(username, password); err != nil {
		return err
	}
	fmt.Printf("user %q saved in %s\n", username, cfg.DataDir)
	return nil
}
