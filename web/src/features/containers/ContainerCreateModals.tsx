import { useState, type FormEvent } from 'react'
import { Box, Layers, X } from 'lucide-react'
import { api } from '@/api/client'

interface CreateContainerModalProps {
  open: boolean
  onClose: () => void
  onCreated: (message: string) => void
}

export function CreateContainerModal({ open, onClose, onCreated }: CreateContainerModalProps) {
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [portsText, setPortsText] = useState('')
  const [volumesText, setVolumesText] = useState('')
  const [envText, setEnvText] = useState('')
  const [restartPolicy, setRestartPolicy] = useState('unless-stopped')
  const [autoStart, setAutoStart] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const splitLines = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.containers.create({
        name: name.trim(),
        image: image.trim(),
        ports: splitLines(portsText),
        volumes: splitLines(volumesText),
        env: splitLines(envText),
        restartPolicy,
        autoStart,
      })
      onCreated(`容器 ${name.trim() || image.trim()} 已创建${autoStart ? '并启动' : ''}`)
      setName('')
      setImage('')
      setPortsText('')
      setVolumesText('')
      setEnvText('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建容器失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="glass-surface flex max-h-[88vh] w-full max-w-xl flex-col rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Box className="h-4 w-4 text-sky-500" />
            <span>创建 Docker 容器</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-500/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
                镜像名称 *
              </label>
              <input
                type="text"
                required
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="如 nginx:alpine"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
                容器名称（可选）
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如 my-nginx"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
                端口映射（每行一条）
              </label>
              <textarea
                rows={3}
                value={portsText}
                onChange={(e) => setPortsText(e.target.value)}
                placeholder={'8080:80\n8443:443'}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
                挂载卷（每行一条）
              </label>
              <textarea
                rows={3}
                value={volumesText}
                onChange={(e) => setVolumesText(e.target.value)}
                placeholder={'/srv/nginx/html:/usr/share/nginx/html'}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
              环境变量（每行一条 KEY=VALUE）
            </label>
            <textarea
              rows={2}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={'TZ=Asia/Shanghai'}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">重启策略</span>
              <select
                value={restartPolicy}
                onChange={(e) => setRestartPolicy(e.target.value)}
                className="rounded-xl border border-slate-200 bg-transparent px-2.5 py-1.5 outline-none dark:border-white/10"
              >
                <option value="unless-stopped">unless-stopped</option>
                <option value="always">always</option>
                <option value="on-failure">on-failure</option>
                <option value="no">no</option>
              </select>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
                className="h-4 w-4 rounded accent-sky-500"
              />
              <span>创建后立即启动</span>
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-rose-500">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium hover:bg-slate-500/10 dark:border-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? '正在拉取/创建...' : '创建容器'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ComposeDeployModalProps {
  open: boolean
  onClose: () => void
  onDeployed: (message: string) => void
}

const sampleComposeYAML = `services:
  web:
    image: nginx:alpine
    ports:
      - "8088:80"
    restart: unless-stopped
`

export function ComposeDeployModal({ open, onClose, onDeployed }: ComposeDeployModalProps) {
  const [project, setProject] = useState('')
  const [workDir, setWorkDir] = useState('')
  const [yaml, setYaml] = useState(sampleComposeYAML)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.containers.deployCompose({
        project: project.trim(),
        workDir: workDir.trim() || undefined,
        yaml,
      })
      onDeployed(`Compose 项目 ${project.trim()} 已部署并启动 (up -d)`)
      setProject('')
      setWorkDir('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compose 部署失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="glass-surface flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Layers className="h-4 w-4 text-sky-500" />
            <span>部署 Docker Compose 项目</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-500/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
                项目名称 *（字母、数字、-、_）
              </label>
              <input
                type="text"
                required
                pattern="^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="如 media-stack"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-500 dark:text-slate-300">
                部署目录（可选，Linux 绝对路径）
              </label>
              <input
                type="text"
                value={workDir}
                onChange={(e) => setWorkDir(e.target.value)}
                placeholder="如 /opt/stacks/media-stack（留空默认）"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono outline-none focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="font-medium text-slate-500 dark:text-slate-300">
                docker-compose.yml *
              </label>
              <button
                type="button"
                onClick={() => setYaml(sampleComposeYAML)}
                className="text-[11px] text-sky-500 hover:underline"
              >
                填入示例模板
              </button>
            </div>
            <textarea
              required
              rows={12}
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-sky-500 dark:border-white/10"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-rose-500">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium hover:bg-slate-500/10 dark:border-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? '正在部署 (up -d)...' : '部署并启动'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
