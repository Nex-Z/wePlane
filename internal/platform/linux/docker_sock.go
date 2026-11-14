//go:build linux

package linux

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"weplane/internal/platform"
)

type containerProvider struct {
	sockPath string
	client   *http.Client
}

func newContainerProvider(sockPath string) *containerProvider {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "unix", sockPath)
		},
	}
	return &containerProvider{
		sockPath: sockPath,
		client:   &http.Client{Transport: transport, Timeout: 15 * time.Second},
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
		},
		Command:       strings.Join(raw.Config.Cmd, " "),
		Mounts:        mounts,
		Networks:      nets,
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
