package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const maxEditableFileBytes = 1024 * 1024 // 1 MB

type fileEntry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	Mode    string    `json:"mode"`
	ModTime time.Time `json:"modTime"`
}

func (s *Server) mockRootDir() string {
	root := filepath.Join(s.cfg.DataDir, "mock_fs")
	if _, err := os.Stat(root); os.IsNotExist(err) {
		_ = os.MkdirAll(filepath.Join(root, "opt", "docker"), 0o755)
		_ = os.MkdirAll(filepath.Join(root, "etc", "nginx"), 0o755)
		_ = os.MkdirAll(filepath.Join(root, "var", "log"), 0o755)
		_ = os.WriteFile(filepath.Join(root, "opt", "docker", "compose.yml"), []byte("services:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - \"8080:80\"\n"), 0o644)
		_ = os.WriteFile(filepath.Join(root, "etc", "nginx", "nginx.conf"), []byte("worker_processes auto;\nevents {\n  worker_connections 1024;\n}\n"), 0o644)
		_ = os.WriteFile(filepath.Join(root, "var", "log", "weplane.log"), []byte("[info] wePlane mock filesystem initialized\n"), 0o644)
		_ = os.WriteFile(filepath.Join(root, "README.md"), []byte("# wePlane Mock Root\n\nThis directory simulates the Linux root filesystem in Mock mode.\n"), 0o644)
	}
	return root
}

// resolveFilePath maps a logical API path (e.g. "/opt/docker") to a real OS path
// and returns both the OS path and normalized logical path.
func (s *Server) resolveFilePath(raw string) (osPath string, logicalPath string, err error) {
	cleaned := strings.TrimSpace(raw)
	if cleaned == "" {
		if s.provider.IsMock() {
			cleaned = "/"
		} else {
			cleaned = "/"
		}
	}
	cleaned = strings.ReplaceAll(cleaned, "\\", "/")
	if !strings.HasPrefix(cleaned, "/") {
		cleaned = "/" + cleaned
	}
	// Clean using slash semantics.
	parts := strings.Split(cleaned, "/")
	stack := make([]string, 0, len(parts))
	for _, p := range parts {
		if p == "" || p == "." {
			continue
		}
		if p == ".." {
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
			continue
		}
		stack = append(stack, p)
	}
	logicalPath = "/" + strings.Join(stack, "/")

	if s.provider.IsMock() {
		root := s.mockRootDir()
		rel := filepath.FromSlash(strings.TrimPrefix(logicalPath, "/"))
		osPath = filepath.Join(root, rel)
		return osPath, logicalPath, nil
	}

	return filepath.FromSlash(logicalPath), logicalPath, nil
}

func parentLogicalPath(logical string) string {
	if logical == "/" || logical == "" {
		return "/"
	}
	idx := strings.LastIndex(strings.TrimSuffix(logical, "/"), "/")
	if idx <= 0 {
		return "/"
	}
	return logical[:idx]
}

func (s *Server) handleListFiles(w http.ResponseWriter, r *http.Request) {
	osPath, logicalPath, err := s.resolveFilePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_path", err.Error())
		return
	}
	entries, err := os.ReadDir(osPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, "read_dir_failed", err.Error())
		return
	}

	items := make([]fileEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		childLogical := logicalPath
		if childLogical != "/" {
			childLogical += "/"
		}
		childLogical += e.Name()
		items = append(items, fileEntry{
			Name:    e.Name(),
			Path:    childLogical,
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime(),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"path":   logicalPath,
		"parent": parentLogicalPath(logicalPath),
		"items":  items,
	})
}

func (s *Server) handleReadFile(w http.ResponseWriter, r *http.Request) {
	osPath, logicalPath, err := s.resolveFilePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_path", err.Error())
		return
	}
	info, err := os.Stat(osPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "file_not_found", err.Error())
		return
	}
	if info.IsDir() {
		writeError(w, http.StatusBadRequest, "is_directory", "不能直接打开目录")
		return
	}
	if info.Size() > maxEditableFileBytes {
		writeError(w, http.StatusBadRequest, "file_too_large", "文件超过 1 MB，请使用下载功能")
		return
	}
	b, err := os.ReadFile(osPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read_file_failed", err.Error())
		return
	}
	if bytes.IndexByte(b, 0) >= 0 {
		writeError(w, http.StatusBadRequest, "binary_file", "不支持在线编辑二进制文件，请直接下载")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    logicalPath,
		"content": string(b),
		"size":    info.Size(),
	})
}

func (s *Server) handleWriteFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	osPath, logicalPath, err := s.resolveFilePath(req.Path)
	if err != nil || logicalPath == "/" {
		writeError(w, http.StatusBadRequest, "invalid_path", "文件路径不合法")
		return
	}
	if err := os.MkdirAll(filepath.Dir(osPath), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "mkdir_failed", err.Error())
		return
	}
	err = os.WriteFile(osPath, []byte(req.Content), 0o644)
	s.recordAudit(r, "file.write", logicalPath, err)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "write_file_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": logicalPath, "ok": true})
}

func (s *Server) handleMkdir(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "请求格式错误")
		return
	}
	osPath, logicalPath, err := s.resolveFilePath(req.Path)
	if err != nil || logicalPath == "/" {
		writeError(w, http.StatusBadRequest, "invalid_path", "目录路径不合法")
		return
	}
	err = os.MkdirAll(osPath, 0o755)
	s.recordAudit(r, "file.mkdir", logicalPath, err)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "mkdir_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"path": logicalPath, "ok": true})
}

func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "upload_parse_failed", err.Error())
		return
	}
	dirOS, dirLogical, err := s.resolveFilePath(r.URL.Query().Get("dir"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_path", err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing_file", "未选择上传文件")
		return
	}
	defer file.Close()

	base := filepath.Base(header.Filename)
	if base == "." || base == "/" || base == "" {
		writeError(w, http.StatusBadRequest, "invalid_filename", "文件名不合法")
		return
	}
	targetOS := filepath.Join(dirOS, base)
	targetLogical := dirLogical
	if targetLogical != "/" {
		targetLogical += "/"
	}
	targetLogical += base

	dst, err := os.Create(targetOS)
	if err != nil {
		s.recordAudit(r, "file.upload", targetLogical, err)
		writeError(w, http.StatusInternalServerError, "upload_create_failed", err.Error())
		return
	}
	defer dst.Close()

	_, copyErr := io.Copy(dst, file)
	s.recordAudit(r, "file.upload", targetLogical, copyErr)
	if copyErr != nil {
		writeError(w, http.StatusInternalServerError, "upload_write_failed", copyErr.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"path": targetLogical, "ok": true})
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	osPath, _, err := s.resolveFilePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_path", err.Error())
		return
	}
	info, err := os.Stat(osPath)
	if err != nil || info.IsDir() {
		writeError(w, http.StatusBadRequest, "invalid_file", "文件不存在或为目录")
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(osPath)))
	http.ServeFile(w, r, osPath)
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	if !hasConfirmHeader(r) {
		writeError(w, http.StatusPreconditionRequired, "confirm_required", "删除文件或目录需要二次确认")
		return
	}
	osPath, logicalPath, err := s.resolveFilePath(r.URL.Query().Get("path"))
	if err != nil || logicalPath == "/" {
		writeError(w, http.StatusBadRequest, "invalid_path", "不允许删除根目录或非法路径")
		return
	}
	err = os.RemoveAll(osPath)
	s.recordAudit(r, "file.delete", logicalPath, err)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": logicalPath, "deleted": true})
}
