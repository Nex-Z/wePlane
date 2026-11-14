import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Box,
  Clock,
  Cog,
  FolderOpen,
  History,
  LogOut,
  Moon,
  Server,
  Settings,
  Sun,
  Terminal,
} from 'lucide-react'
import { api } from '@/api/client'
import type { AuthStatus, HostInfo } from '@/api/types'
import { AuditView } from '@/features/audit/AuditView'
import { LoginView } from '@/features/auth/LoginView'
import { ContainersView } from '@/features/containers/ContainersView'
import { FilesView } from '@/features/files/FilesView'
import { OverviewView } from '@/features/overview/OverviewView'
import { ServicesView } from '@/features/services/ServicesView'
import { SettingsView } from '@/features/settings/SettingsView'
import { TerminalView } from '@/features/terminal/TerminalView'
import { cn, formatUptime } from '@/lib/format'

type NavTab = 'overview' | 'services' | 'containers' | 'files' | 'terminal' | 'audit' | 'settings'

const navItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: '系统概览', icon: Activity },
  { id: 'services', label: '服务管理', icon: Cog },
  { id: 'containers', label: 'Docker 容器', icon: Box },
  { id: 'files', label: '文件管理', icon: FolderOpen },
  { id: 'terminal', label: '终端', icon: Terminal },
  { id: 'audit', label: '审计日志', icon: History },
  { id: 'settings', label: '设置', icon: Settings },
]

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null)
  const [tab, setTab] = useState<NavTab>('overview')
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const checkAuth = useCallback(async () => {
    try {
      const me = await api.auth.me()
      setAuth(me)
    } catch {
      setAuth({ authenticated: false, needsSetup: false, mockMode: false })
    }
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!auth?.authenticated) {
      setHostInfo(null)
      return
    }
    let cancelled = false
    const loadInfo = () => {
      api.system
        .info()
        .then((info) => {
          if (!cancelled) setHostInfo(info)
        })
        .catch(() => {})
    }
    loadInfo()
    const timer = window.setInterval(loadInfo, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [auth?.authenticated])

  const handleLogout = async () => {
    await api.auth.logout()
    await checkAuth()
  }

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        正在连接 wePlane...
      </div>
    )
  }

  if (!auth.authenticated) {
    return (
      <LoginView
        needsSetup={auth.needsSetup}
        mockMode={auth.mockMode}
        onSuccess={() => void checkAuth()}
      />
    )
  }

  const currentMeta = navItems.find((n) => n.id === tab)!
  const avatarInitial = (auth.username?.trim()?.[0] ?? 'A').toUpperCase()
  const bootTimeText = hostInfo?.bootTime
    ? new Date(hostInfo.bootTime).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--'

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Narrow Sidebar */}
      <aside className="glass-sidebar flex h-full w-56 shrink-0 flex-col justify-between p-3.5">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2.5 pt-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">wePlane</div>
              <div className="text-[11px] text-slate-400">
                {auth.mockMode ? 'Mock Mode' : 'Control Center'}
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                      : 'text-slate-600 hover:bg-slate-500/8 dark:text-slate-300 dark:hover:bg-white/5',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200/70 px-2.5 pt-3 text-xs dark:border-white/10">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>开机时间</span>
          </div>
          <div className="mt-1 font-mono text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {bootTimeText}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
            已运行 {hostInfo ? formatUptime(hostInfo.uptimeSec) : '--'}
          </div>
        </div>
      </aside>

      {/* Right Workspace */}
      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{currentMeta.label}</h1>
          </div>
          <div className="flex items-center gap-2.5">
            {auth.mockMode && (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                本地模拟数据模式
              </span>
            )}
            <button
              onClick={() => setDark((d) => !d)}
              title="切换深浅主题"
              className="glass-surface rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="glass-surface flex items-center gap-2.5 rounded-2xl py-1.5 pl-2 pr-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
                {avatarInitial}
              </div>
              <span className="max-w-[120px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                {auth.username}
              </span>
              <div className="h-3.5 w-px bg-slate-200 dark:bg-white/15" />
              <button
                onClick={() => void handleLogout()}
                title="退出登录"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-500 dark:text-slate-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>退出</span>
              </button>
            </div>
          </div>
        </header>

        {tab === 'overview' && <OverviewView onNavigate={setTab} />}
        {tab === 'services' && <ServicesView />}
        {tab === 'containers' && <ContainersView />}
        {tab === 'files' && <FilesView />}
        {tab === 'terminal' && <TerminalView />}
        {tab === 'audit' && <AuditView />}
        {tab === 'settings' && <SettingsView username={auth.username ?? 'admin'} />}
      </main>
    </div>
  )
}

export default App
