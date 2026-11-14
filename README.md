# wePlane

轻量级单机 Linux 运维 Web 控制面板（主要面向 Debian 13+），采用单二进制部署（Go 后端 + `go:embed` 内嵌 React 前端），支持本地 Windows Mock 开发调试与 Linux 生产环境原生对接。

## 核心功能

- **系统概览**：CPU、内存、Swap、磁盘、磁盘 I/O、网络吞吐实时 SSE 推送（2 秒级），24 小时 / 180 天及自定义时间范围历史曲线，CPU / 内存 / 磁盘 / 网络 Top-N 进程检查器。
- **服务管理**：基于 systemd D-Bus 管理服务（启动、停止、重启、开机自启/禁用、`daemon-reload`），支持新建自定义 Unit 服务、删除 `/etc/systemd/system` 下的自定义服务、查看 Unit 文件内容及 `journalctl` 实时日志流。
- **Docker 容器 & Compose**：容器生命周期管理（启动、停止、重启、删除）、创建新容器、网络与存储卷展示、实时日志流，以及自定义目录部署与管理 Docker Compose 项目。
- **文件管理**：目录浏览与面包屑导航、在线文本编辑（≤ 1 MB）、新建目录/文件、上传、下载、二次确认删除（Mock 模式下隔离在 `<data-dir>/mock_fs`）。
- **Web 终端**：基于 `@xterm/xterm` + WebSocket，Linux 生产环境直连 `/bin/bash -l` PTY，Mock 模式下提供交互式模拟 Shell。
- **审计日志**：记录登录、密码修改、设置变更、服务/容器/Compose/文件/终端等关键操作并支持分类筛选与搜索，持久化于 `<data-dir>/weplane.db`。
- **系统设置**：修改管理员密码、资源告警阈值与刷新/日志偏好、Bark 推送通知（支持官方或自建服务端与测试推送）、软件版本与运行环境信息查看。

## 技术栈

- **后端**：Go 1.26、`chi/v5`、`godbus/dbus/v5`、`coder/websocket`、`creack/pty`、`modernc.org/sqlite`、`golang.org/x/crypto/argon2`
- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS 4、`@tanstack/react-table`、`recharts`、`@xterm/xterm`、`lucide-react`

## 本地开发（Windows Mock 模式）

```powershell
# 1. 启动 Go 后端（Windows 下默认自动启用 Mock 模式，默认账号 admin / weplane）
go run ./cmd/weplane --mock

# 2. 启动前端开发服务器（使用 pnpm）
pnpm --dir web dev
```

运行后端测试：

```powershell
go test ./...
```

## 构建发布产物

执行构建脚本将自动完成前端打包、同步至 `internal/webembed/dist` 并交叉编译 Linux `amd64` / `arm64` 单二进制：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

产物位于 `dist/` 目录：
- `dist/weplane-linux-amd64`
- `dist/weplane-linux-arm64`

## Linux 生产部署（`/srv/services/weplane`）

### 1. 目录与二进制准备

将 `weplane-linux-amd64`（ARM64 机器使用 `weplane-linux-arm64`）上传至 `/srv/services/weplane/`：

```bash
sudo mkdir -p /srv/services/weplane/data
sudo mv /srv/services/weplane/weplane-linux-amd64 /srv/services/weplane/weplane
sudo chmod +x /srv/services/weplane/weplane
```

### 2. 配置 systemd 服务

创建 `/etc/systemd/system/weplane.service`：

```ini
[Unit]
Description=wePlane Server Control Center
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/srv/services/weplane
ExecStart=/srv/services/weplane/weplane serve --addr :8080 --data-dir /srv/services/weplane/data
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

> 若挂载在 HTTPS 反向代理（Nginx / Caddy）之后，建议在 `ExecStart` 追加 `--secure-cookie`。

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now weplane
sudo systemctl status weplane
```

### 3. 升级更新

持久化数据（`weplane.db` 中的用户、会话、设置、审计日志、监控历史，以及 `compose/`）均保存在 `/srv/services/weplane/data`，替换二进制文件不会丢失数据（首次从旧版本升级时会自动导入原有 `users.json`、`settings.json`、`audit.jsonl`）：

```bash
sudo systemctl stop weplane && \
sudo cp weplane-linux-amd64 /srv/services/weplane/weplane && \
sudo chmod +x /srv/services/weplane/weplane && \
sudo systemctl start weplane
```
