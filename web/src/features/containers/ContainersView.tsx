import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Layers, Play, RefreshCw, RotateCw, Search, Square } from 'lucide-react'
import { api } from '@/api/client'
import type { ContainerAction, ContainerDetail, ContainerSummary } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailDrawer } from '@/components/common/DetailDrawer'
import { LiveLogViewer } from '@/components/common/LiveLogViewer'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatBytes } from '@/lib/format'

const colHelper = createColumnHelper<ContainerSummary>()

export function ContainersView() {
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ContainerDetail | null>(null)
  const [confirmState, setConfirmState] = useState<{
    container: ContainerSummary
    action: ContainerAction
  } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadContainers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.containers.list(true)
      setContainers(data)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '加载容器列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadContainers()
  }, [loadContainers])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    api.containers.inspect(selectedId).then(setDetail).catch(console.error)
  }, [selectedId])

  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const c of containers) {
      if (c.composeProject) set.add(c.composeProject)
    }
    return Array.from(set).sort()
  }, [containers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return containers.filter((c) => {
      if (projectFilter === '__standalone__' && c.composeProject) return false
      if (projectFilter && projectFilter !== '__standalone__' && c.composeProject !== projectFilter) {
        return false
      }
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        (c.composeProject ?? '').toLowerCase().includes(q)
      )
    })
  }, [containers, search, projectFilter])

  const executeAction = async (
    ctr: ContainerSummary,
    action: ContainerAction,
    confirm = false,
  ) => {
    setActionBusy(true)
    try {
      await api.containers.control(ctr.id, action, confirm)
      setToast(`已对容器 ${ctr.name} 执行 ${action}`)
      await loadContainers()
      if (selectedId === ctr.id) {
        const updated = await api.containers.inspect(ctr.id)
        setDetail(updated)
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActionBusy(false)
      setConfirmState(null)
    }
  }

  const triggerAction = (ctr: ContainerSummary, action: ContainerAction) => {
    if (action === 'stop') {
      setConfirmState({ container: ctr, action })
      return
    }
    void executeAction(ctr, action, false)
  }

  const columns = useMemo(
    () => [
      colHelper.accessor('name', {
        header: '容器名称',
        cell: (info) => {
          const c = info.row.original
          return (
            <div>
              <div className="font-semibold">{c.name}</div>
              <div className="font-mono text-[11px] text-slate-400">{c.shortId}</div>
            </div>
          )
        },
      }),
      colHelper.accessor('composeProject', {
        header: 'Compose 项目',
        cell: (info) => {
          const proj = info.getValue()
          return proj ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
              <Layers className="h-3 w-3" />
              {proj}
            </span>
          ) : (
            <span className="text-xs text-slate-400">独立容器</span>
          )
        },
      }),
      colHelper.accessor('image', {
        header: '镜像',
        cell: (info) => (
          <span className="line-clamp-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {info.getValue()}
          </span>
        ),
      }),
      colHelper.accessor('state', {
        header: '状态',
        cell: (info) => (
          <div>
            <StatusBadge state={info.getValue()} />
            <div className="mt-1 text-[11px] text-slate-400">{info.row.original.status}</div>
          </div>
        ),
      }),
      colHelper.accessor('memoryBytes', {
        header: '资源占用',
        cell: (info) => {
          const c = info.row.original
          return c.state === 'running' ? (
            <div className="tabular-nums text-xs">
              <div>CPU {c.cpuPercent.toFixed(1)}%</div>
              <div className="text-slate-400">{formatBytes(c.memoryBytes)}</div>
            </div>
          ) : (
            <span className="text-xs text-slate-400">--</span>
          )
        },
      }),
      colHelper.display({
        id: 'actions',
        header: () => <span className="block text-right">操作</span>,
        cell: (info) => {
          const c = info.row.original
          const running = c.state === 'running'
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {!running ? (
                <button
                  onClick={() => triggerAction(c, 'start')}
                  title="启动"
                  className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-500/10"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => triggerAction(c, 'stop')}
                  title="停止"
                  className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => triggerAction(c, 'restart')}
                title="重启"
                className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-500/10"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索容器名、镜像或项目..."
              className="glass-surface w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="glass-surface rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                Compose: {p}
              </option>
            ))}
            <option value="__standalone__">仅独立容器</option>
          </select>
        </div>

        <button
          onClick={() => void loadContainers()}
          className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium hover:bg-white dark:hover:bg-white/10"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {toast && (
        <div className="flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs text-sky-700 dark:text-sky-300">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            关闭
          </button>
        </div>
      )}

      <div className="glass-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-slate-500/5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.original.id)}
                  className="cursor-pointer transition hover:bg-sky-500/5"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    暂无匹配的 Docker 容器
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DetailDrawer
        open={selectedId !== null}
        title={detail?.name ?? ''}
        subtitle={detail?.image}
        onClose={() => setSelectedId(null)}
      >
        {detail && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge state={detail.state} />
              {detail.composeProject && (
                <span className="rounded-lg bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                  Compose: {detail.composeProject}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {detail.state !== 'running' ? (
                  <button
                    onClick={() => triggerAction(detail, 'start')}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    启动
                  </button>
                ) : (
                  <button
                    onClick={() => triggerAction(detail, 'stop')}
                    className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
                  >
                    停止
                  </button>
                )}
                <button
                  onClick={() => triggerAction(detail, 'restart')}
                  className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                >
                  重启
                </button>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 p-4 text-xs dark:border-white/10">
              <div>
                <dt className="text-slate-400">重启策略</dt>
                <dd className="mt-1 font-mono font-medium">{detail.restartPolicy || 'no'}</dd>
              </div>
              <div>
                <dt className="text-slate-400">网络</dt>
                <dd className="mt-1 font-mono font-medium">{detail.networks.join(', ') || '--'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-400">挂载卷</dt>
                <dd className="mt-1 space-y-1 font-mono">
                  {detail.mounts.length === 0
                    ? '--'
                    : detail.mounts.map((m, i) => (
                        <div key={i} className="truncate">
                          {m.source} → {m.destination} ({m.rw ? 'rw' : 'ro'})
                        </div>
                      ))}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                容器实时日志
              </h3>
              <LiveLogViewer type="container" target={detail.id} />
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmState !== null}
        title={`确认停止容器 ${confirmState?.container.name}？`}
        description="停止容器将中断其正在提供的服务，操作会记录到审计日志。"
        loading={actionBusy}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState) {
            void executeAction(confirmState.container, confirmState.action, true)
          }
        }}
      />
    </div>
  )
}
