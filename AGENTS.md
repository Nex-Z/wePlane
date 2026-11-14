# AGENTS.md

本文件为 AI 编码助手与协作者提供 `wePlane` 仓库的开发约定、目录结构与部署约束。

## 项目概览

- **定位**：轻量级单机 Linux 运维控制面板（Debian 13 为主目标），Go 单二进制 + `go:embed` 内嵌 React 前端。
- **平台隔离**：
  - `internal/platform/linux/*` 与 `internal/server/terminal_linux.go`、`cmd/weplane/provider_linux.go` 使用 `//go:build linux` 编译标签，对接真实 Linux `/proc`、systemd D-Bus、Docker Unix Socket 与 PTY。
  - `internal/platform/mock/*` 与 `internal/server/terminal_other.go` 用于 Windows/macOS 本地开发或 `--mock` 模式。

## 目录结构

- `cmd/weplane/`：程序入口与 CLI 参数（`serve` / `user`）
- `internal/auth/`：Argon2id 用户认证与内存会话（持久化 `users.json`）
- `internal/audit/`：JSONL 审计日志（持久化 `audit.jsonl`）
- `internal/config/`：启动配置与面板设置存储（持久化 `settings.json`）
- `internal/metrics/`：系统历史采样存储（内存时间序列）
- `internal/notify/`：通知推送（目前支持 Bark v2 JSON API）
- `internal/platform/`：OS 抽象接口（`SystemProvider`、`ServiceProvider`、`ContainerProvider`）
- `internal/server/`：`chi` HTTP 路由、REST API、SSE 指标流、WebSocket 日志与终端
- `internal/webembed/`：`go:embed` 前端静态资源容器
- `web/`：React + TypeScript + Vite + Tailwind CSS 4 前端项目
- `scripts/build.ps1`：前端构建 + 同步 `internal/webembed/dist` + Linux `amd64`/`arm64` 交叉编译脚本

## 开发与构建规范

1. **包管理器**：前端目录 `web/` 统一使用 **`pnpm`**（例如 `pnpm --dir web add <pkg>`、`pnpm --dir web build`），不要使用 `npm`。
2. **测试与构建**：
   - 后端测试：`go test ./...`
   - 全量发布构建：`powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1`
3. **代码与交互规范**：
   - 所有破坏性操作（停止/禁用/删除服务、停止/删除容器、下线 Compose、删除文件/目录）后端必须校验 `X-Weplane-Confirm: true` 请求头，前端必须经由 `ConfirmDialog` 二次确认。
   - 所有状态变更操作必须调用 `s.recordAudit(...)` 记入审计日志，并在 `web/src/features/audit/AuditView.tsx` 的 `actionLabels` 中补充对应中文名称。
   - 前端界面文案保持简体中文，详情查看统一使用居中弹窗（`DetailDrawer`），状态徽章使用中文标签。
   - 严禁在 `/etc/systemd/system` 之外删除 systemd Unit，且必须保护 `criticalUnits` 与关键容器。

## 生产部署约定

- 部署目录：`/srv/services/weplane`
- 可执行文件：`/srv/services/weplane/weplane`
- 数据目录：`/srv/services/weplane/data`（包含 `users.json`、`settings.json`、`audit.jsonl`、`compose/`）
- systemd 服务名：`weplane.service`（`/etc/systemd/system/weplane.service`）
