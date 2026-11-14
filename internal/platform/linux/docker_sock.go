//go:build linux

package linux

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"weplane/internal/platform"
)

var validComposeProject = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`)

type containerProvider struct {
	sockPath   string
	composeDir string
	client     *http.Client
}

func newContainerProvider(sockPath, dataDir string) *containerProvider {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "unix", sockPath)
		},
	}
	return &containerProvider{
		sockPath:   sockPath,
		composeDir: filepath.Join(dataDir, "compose"),
		client:     &http.Client{Transport: transport, Timeout: 60 * time.Second},
	}
}

func (c *containerProvider) doJSON(ctx context.Context, method, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, "http://docker"+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("docker socket (%s): %w", c.sockPath, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("docker API %s returned %d: %s", path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

type dockerListEntry struct {
	ID      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Image   string            `json:"Image"`
	State   string            `json:"State"`
	Status  string            `json:"Status"`
	Created int64             `json:"Created"`
	Labels  map[string]string `json:"Labels"`
	Ports   []struct {
		IP          string `json:"IP"`
		PrivatePort uint16 `json:"PrivatePort"`
		PublicPort  uint16 `json:"PublicPort"`
		Type        string `json:"Type"`
	} `json:"Ports"`
	Mounts []struct {
		Type        string `json:"Type"`
		Source      string `json:"Source"`
		Destination string `json:"Destination"`
		Mode        string `json:"Mode"`
		RW          bool   `json:"RW"`
	} `json:"Mounts"`
	NetworkSettings struct {
		Networks map[string]any `json:"Networks"`
	} `json:"NetworkSettings"`
}

func (c *containerProvider) ListContainers(ctx context.Context, all bool) ([]platform.ContainerSummary, error) {
	var raw []dockerListEntry
	path := fmt.Sprintf("/containers/json?all=%t", all)
	if err := c.doJSON(ctx, http.MethodGet, path, &raw); err != nil {
		return nil, err
	}

	out := make([]platform.ContainerSummary, 0, len(raw))
	for _, e := range raw {
		name := e.ID[:minInt(12, len(e.ID))]
		if len(e.Names) > 0 {
			name = strings.TrimPrefix(e.Names[0], "/")
		}
		ports := make([]platform.ContainerPort, 0, len(e.Ports))
		for _, p := range e.Ports {
			ports = append(ports, platform.ContainerPort{
				IP:          p.IP,
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			})
		}
		mounts := make([]platform.ContainerMount, 0, len(e.Mounts))
		for _, m := range e.Mounts {
			mounts = append(mounts, platform.ContainerMount{
				Type: m.Type, Source: m.Source, Destination: m.Destination, Mode: m.Mode, RW: m.RW,
			})
		}
		nets := make([]string, 0, len(e.NetworkSettings.Networks))
		for k := range e.NetworkSettings.Networks {
			nets = append(nets, k)
		}
		sort.Strings(nets)

		out = append(out, platform.ContainerSummary{
			ID:             e.ID,
			ShortID:        e.ID[:minInt(12, len(e.ID))],
			Name:           name,
			Image:          e.Image,
			State:          e.State,
			Status:         e.Status,
			CreatedAt:      time.Unix(e.Created, 0),
			ComposeProject: e.Labels["com.docker.compose.project"],
			ComposeService: e.Labels["com.docker.compose.service"],
			Ports:          ports,
			Networks:       nets,
			Mounts:         mounts,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].ComposeProject != out[j].ComposeProject {
			return out[i].ComposeProject < out[j].ComposeProject
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

type dockerInspectEntry struct {
	ID      string `json:"Id"`
	Name    string `json:"Name"`
	Created string `json:"Created"`
	Config  struct {
		Image  string            `json:"Image"`
		Cmd    []string          `json:"Cmd"`
		Env    []string          `json:"Env"`
		Labels map[string]string `json:"Labels"`
	} `json:"Config"`
	State struct {
		Status string `json:"Status"`
	} `json:"State"`
	HostConfig struct {
		RestartPolicy struct {
			Name string `json:"Name"`
		} `json:"RestartPolicy"`
	} `json:"HostConfig"`
	Mounts []struct {
		Type        string `json:"Type"`
		Source      string `json:"Source"`
		Destination string `json:"Destination"`
		Mode        string `json:"Mode"`
		RW          bool   `json:"RW"`
	} `json:"Mounts"`
	NetworkSettings struct {
		Networks map[string]any `json:"Networks"`
	} `json:"NetworkSettings"`
}

func (c *containerProvider) InspectContainer(ctx context.Context, id string) (*platform.ContainerDetail, error) {
	var raw dockerInspectEntry
	if err := c.doJSON(ctx, http.MethodGet, "/containers/"+url.PathEscape(id)+"/json", &raw); err != nil {
		return nil, err
	}

	createdAt, _ := time.Parse(time.RFC3339Nano, raw.Created)
	envKeys := make([]string, 0, len(raw.Config.Env))
	for _, kv := range raw.Config.Env {
		if k, _, ok := strings.Cut(kv, "="); ok {
			envKeys = append(envKeys, k)
		}
	}
	mounts := make([]platform.ContainerMount, 0, len(raw.Mounts))
	for _, m := range raw.Mounts {
		mounts = append(mounts, platform.ContainerMount{
			Type: m.Type, Source: m.Source, Destination: m.Destination, Mode: m.Mode, RW: m.RW,
		})
	}
	nets := make([]string, 0, len(raw.NetworkSettings.Networks))
	for k := range raw.NetworkSettings.Networks {
		nets = append(nets, k)
	}
	sort.Strings(nets)

	return &platform.ContainerDetail{
		ContainerSummary: platform.ContainerSummary{
			ID:             raw.ID,
			ShortID:        raw.ID[:minInt(12, len(raw.ID))],
			Name:           strings.TrimPrefix(raw.Name, "/"),
			Image:          raw.Config.Image,
			State:          raw.State.Status,
			Status:         raw.State.Status,
			CreatedAt:      createdAt,
			ComposeProject: raw.Config.Labels["com.docker.compose.project"],
			ComposeService: raw.Config.Labels["com.docker.compose.service"],
			Mounts:         mounts,
			Networks:       nets,
		},
		Command:       strings.Join(raw.Config.Cmd, " "),
		EnvKeys:       envKeys,
		RestartPolicy: raw.HostConfig.RestartPolicy.Name,
	}, nil
}

func (c *containerProvider) ControlContainer(ctx context.Context, id string, action platform.ContainerAction) error {
	var endpoint string
	switch action {
	case platform.ContainerActionStart:
		endpoint = "/containers/" + url.PathEscape(id) + "/start"
	case platform.ContainerActionStop:
		endpoint = "/containers/" + url.PathEscape(id) + "/stop?t=10"
	case platform.ContainerActionRestart:
		endpoint = "/containers/" + url.PathEscape(id) + "/restart?t=10"
	default:
		return fmt.Errorf("unsupported container action: %s", action)
	}
	return c.doJSON(ctx, http.MethodPost, endpoint, nil)
}

func (c *containerProvider) DeleteContainer(ctx context.Context, id string) error {
	endpoint := "/containers/" + url.PathEscape(id) + "?force=true"
	return c.doJSON(ctx, http.MethodDelete, endpoint, nil)
}

func (c *containerProvider) CreateContainer(ctx context.Context, req platform.CreateContainerRequest) (string, error) {
	if strings.TrimSpace(req.Image) == "" {
		return "", fmt.Errorf("image is required")
	}

	exposedPorts := make(map[string]struct{})
	portBindings := make(map[string][]map[string]string)
	for _, p := range req.Ports {
		parts := strings.Split(strings.TrimSpace(p), ":")
		if len(parts) != 2 {
			continue
		}
		hostPort := parts[0]
		contSpec := parts[1]
		if !strings.Contains(contSpec, "/") {
			contSpec += "/tcp"
		}
		exposedPorts[contSpec] = struct{}{}
		portBindings[contSpec] = append(portBindings[contSpec], map[string]string{"HostPort": hostPort})
	}

	restartName := req.RestartPolicy
	if restartName == "" {
		restartName = "unless-stopped"
	}

	payload := map[string]any{
		"Image":        req.Image,
		"Env":          req.Env,
		"ExposedPorts": exposedPorts,
		"HostConfig": map[string]any{
			"Binds":        req.Volumes,
			"PortBindings": portBindings,
			"RestartPolicy": map[string]any{
				"Name": restartName,
			},
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	createPath := "/containers/create"
	if name := strings.TrimSpace(req.Name); name != "" {
		createPath += "?name=" + url.QueryEscape(name)
	}

	createOnce := func() (int, string, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://docker"+createPath, bytes.NewReader(bodyBytes))
		if err != nil {
			return 0, "", err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		resp, err := c.client.Do(httpReq)
		if err != nil {
			return 0, "", err
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
		return resp.StatusCode, string(raw), nil
	}

	status, rawResp, err := createOnce()
	if err != nil {
		return "", err
	}
	if status == http.StatusNotFound {
		// Image not present locally; pull it first.
		pullReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://docker/images/create?fromImage="+url.QueryEscape(req.Image), nil)
		if err != nil {
			return "", err
		}
		pullResp, err := c.client.Do(pullReq)
		if err != nil {
			return "", fmt.Errorf("pull image %s: %w", req.Image, err)
		}
		_, _ = io.Copy(io.Discard, pullResp.Body)
		pullResp.Body.Close()
		if pullResp.StatusCode >= 400 {
			return "", fmt.Errorf("pull image %s failed with status %d", req.Image, pullResp.StatusCode)
		}
		status, rawResp, err = createOnce()
		if err != nil {
			return "", err
		}
	}
	if status >= 400 {
		return "", fmt.Errorf("create container failed (%d): %s", status, strings.TrimSpace(rawResp))
	}

	var created struct {
		ID string `json:"Id"`
	}
	if err := json.Unmarshal([]byte(rawResp), &created); err != nil {
		return "", err
	}

	if req.AutoStart && created.ID != "" {
		if err := c.ControlContainer(ctx, created.ID, platform.ContainerActionStart); err != nil {
			return created.ID, err
		}
	}
	return created.ID, nil
}

func (c *containerProvider) DeployCompose(ctx context.Context, req platform.ComposeDeployRequest) (string, error) {
	proj := strings.TrimSpace(req.Project)
	if !validComposeProject.MatchString(proj) {
		return "", fmt.Errorf("invalid compose project name: %q", proj)
	}
	if strings.TrimSpace(req.YAML) == "" {
		return "", fmt.Errorf("compose YAML is required")
	}

	projDir := filepath.Join(c.composeDir, proj)
	if custom := strings.TrimSpace(req.WorkDir); custom != "" {
		if !filepath.IsAbs(custom) {
			return "", fmt.Errorf("compose workDir must be an absolute path: %q", custom)
		}
		projDir = filepath.Clean(custom)
	}

	if err := os.MkdirAll(projDir, 0o755); err != nil {
		return "", err
	}
	composeFile := filepath.Join(projDir, "docker-compose.yml")
	if err := os.WriteFile(composeFile, []byte(req.YAML), 0o600); err != nil {
		return "", err
	}
	c.saveComposeDir(proj, projDir)

	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composeFile, "-p", proj, "up", "-d")
	cmd.Dir = projDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("docker compose up: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func (c *containerProvider) ControlCompose(ctx context.Context, project, action string) (string, error) {
	if !validComposeProject.MatchString(project) {
		return "", fmt.Errorf("invalid compose project name: %q", project)
	}
	projDir := c.lookupComposeDir(project)
	composeFile := filepath.Join(projDir, "docker-compose.yml")

	var args []string
	if _, err := os.Stat(composeFile); err == nil {
		args = []string{"compose", "-f", composeFile, "-p", project}
	} else {
		args = []string{"compose", "-p", project}
	}

	switch action {
	case "up":
		args = append(args, "up", "-d")
	case "restart":
		args = append(args, "restart")
	case "down":
		args = append(args, "down")
	default:
		return "", fmt.Errorf("unsupported compose action: %s", action)
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	if _, err := os.Stat(projDir); err == nil {
		cmd.Dir = projDir
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("docker compose %s: %w (%s)", action, err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func (c *containerProvider) composeIndexPath() string {
	return filepath.Join(c.composeDir, "projects.json")
}

func (c *containerProvider) saveComposeDir(project, dir string) {
	_ = os.MkdirAll(c.composeDir, 0o700)
	idx := make(map[string]string)
	if b, err := os.ReadFile(c.composeIndexPath()); err == nil {
		_ = json.Unmarshal(b, &idx)
	}
	idx[project] = dir
	if b, err := json.MarshalIndent(idx, "", "  "); err == nil {
		_ = os.WriteFile(c.composeIndexPath(), b, 0o600)
	}
}

func (c *containerProvider) lookupComposeDir(project string) string {
	if b, err := os.ReadFile(c.composeIndexPath()); err == nil {
		idx := make(map[string]string)
		if json.Unmarshal(b, &idx) == nil {
			if dir, ok := idx[project]; ok && dir != "" {
				return dir
			}
		}
	}
	return filepath.Join(c.composeDir, project)
}

func (c *containerProvider) StreamLogs(ctx context.Context, id string, tail int) (<-chan platform.LogLine, error) {
	if tail <= 0 || tail > 1000 {
		tail = 100
	}
	path := fmt.Sprintf("/containers/%s/logs?follow=1&stdout=1&stderr=1&timestamps=1&tail=%s",
		url.PathEscape(id), strconv.Itoa(tail))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker"+path, nil)
	if err != nil {
		return nil, err
	}
	streamClient := &http.Client{Transport: c.client.Transport}
	resp, err := streamClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		resp.Body.Close()
		return nil, fmt.Errorf("docker logs returned %d", resp.StatusCode)
	}

	ch := make(chan platform.LogLine, 64)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		readDockerLogStream(ctx, resp.Body, ch)
	}()
	return ch, nil
}

// readDockerLogStream handles both multiplexed (8-byte header) and raw TTY streams.
func readDockerLogStream(ctx context.Context, r io.Reader, ch chan<- platform.LogLine) {
	br := bufio.NewReader(r)
	header := make([]byte, 8)
	for {
		_, err := io.ReadFull(br, header)
		if err != nil {
			return
		}
		streamType := header[0]
		if (streamType == 1 || streamType == 2) && header[1] == 0 && header[2] == 0 && header[3] == 0 {
			size := binary.BigEndian.Uint32(header[4:8])
			payload := make([]byte, size)
			if _, err := io.ReadFull(br, payload); err != nil {
				return
			}
			stream := "stdout"
			if streamType == 2 {
				stream = "stderr"
			}
			for _, line := range strings.Split(strings.TrimRight(string(payload), "\r\n"), "\n") {
				if line == "" {
					continue
				}
				select {
				case <-ctx.Done():
					return
				case ch <- platform.LogLine{Timestamp: time.Now(), Stream: stream, Message: line}:
				}
			}
		} else {
			// Fallback for TTY containers without multiplexed framing.
			rest, _ := br.ReadString('\n')
			line := strings.TrimRight(string(header)+rest, "\r\n")
			select {
			case <-ctx.Done():
				return
			case ch <- platform.LogLine{Timestamp: time.Now(), Stream: "stdout", Message: line}:
			}
		}
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
