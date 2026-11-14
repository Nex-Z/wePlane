//go:build !embed_web

package webembed

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Handler serves web/dist from disk if present, otherwise guides the developer to Vite dev server.
func Handler() http.Handler {
	distDir := filepath.Join("web", "dist")
	if info, err := os.Stat(distDir); err == nil && info.IsDir() {
		fsHandler := http.FileServer(http.Dir(distDir))
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path != "" {
				if _, err := os.Stat(filepath.Join(distDir, path)); err != nil {
					r2 := r.Clone(r.Context())
					r2.URL.Path = "/"
					fsHandler.ServeHTTP(w, r2)
					return
				}
			}
			fsHandler.ServeHTTP(w, r)
		})
	}

	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("wePlane API server is running (dev mode). Start Vite with `cd web && pnpm dev` or build with `-tags embed_web`."))
	})
}
