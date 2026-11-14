import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  FileText,
  Layers,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react'
import { api } from '@/api/client'
import type { ContainerAction, ContainerDetail, ContainerSummary } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailDrawer } from '@/components/common/DetailDrawer'
import { LiveLogViewer } from '@/components/common/LiveLogViewer'
import { StatusBadge } from '@/components/common/StatusBadge'
import {
  ComposeDeployModal,
  CreateContainerModal,
} from '@/features/containers/ContainerCreateModals'
import { cn, formatBytes } from '@/lib/format'

type FilterTab = 'all' | 'running' | 'error' | 'stopped'
type ModalTab = 'logs' | 'inspect'

const colHelper = createColumnHelper<ContainerSummary>()

function isContainerError(c: ContainerSummary): boolean {
  if (c.state === 'restarting' || c.state === 'dead') return true
  return c.status.includes('Exited (') && !c.status.startsWith('Exited (0)')
}

export function ContainersView() {
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [projectFilter, setProjectFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalTab, setModalTab] = useState<ModalTab>('logs')
  const [detail, setDetail] = useState<ContainerDetail | null>(null)
  const [confirmState, setConfirmState] = useState<{
    container: ContainerSummary
    action: ContainerAction | 'delete'
  } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeDownTarget, setComposeDownTarget] = useState<string | null>(null)

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

  const counts = useMemo(() => {
    let running = 0
    let error = 0
    let stopped = 0
    for (const c of containers) {
      if (c.state === 'running') running++
      else if (isContainerError(c)) error++
      else stopped++
    }
    return { all: containers.length, running, error, stopped }
  }, [containers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return containers.filter((c) => {
      if (filterTab === 'running' && c.state !== 'running') return false
      if (filterTab === 'error' && !isContainerError(c)) return false
      if (filterTab === 'stopped' && (c.state === 'running' || isContainerError(c))) return false

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
  }, [containers, filterTab, search, projectFilter])

  const executeAction = async (
    ctr: ContainerSummary,
    action: ContainerAction | 'delete',
    confirm = false,
  ) => {
    setActionBusy(true)
    try {
      if (action === 'delete') {
        await api.containers.delete(ctr.id, confirm)
        setToast(`已删除容器 ${ctr.name}`)
        if (selectedId === ctr.id) {
          setSelectedId(null)
        }
        await loadContainers()
      } else {
        await api.containers.control(ctr.id, action, confirm)
        setToast(`已对容器 ${ctr.name} 执行 ${action}`)
        await loadContainers()
        if (selectedId === ctr.id) {
          const updated = await api.containers.inspect(ctr.id)
          setDetail(updated)
        }
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActionBusy(false)
      setConfirmState(null)
    }
  }

  const triggerAction = useCallback((ctr: ContainerSummary, action: ContainerAction) => {
    if (action === 'stop') {
      setConfirmState({ container: ctr, action })
      return
    }
    void executeAction(ctr, action, false)
  }, [])

  const openModal = (id: string, tab: ModalTab) => {
    setModalTab(tab)
    setSelectedId(id)
  }

  const columns = useMemo(
    () => [
      colHelper.accessor('name', {
        header: '容器名称',
        cell: (info) => {
          const c = info.row.original
          return (
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.name}</span>
                {c.composeProject && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                    <Layers className="h-2.5 w-2.5" />
                    {c.composeProject}
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400">{c.shortId}</div>
            </div>
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
      colHelper.accessor('ports', {
        header: '端口映射',
        cell: (info) => {
          const ports = info.getValue() ?? []
          const published = ports.filter((p) => p.publicPort)
          if (published.length === 0) {
            return <span className="text-xs text-slate-400">--</span>
          }
          return (
            <div className="flex flex-wrap gap-1 font-mono text-[11px]">
              {published.slice(0, 2).map((p, idx) => (
                <span
                  key={idx}
                  className="rounded-md bg-slate-500/8 px-1.5 py-0.5 text-slate-600 dark:text-slate-300"
                >
                  {p.publicPort}→{p.privatePort}/{p.type}
                </span>
              ))}
              {published.length > 2 && (
                <span className="text-slate-400">+{published.length - 2}</span>
              )}
            </div>
          )
        },
      }),
      colHelper.accessor('networks', {
        header: '网络',
        cell: (info) => {
          const nets = info.getValue() ?? []
          if (nets.length === 0) {
            return <span className="text-xs text-slate-400">--</span>
          }
          return (
            <div className="flex flex-wrap gap-1 font-mono text-[11px]">
              {nets.slice(0, 2).map((n) => (
                <span
                  key={n}
                  className="rounded-md bg-sky-500/8 px-1.5 py-0.5 text-sky-700 dark:text-sky-300"
                >
                  {n}
                </span>
              ))}
              {nets.length > 2 && <span className="text-slate-400">+{nets.length - 2}</span>}
            </div>
          )
        },
      }),
      colHelper.accessor('mounts', {
        header: '存储卷',
        cell: (info) => {
          const mounts = info.getValue() ?? []
          if (mounts.length === 0) {
            return <span className="text-xs text-slate-400">--</span>
          }
          const first = mounts[0]
          return (
            <div
              className="max-w-[180px] truncate font-mono text-[11px] text-slate-500 dark:text-slate-400"
              title={mounts.map((m) => `${m.source} -> ${m.destination}`).join('\n')}
            >
              {first.source} → {first.destination}
              {mounts.length > 1 && ` (+${mounts.length - 1})`}
            </div>
          )
        },
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
              <button
                onClick={() => openModal(c.id, 'logs')}
                title="实时日志"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-300"
              >
                <Terminal className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => openModal(c.id, 'inspect')}
                title="容器详情"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-300"
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setConfirmState({ container: c, action: 'delete' })}
                title="删除容器"
                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        },
      }),
    ],
    [triggerAction],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const filterTabs: { id: FilterTab; label: string; count: number; danger?: boolean }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'running', label: '运行中', count: counts.running },
    { id: 'error', label: '异常', count: counts.error, danger: counts.error > 0 },
    { id: 'stopped', label: '已停止', count: counts.stopped },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-500/8 p-1">
          {filterTabs.map((t) => (
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
              placeholder="搜索容器或镜像..."
              className="glass-surface w-full rounded-xl py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
            />
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="glass-surface rounded-xl px-3 py-1.5 text-xs outline-none"
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                Compose: {p}
              </option>
            ))}
            <option value="__standalone__">仅独立容器</option>
          </select>
          <button
            onClick={() => void loadContainers()}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            创建容器
          </button>
          <button
            onClick={() => setComposeOpen(true)}
            className="glass-surface inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <Layers className="h-3.5 w-3.5 text-sky-500" />
            Compose 部署
          </button>
        </div>
      </div>

      {/* Compose Project Quick Bar when a Compose project is selected */}
      {projectFilter && projectFilter !== '__standalone__' && (
        <div className="glass-surface flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <Layers className="h-4 w-4 text-sky-500" />
            <span>Compose 项目：{projectFilter}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await api.containers.controlCompose(projectFilter, 'up')
                setToast(`Compose 项目 ${projectFilter} 已启动 (up -d)`)
                await loadContainers()
              }}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-500"
            >
              全部启动 (Up)
            </button>
            <button
              onClick={async () => {
                await api.containers.controlCompose(projectFilter, 'restart')
                setToast(`Compose 项目 ${projectFilter} 已重启`)
                await loadContainers()
              }}
              className="rounded-lg bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-500"
            >
              全部重启
            </button>
            <button
              onClick={() => setComposeDownTarget(projectFilter)}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 font-medium text-white hover:bg-rose-500"
            >
              <Trash2 className="h-3 w-3" />
              下线 (Down)
            </button>
          </div>
        </div>
      )}

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
                  onClick={() => openModal(row.original.id, 'logs')}
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
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
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
          <div className="space-y-5">
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

            <div className="flex gap-1 rounded-xl bg-slate-500/8 p-1">
              <button
                onClick={() => setModalTab('logs')}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition',
                  modalTab === 'logs'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                )}
              >
                <Terminal className="h-3.5 w-3.5" />
                容器实时日志
              </button>
              <button
                onClick={() => setModalTab('inspect')}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition',
                  modalTab === 'inspect'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                容器详情与配置
              </button>
            </div>

            {modalTab === 'logs' ? (
              <LiveLogViewer type="container" target={detail.id} />
            ) : (
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 p-4 text-xs dark:border-white/10">
                <div>
                  <dt className="text-slate-400">重启策略</dt>
                  <dd className="mt-1 font-mono font-medium">{detail.restartPolicy || 'no'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">网络</dt>
                  <dd className="mt-1 font-mono font-medium">
                    {detail.networks.join(', ') || '--'}
                  </dd>
                </div>
                {detail.command && (
                  <div className="col-span-2">
                    <dt className="text-slate-400">启动命令</dt>
                    <dd className="mt-1 break-all font-mono">{detail.command}</dd>
                  </div>
                )}
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
                {detail.envKeys.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-slate-400">环境变量键</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1">
                      {detail.envKeys.map((k) => (
                        <span
                          key={k}
                          className="rounded-md bg-slate-500/8 px-1.5 py-0.5 font-mono text-[11px]"
                        >
                          {k}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.action === 'delete'
            ? `确认删除容器 ${confirmState?.container.name}？`
            : `确认停止容器 ${confirmState?.container.name}？`
        }
        description={
          confirmState?.action === 'delete'
            ? '将强制移除该容器（挂载卷数据会保留），操作会记录到审计日志。'
            : '停止容器将中断其正在提供的服务，操作会记录到审计日志。'
        }
        loading={actionBusy}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState) {
            void executeAction(confirmState.container, confirmState.action, true)
          }
        }}
      />

      <ConfirmDialog
        open={composeDownTarget !== null}
        title={`确认下线 Compose 项目 ${composeDownTarget}？`}
        description="将执行 docker compose down 停止并移除该项目下的所有容器与默认网络。"
        loading={actionBusy}
        onCancel={() => setComposeDownTarget(null)}
        onConfirm={async () => {
          if (!composeDownTarget) return
          setActionBusy(true)
          try {
            await api.containers.controlCompose(composeDownTarget, 'down', true)
            setToast(`Compose 项目 ${composeDownTarget} 已下线`)
            setProjectFilter('')
            await loadContainers()
          } catch (err) {
            setToast(err instanceof Error ? err.message : '下线失败')
          } finally {
            setActionBusy(false)
            setComposeDownTarget(null)
          }
        }}
      />

      <CreateContainerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(msg) => {
          setToast(msg)
          void loadContainers()
        }}
      />

      <ComposeDeployModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onDeployed={(msg) => {
          setToast(msg)
          void loadContainers()
        }}
      />
    </div>
  )
}
