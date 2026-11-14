import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/api/client'
import { cn } from '@/lib/format'

interface CreateServiceModalProps {
  open: boolean
  onClose: () => void
  onCreated: (name: string) => void
}

type Mode = 'form' | 'raw'

export function CreateServiceModal({ open, onClose, onCreated }: CreateServiceModalProps) {
  const [mode, setMode] = useState<Mode>('form')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [execStart, setExecStart] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [user, setUser] = useState('')
  const [restart, setRestart] = useState('on-failure')
  const [after, setAfter] = useState('network-online.target')
  const [environment, setEnvironment] = useState('')
  const [unitContent, setUnitContent] = useState('')
  const [enable, setEnable] = useState(true)
  const [start, setStart] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const buildPreviewUnit = () => {
    const cleanName = name.trim().replace(/\.service$/, '') || 'my-service'
    const desc = description.trim() || cleanName
    const afterVal = after.trim() || 'network-online.target'
    const lines = [
      '[Unit]',
      `Description=${desc}`,
      `After=${afterVal}`,
      ...(afterVal.includes('network-online.target') ? ['Wants=network-online.target'] : []),
      '',
      '[Service]',
      'Type=simple',
      ...(user.trim() ? [`User=${user.trim()}`] : []),
      ...(workingDirectory.trim() ? [`WorkingDirectory=${workingDirectory.trim()}`] : []),
      ...environment
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => `Environment="${l.replace(/"/g, '\\"')}"`),
      `ExecStart=${execStart.trim() || '/usr/local/bin/my-app'}`,
      `Restart=${restart || 'on-failure'}`,
      'RestartSec=5s',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      '',
    ]
    return lines.join('\n')
  }

  const switchMode = (next: Mode) => {
    if (next === 'raw' && !unitContent.trim()) {
      setUnitContent(buildPreviewUnit())
    }
    setMode(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('请填写服务名称')
      return
    }
    if (mode === 'form' && !execStart.trim()) {
      setError('请填写启动命令（ExecStart）')
      return
    }
    if (mode === 'raw' && !unitContent.trim()) {
      setError('Unit 文件内容不能为空')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.services.create({
        name: name.trim(),
        description: description.trim() || undefined,
        execStart: mode === 'form' ? execStart.trim() : undefined,
        workingDirectory: mode === 'form' ? workingDirectory.trim() || undefined : undefined,
        user: mode === 'form' ? user.trim() || undefined : undefined,
        restart: mode === 'form' ? restart : undefined,
        after: mode === 'form' ? after.trim() || undefined : undefined,
        environment: mode === 'form' ? environment.trim() || undefined : undefined,
        unitContent: mode === 'raw' ? unitContent : undefined,
        enable,
        start,
      })
      onCreated(res.name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建服务失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="glass-surface flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-white/10">
          <div>
            <h2 className="text-base font-semibold">新建 systemd 服务</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              写入 /etc/systemd/system/&lt;name&gt;.service 并自动执行 daemon-reload
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1 rounded-xl bg-slate-500/10 p-1">
                <button
                  type="button"
                  onClick={() => switchMode('form')}
                  className={cn(
                    'rounded-lg px-3 py-1 font-medium transition',
                    mode === 'form'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                  )}
                >
                  向导表单
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('raw')}
                  className={cn(
                    'rounded-lg px-3 py-1 font-medium transition',
                    mode === 'raw'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                  )}
                >
                  自定义 Unit 文件
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-rose-600 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  服务名称 *
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如 my-api 或 my-api.service"
                  className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  服务描述
                </span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例如 My Backend API Service"
                  className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
                />
              </label>
            </div>

            {mode === 'form' ? (
              <>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                    启动命令 (ExecStart) *
                  </span>
                  <input
                    type="text"
                    value={execStart}
                    onChange={(e) => setExecStart(e.target.value)}
                    placeholder="例如 /usr/local/bin/my-app --port 8080"
                    className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                      工作目录 (WorkingDirectory)
                    </span>
                    <input
                      type="text"
                      value={workingDirectory}
                      onChange={(e) => setWorkingDirectory(e.target.value)}
                      placeholder="/opt/my-app"
                      className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                      运行用户 (User)
                    </span>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="留空默认 root，例如 www-data"
                      className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                      重启策略 (Restart)
                    </span>
                    <select
                      value={restart}
                      onChange={(e) => setRestart(e.target.value)}
                      className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
                    >
                      <option value="on-failure">异常退出时重启 (on-failure)</option>
                      <option value="always">始终重启 (always)</option>
                      <option value="no">不自动重启 (no)</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                      依赖顺序 (After)
                    </span>
                    <input
                      type="text"
                      value={after}
                      onChange={(e) => setAfter(e.target.value)}
                      placeholder="network-online.target"
                      className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                    环境变量 (每行一个 KEY=VALUE)
                  </span>
                  <textarea
                    rows={3}
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    placeholder={'PORT=8080\nENV=production'}
                    className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                  />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  systemd Unit 文件内容
                </span>
                <textarea
                  rows={13}
                  value={unitContent}
                  onChange={(e) => setUnitContent(e.target.value)}
                  className="glass-surface w-full rounded-xl bg-slate-950/90 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-sky-500"
                />
              </label>
            )}

            <div className="flex flex-wrap gap-5 pt-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={enable}
                  onChange={(e) => setEnable(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-sky-600"
                />
                <span>创建后设为开机自启 (enable)</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={start}
                  onChange={(e) => setStart(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-sky-600"
                />
                <span>创建后立即启动 (start)</span>
              </label>
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-slate-200/70 px-6 py-4 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="glass-surface rounded-xl px-4 py-2 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
            >
              {submitting ? '创建中...' : '创建服务'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
