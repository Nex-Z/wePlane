import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Box,
  Cog,
  History,
  LogOut,
  Moon,
  Server,
  Sun,
} from 'lucide-react'
import { api } from '@/api/client'
import type { AuthStatus } from '@/api/types'
import { AuditView } from '@/features/audit/AuditView'
import { LoginView } from '@/features/auth/LoginView'
import { ContainersView } from '@/features/containers/ContainersView'
import { OverviewView } from '@/features/overview/OverviewView'
import { ServicesView } from '@/features/services/ServicesView'
import { cn } from '@/lib/format'

type NavTab = 'overview' | 'services' | 'containers' | 'audit'

const navItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: '系统概览', icon: Activity },
  { id: 'services', label: '服务管理', icon: Cog },
  { id: 'containers', label: 'Docker 容器', icon: Box },
  { id: 'audit', label: '审计日志', icon: History },
]

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null)
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

        <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
          <div className="flex items-center justify-between px-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate font-medium">{auth.username}</span>
            <button
              onClick={() => setDark((d) => !d)}
              title="切换深浅主题"
              className="rounded-lg p-1.5 hover:bg-slate-500/10"
            >
              {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-500 dark:text-slate-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Right Workspace */}
      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{currentMeta.label}</h1>
          </div>
          {auth.mockMode && (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              本地模拟数据模式
            </span>
          )}
        </header>

        {tab === 'overview' && <OverviewView onNavigate={setTab} />}
        {tab === 'services' && <ServicesView />}
        {tab === 'containers' && <ContainersView />}
        {tab === 'audit' && <AuditView />}
      </main>
    </div>
  )
}

export default App
