import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Cpu, HardDrive, MemoryStick, Network, RefreshCw, X } from 'lucide-react'
import { api } from '@/api/client'
import type { MetricsSnapshot, ProcessInfo } from '@/api/types'
import { StatusBadge } from '@/components/common/StatusBadge'
import { cn, formatBytes, formatRate } from '@/lib/format'

export type InspectorTab = 'cpu' | 'mem' | 'disk' | 'net'

interface ResourceInspectorDrawerProps {
  tab: InspectorTab | null
  snap: MetricsSnapshot | null
  onChangeTab: (tab: InspectorTab) => void
  onClose: () => void
}

const tabs: { id: InspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }[] =
  [
    { id: 'cpu', label: 'CPU Top', icon: Cpu },
    { id: 'mem', label: '内存 Top', icon: MemoryStick },
    { id: 'disk', label: '磁盘明细', icon: HardDrive },
    { id: 'net', label: '网络接口', icon: Network },
  ]

export function ResourceInspectorDrawer({
  tab,
  snap,
  onChangeTab,
  onClose,
}: ResourceInspectorDrawerProps) {
  const [limit, setLimit] = useState<10 | 20 | 50>(10)
  const [procs, setProcs] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(false)

  const isProcTab = tab === 'cpu' || tab === 'mem'

  const loadProcs = useCallback(async () => {
    if (!tab || (tab !== 'cpu' && tab !== 'mem')) return
    setLoading(true)
    try {
      const data = await api.system.processes(tab, limit)
      setProcs(data)
    } finally {
      setLoading(false)
    }
  }, [tab, limit])

  useEffect(() => {
    if (!isProcTab) return
    void loadProcs()
    const timer = setInterval(() => void loadProcs(), 3000)
    return () => clearInterval(timer)
  }, [isProcTab, loadProcs])

  useEffect(() => {
    if (!tab) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, onClose])

  if (!tab) return null

  const titleMap: Record<InspectorTab, string> = {
    cpu: '处理器进程排行',
    mem: '内存占用进程排行',
    disk: '磁盘挂载点与 I/O 明细',
    net: '网络接口实时状态',
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="glass-surface flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{titleMap[tab]}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isProcTab ? '每 3 秒自动刷新' : '实时遥测数据'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
        {/* Tab Bar + Top N selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-500/8 p-1">
            {tabs.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => onChangeTab(t.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                    active
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {isProcTab && (
            <div className="flex items-center gap-1.5">
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) as 10 | 20 | 50)}
                className="rounded-lg border border-slate-200 bg-transparent px-2.5 py-1 text-xs outline-none dark:border-white/10"
              >
                <option value={10}>Top 10</option>
                <option value={20}>Top 20</option>
                <option value={50}>Top 50</option>
              </select>
              <button
                onClick={() => void loadProcs()}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-500/10 dark:border-white/10"
                title="立即刷新"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
            </div>
          )}
        </div>

        {/* Process Top N Table */}
        {isProcTab && (
          <div className="overflow-hidden rounded-xl border border-slate-200/70 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/70 bg-slate-500/5 text-slate-500 dark:border-white/10 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">PID</th>
                  <th className="px-3 py-2.5 font-medium">进程</th>
                  <th className="px-3 py-2.5 font-medium">用户</th>
                  <th className="px-3 py-2.5 text-right font-medium">CPU %</th>
                  <th className="px-3 py-2.5 text-right font-medium">内存</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                {procs.map((p) => (
                  <tr key={p.pid} className="hover:bg-sky-500/5">
                    <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400">{p.pid}</td>
                    <td className="max-w-[210px] px-3 py-2.5">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="truncate font-mono text-[11px] text-slate-400" title={p.command}>
                        {p.command}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{p.user}</td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-semibold tabular-nums',
                        tab === 'cpu' && 'text-sky-600 dark:text-sky-400',
                      )}
                    >
                      {p.cpuPercent.toFixed(1)}%
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        tab === 'mem'
                          ? 'font-semibold text-violet-600 dark:text-violet-400'
                          : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      <div>{formatBytes(p.memBytes)}</div>
                      <div className="text-[10px] opacity-75">{p.memPercent.toFixed(1)}%</div>
                    </td>
                  </tr>
                ))}
                {procs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      正在采集进程信息...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Disk Details */}
        {tab === 'disk' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200/70 p-3.5 dark:border-white/10">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <ArrowDown className="h-3.5 w-3.5 text-emerald-500" />
                  <span>总读取速率</span>
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {snap ? formatRate(snap.diskIO?.readBytesPerSec ?? 0) : '--'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                  {snap ? `${Math.round(snap.diskIO?.readIops ?? 0)} IOPS` : '--'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/70 p-3.5 dark:border-white/10">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <ArrowUp className="h-3.5 w-3.5 text-amber-500" />
                  <span>总写入速率</span>
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {snap ? formatRate(snap.diskIO?.writeBytesPerSec ?? 0) : '--'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                  {snap ? `${Math.round(snap.diskIO?.writeIops ?? 0)} IOPS` : '--'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {(snap?.disks ?? []).map((d) => (
                <div
                  key={d.mountPoint}
                  className="rounded-xl border border-slate-200/70 p-3.5 text-xs dark:border-white/10"
                >
                  <div className="flex items-center justify-between font-medium">
                    <span>
                      {d.mountPoint}{' '}
                      <span className="font-mono text-slate-400">
                        ({d.device} · {d.fsType})
                      </span>
                    </span>
                    <span className="tabular-nums">{d.usedPercent.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        d.usedPercent >= 85 ? 'bg-amber-500' : 'bg-emerald-500',
                      )}
                      style={{ width: `${Math.min(100, d.usedPercent)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                    已用 {formatBytes(d.usedBytes)} / 总计 {formatBytes(d.totalBytes)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Network Interfaces */}
        {tab === 'net' && (
          <div className="space-y-3">
            {(snap?.networks ?? []).map((n) => (
              <div
                key={n.interface}
                className="rounded-xl border border-slate-200/70 p-4 text-xs dark:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{n.interface}</span>
                  <StatusBadge state={n.isUp ? 'active' : 'inactive'} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 tabular-nums">
                  <div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <ArrowDown className="h-3 w-3 text-sky-500" />
                      <span>实时下行</span>
                    </div>
                    <div className="mt-0.5 text-sm font-semibold">{formatRate(n.rxBytesPerSec)}</div>
                    <div className="text-[11px] text-slate-400">
                      累计 {formatBytes(n.rxTotalBytes)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <ArrowUp className="h-3 w-3 text-orange-500" />
                      <span>实时上行</span>
                    </div>
                    <div className="mt-0.5 text-sm font-semibold">{formatRate(n.txBytesPerSec)}</div>
                    <div className="text-[11px] text-slate-400">
                      累计 {formatBytes(n.txTotalBytes)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  )
}
