import { useState, type FormEvent } from 'react'
import { Lock, Server } from 'lucide-react'
import { api } from '@/api/client'

interface LoginViewProps {
  needsSetup: boolean
  mockMode: boolean
  onSuccess: () => void
}

export function LoginView({ needsSetup, mockMode, onSuccess }: LoginViewProps) {
  const [username, setUsername] = useState(mockMode ? 'admin' : '')
  const [password, setPassword] = useState(mockMode ? 'weplane' : '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (needsSetup) {
        await api.auth.setup(username, password)
      } else {
        await api.auth.login(username, password)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-surface w-full max-w-sm rounded-2xl p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-500">
            <Server className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">wePlane</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {needsSetup ? '首次启动 · 创建管理员账户' : '轻量级 Server Control Center'}
          </p>
          {mockMode && (
            <span className="mt-3 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Windows Mock 模式 · 默认 admin / weplane
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              用户名
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2 text-sm outline-none transition focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              密码
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2 text-sm outline-none transition focus:border-sky-500 dark:border-white/10 dark:bg-white/5"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {loading ? '处理中...' : needsSetup ? '创建并登录' : '登录控制中心'}
          </button>
        </form>
      </div>
    </div>
  )
}
