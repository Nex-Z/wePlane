import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw, Search, XCircle } from 'lucide-react'
import { api } from '@/api/client'
import type { AuditEntry } from '@/api/types'
import { cn } from '@/lib/format'

type FilterTab = 'all' | 'success' | 'error' | 'auth' | 'service' | 'container'

const actionLabels: Record<string, string> = {
  'auth.login': '用户登录',
  'auth.password': '修改密码',
  'settings.update': '更新设置',
  'settings.bark-test': '测试 Bark 推送',
  'service.start': '启动服务',
  'service.stop': '停止服务',
  'service.restart': '重启服务',
  'service.enable': '开启自启',
  'service.disable': '禁用自启',
  'service.daemon-reload': '重载 systemd',
  'service.create': '创建服务',
  'service.delete': '删除服务',
  'container.start': '启动容器',
  'container.stop': '停止容器',
  'container.restart': '重启容器',
  'container.create': '创建容器',
  'container.delete': '删除容器',
  'compose.deploy': '部署 Compose',
  'compose.up': '启动 Compose',
  'compose.restart': '重启 Compose',
  'compose.down': '下线 Compose',
  'file.write': '编辑文件',
  'file.mkdir': '新建目录',
  'file.upload': '上传文件',
  'file.delete': '删除文件',
  'terminal.open': '打开终端',
}

export function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(100)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await api.audit.recent(limit))
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    let success = 0
    let error = 0
    for (const e of entries) {
      if (e.status === 'success') success++
      else error++
    }
    return { all: entries.length, success, error }
  }, [entries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (filterTab === 'success' && e.status !== 'success') return false
      if (filterTab === 'error' && e.status === 'success') return false
      if (filterTab === 'auth' && !e.action.startsWith('auth.')) return false
      if (filterTab === 'service' && !e.action.startsWith('service.')) return false
      if (
        filterTab === 'container' &&
        !e.action.startsWith('container.') &&
        !e.action.startsWith('compose.')
      ) {
        return false
      }
      if (!q) return true
      const label = (actionLabels[e.action] ?? '').toLowerCase()
      return (
        e.user.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.remoteIp.toLowerCase().includes(q) ||
        label.includes(q)
      )
    })
  }, [entries, filterTab, search])

  const tabs: { id: FilterTab; label: string; count?: number; danger?: boolean }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'success', label: '成功', count: counts.success },
    { id: 'error', label: '失败', count: counts.error, danger: counts.error > 0 },
    { id: 'auth', label: '认证' },
    { id: 'service', label: '服务' },
    { id: 'container', label: '容器/Compose' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-500/8 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition',
                filterTab === t.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] tabular-nums',
                    t.danger
                      ? 'bg-rose-500/15 text-rose-500'
                      : 'bg-slate-500/12 text-slate-500 dark:text-slate-300',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索用户、目标或 IP..."
              className="glass-surface w-full rounded-xl py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
            />
          </div>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="glass-surface rounded-xl px-3 py-1.5 text-xs outline-none"
          >
            <option value={50}>最近 50 条</option>
            <option value={100}>最近 100 条</option>
            <option value={200}>最近 200 条</option>
          </select>
          <button
            onClick={() => void load()}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      <div className="glass-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-slate-500/5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">操作人 / IP</th>
                <th className="px-4 py-3 font-medium">动作</th>
                <th className="px-4 py-3 font-medium">目标对象</th>
                <th className="px-4 py-3 font-medium">结果 / 备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
              {filtered.map((e, i) => {
                const ok = e.status === 'success'
                return (
                  <tr key={i} className="text-xs hover:bg-sky-500/5">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{e.user}</div>
                      <div className="font-mono text-[11px] text-slate-400">{e.remoteIp}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{actionLabels[e.action] ?? e.action}</div>
                      <div className="font-mono text-[11px] text-slate-400">{e.action}</div>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 font-mono" title={e.target}>
                      {e.target}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            成功
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            <XCircle className="h-3 w-3" />
                            失败
                          </span>
                        )}
                      </div>
                      {e.detail && (
                        <div
                          className="mt-1 max-w-[260px] truncate text-[11px] text-rose-500"
                          title={e.detail}
                        >
                          {e.detail}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    暂无匹配的审计记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
