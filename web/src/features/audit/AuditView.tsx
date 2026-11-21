import { useParam } from '@/lib/navigation'
import { useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, Search, XCircle } from 'lucide-react'
import { api } from '@/api/client'
import type { AuditEntry } from '@/api/types'
import { cn } from '@/lib/format'

const fieldClass =
  'glass-surface h-9 w-36 rounded-xl px-3 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-sky-500'
const pageButtonClass =
  'glass-surface rounded-xl px-3 py-2 text-xs font-medium enabled:hover:bg-sky-500/10 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-45'

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
  'file.create': '新建文件',
  'file.write': '编辑文件',
  'file.mkdir': '新建目录',
  'file.upload': '上传文件',
  'file.delete': '删除文件',
  'terminal.open': '打开终端',
}

function localDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTab, setFilterTab] = useParam<FilterTab>('filter', 'all')
  const [search, setSearch] = useParam('q', '' as string, true)
  const [target, setTarget] = useParam('target', '' as string, true)
  const [{ start, end }] = useState(() => {
    const today = new Date()
    const first = new Date(today)
    first.setDate(first.getDate() - 6)
    return { start: localDate(first), end: localDate(today) }
  })
  const [from, setFrom] = useParam('from', start, true)
  const [to, setTo] = useParam('to', end, true)
  const [size, setSize] = useParam('size', '100' as string)
  const limit = [50, 100, 200].includes(Number(size)) ? Number(size) : 100
  const [offsetText, setOffset] = useParam('offset', '0' as string)
  const offset = Math.max(0, Number.parseInt(offsetText, 10) || 0)
  const [refresh, setRefresh] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError('')
    setLoading(true)
    setEntries([])
    const load = async () => {
      const params = new URLSearchParams({
        limit: String(limit + 1),
        offset: String(offset),
        filter: filterTab,
        q: search.trim(),
        target,
      })
      if (from) params.set('from', new Date(from + 'T00:00:00').toISOString())
      if (to) params.set('to', new Date(to + 'T23:59:59').toISOString())
      for (const [action, label] of Object.entries(actionLabels)) {
        if (search.trim() && label.includes(search.trim())) params.append('action', action)
      }
      const rows = await api.audit.search(params)
      if (active) {
        setEntries(rows.slice(0, limit))
        setHasNext(rows.length > limit)
      }
    }
    void load()
      .catch((err) => {
        if (active) setError(String(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [filterTab, search, target, from, to, limit, offset, refresh])
  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'success', label: '成功' },
    { id: 'error', label: '失败' },
    { id: 'auth', label: '认证' },
    { id: 'service', label: '服务' },
    { id: 'container', label: '容器/Compose' },
  ]

  return (
    <div className="space-y-4">
      <section aria-label="审计日志筛选" className="glass-surface space-y-3 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-500/8 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setFilterTab(t.id)
                  setOffset('0')
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition',
                  filterTab === t.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
            <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-[var(--text-secondary)]">
              开始日期
              <input
                className={fieldClass}
                type="date"
                max={to}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setOffset('0')
                }}
              />
            </label>
            <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-[var(--text-secondary)]">
              结束日期
              <input
                className={fieldClass}
                type="date"
                min={from}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setOffset('0')
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-36 flex-1 sm:w-52">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setOffset('0')
                }}
                aria-label="搜索审计记录"
                placeholder="搜索用户、目标或 IP..."
                className="glass-surface w-full rounded-xl py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
              />
            </div>
            <select
              aria-label="每页条数"
              value={limit}
              onChange={(e) => {
                setSize(e.target.value)
                setOffset('0')
              }}
              className="glass-surface rounded-xl px-3 py-1.5 text-xs outline-none"
            >
              <option value={50}>每页 50 条</option>
              <option value={100}>每页 100 条</option>
              <option value={200}>每页 200 条</option>
            </select>
            <button
              onClick={() => setRefresh((n) => n + 1)}
              className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              刷新
            </button>
          </div>
        </div>

        {target && (
          <button
            className={pageButtonClass}
            onClick={() => {
              setTarget('')
              setOffset('0')
            }}
            aria-label={`清除对象筛选：${target}`}
          >
            {target} ×
          </button>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm"
        >
          审计加载失败 · {error}{' '}
          <button className={pageButtonClass} onClick={() => setRefresh((n) => n + 1)}>
            重试
          </button>
        </p>
      )}
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
              {entries.map((e, i) => {
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
              {entries.length === 0 && !loading && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    {search || target || from || to || filterTab !== 'all' || offset
                      ? '当前范围无匹配记录'
                      : '尚无审计记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav
          aria-label="审计日志分页"
          className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-4 py-3"
        >
          <button
            className={pageButtonClass}
            disabled={!offset || loading}
            onClick={() => setOffset(String(Math.max(0, offset - limit)))}
          >
            上一页
          </button>
          <span className="text-xs tabular-nums text-[var(--text-secondary)]">
            第 {Math.floor(offset / limit) + 1} 页
          </span>
          <button
            className={pageButtonClass}
            disabled={!hasNext || loading || !!error}
            onClick={() => setOffset(String(offset + limit))}
          >
            下一页
          </button>
        </nav>
      </div>
    </div>
  )
}
