import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Copy,
  FileText,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ShieldAlert,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react'
import { api } from '@/api/client'
import type { ServiceAction, ServiceDetail, ServiceUnit } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailDrawer } from '@/components/common/DetailDrawer'
import { LiveLogViewer } from '@/components/common/LiveLogViewer'
import { StatusBadge } from '@/components/common/StatusBadge'
import { CreateServiceModal } from '@/features/services/CreateServiceModal'
import { cn, formatBytes } from '@/lib/format'

type FilterTab = 'all' | 'active' | 'failed' | 'inactive' | 'enabled'
type DrawerTab = 'logs' | 'unit'

const colHelper = createColumnHelper<ServiceUnit>()

const subStateLabels: Record<string, string> = {
  running: '运行',
  exited: '已完成',
  dead: '已停止',
  failed: '失败',
  waiting: '等待中',
  start: '启动中',
}

export function ServicesView() {
  const [units, setUnits] = useState<ServiceUnit[]>([])
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('logs')
  const [detail, setDetail] = useState<ServiceDetail | null>(null)
  const [confirmState, setConfirmState] = useState<{
    unit: ServiceUnit
    action: ServiceAction | 'delete'
  } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadUnits = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.services.list()
      setUnits(data)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '加载服务列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUnits()
  }, [loadUnits])

  useEffect(() => {
    if (!selectedName) {
      setDetail(null)
      return
    }
    api.services.get(selectedName).then(setDetail).catch(console.error)
  }, [selectedName])

  const counts = useMemo(() => {
    let active = 0
    let failed = 0
    let inactive = 0
    let enabled = 0
    for (const u of units) {
      if (u.activeState === 'active') active++
      else if (u.activeState === 'failed') failed++
      else inactive++
      if (u.unitFileState === 'enabled') enabled++
    }
    return { all: units.length, active, failed, inactive, enabled }
  }, [units])

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase()
    return units.filter((u) => {
      if (filterTab === 'active' && u.activeState !== 'active') return false
      if (filterTab === 'failed' && u.activeState !== 'failed') return false
      if (filterTab === 'inactive' && (u.activeState === 'active' || u.activeState === 'failed')) {
        return false
      }
      if (filterTab === 'enabled' && u.unitFileState !== 'enabled') return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        (u.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [units, filterTab, search])

  const executeAction = async (
    unit: ServiceUnit,
    action: ServiceAction | 'delete',
    confirm = false,
  ) => {
    setActionBusy(true)
    try {
      if (action === 'delete') {
        await api.services.delete(unit.name, confirm)
        setToast(`已删除服务 ${unit.name}`)
        if (selectedName === unit.name) {
          setSelectedName(null)
        }
        await loadUnits()
      } else {
        await api.services.control(unit.name, action, confirm)
        setToast(`已对 ${unit.name} 执行 ${action}`)
        await loadUnits()
        if (selectedName === unit.name) {
          const updated = await api.services.get(unit.name)
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

  const triggerAction = useCallback((unit: ServiceUnit, action: ServiceAction) => {
    if (action === 'stop' || action === 'disable' || (unit.isCritical && action === 'restart')) {
      setConfirmState({ unit, action })
      return
    }
    void executeAction(unit, action, false)
  }, [])

  const handleDaemonReload = async () => {
    setReloading(true)
    try {
      await api.services.daemonReload()
      setToast('已执行 systemd daemon-reload')
      await loadUnits()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'daemon-reload 失败')
    } finally {
      setReloading(false)
    }
  }

  const openDrawer = (name: string, targetTab: DrawerTab) => {
    setDrawerTab(targetTab)
    setSelectedName(name)
  }

  const columns = useMemo(
    () => [
      colHelper.accessor('name', {
        header: '服务名称',
        cell: (info) => {
          const row = info.row.original
          const showDesc =
            row.description &&
            row.description.trim() !== '' &&
            row.description.trim() !== row.name
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold">{row.name}</span>
                {row.isCritical && (
                  <span title="系统关键服务" className="text-amber-500">
                    <ShieldAlert className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              {showDesc && (
                <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                  {row.description}
                </div>
              )}
            </div>
          )
        },
      }),
      colHelper.accessor('activeState', {
        header: '状态',
        cell: (info) => {
          const u = info.row.original
          const subLabel = u.subState ? (subStateLabels[u.subState] ?? u.subState) : ''
          return (
            <div className="flex items-center gap-1.5">
              <StatusBadge state={u.activeState} />
              {subLabel && u.subState !== 'running' && u.subState !== 'dead' && u.subState !== 'failed' && (
                <span className="text-[11px] text-slate-400">({subLabel})</span>
              )}
            </div>
          )
        },
      }),
      colHelper.accessor('mainPID', {
        header: 'PID',
        cell: (info) => (
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {info.getValue() > 0 ? info.getValue() : '--'}
          </span>
        ),
      }),
      colHelper.accessor('memoryBytes', {
        header: '内存',
        cell: (info) => (
          <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
            {info.getValue() > 0 ? formatBytes(info.getValue()) : '--'}
          </span>
        ),
      }),
      colHelper.accessor('unitFileState', {
        header: '开机自启',
        cell: (info) => {
          const u = info.row.original
          const isEnabled = u.unitFileState === 'enabled'
          const canToggle = isEnabled || u.unitFileState === 'disabled'
          return (
            <div onClick={(e) => e.stopPropagation()}>
              {canToggle ? (
                <button
                  onClick={() => triggerAction(u, isEnabled ? 'disable' : 'enable')}
                  title={isEnabled ? '点击禁用自启' : '点击开启自启'}
                  className={cn(
                    'inline-flex h-5 w-9 items-center rounded-full p-0.5 transition',
                    isEnabled ? 'bg-sky-500' : 'bg-slate-300 dark:bg-white/15',
                  )}
                >
                  <span
                    className={cn(
                      'h-4 w-4 rounded-full bg-white shadow-xs transition-transform',
                      isEnabled && 'translate-x-4',
                    )}
                  />
                </button>
              ) : (
                <StatusBadge state={u.unitFileState} />
              )}
            </div>
          )
        },
      }),
      colHelper.display({
        id: 'actions',
        header: () => <span className="block text-right">操作</span>,
        cell: (info) => {
          const u = info.row.original
          const isRunning = u.activeState === 'active'
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {!isRunning ? (
                <button
                  onClick={() => triggerAction(u, 'start')}
                  title="启动"
                  className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-500/10"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => triggerAction(u, 'stop')}
                  title="停止"
                  className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => triggerAction(u, 'restart')}
                title="重启"
                className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-500/10"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => openDrawer(u.name, 'logs')}
                title="实时日志"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-300"
              >
                <Terminal className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => openDrawer(u.name, 'unit')}
                title="Unit 配置"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-300"
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setConfirmState({ unit: u, action: 'delete' })}
                disabled={u.isCritical}
                title={u.isCritical ? '系统关键服务不可删除' : '删除服务'}
                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-30"
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
    data: filteredUnits,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const filterTabs: { id: FilterTab; label: string; count: number; danger?: boolean }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'active', label: '运行中', count: counts.active },
    { id: 'failed', label: '异常', count: counts.failed, danger: counts.failed > 0 },
    { id: 'inactive', label: '已停止', count: counts.inactive },
    { id: 'enabled', label: '开机自启', count: counts.enabled },
  ]

  return (
    <div className="space-y-4">
      {/* Status Summary Tabs + Actions */}
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
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索服务..."
              className="glass-surface w-full rounded-xl py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            新建服务
          </button>
          <button
            onClick={() => void handleDaemonReload()}
            disabled={reloading}
            title="执行 systemctl daemon-reload"
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <RotateCcw className={cn('h-3.5 w-3.5', reloading && 'animate-spin')} />
            重载配置
          </button>
          <button
            onClick={() => void loadUnits()}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
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
                  onClick={() => openDrawer(row.original.name, 'logs')}
                  className="cursor-pointer transition hover:bg-sky-500/5"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {filteredUnits.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    未找到匹配的 systemd 服务
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DetailDrawer
        open={selectedName !== null}
        title={selectedName ?? ''}
        subtitle={detail?.description || detail?.fragmentPath}
        onClose={() => setSelectedName(null)}
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge state={detail.activeState} />
              <StatusBadge state={detail.unitFileState} />
              <div className="ml-auto flex flex-wrap gap-2">
                {detail.activeState !== 'active' ? (
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
                <button
                  onClick={() =>
                    triggerAction(
                      detail,
                      detail.unitFileState === 'enabled' ? 'disable' : 'enable',
                    )
                  }
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/10"
                >
                  {detail.unitFileState === 'enabled' ? '禁用自启' : '开启自启'}
                </button>
              </div>
            </div>

            <div className="flex gap-1 rounded-xl bg-slate-500/8 p-1">
              <button
                onClick={() => setDrawerTab('logs')}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition',
                  drawerTab === 'logs'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                )}
              >
                <Terminal className="h-3.5 w-3.5" />
                实时日志 (Journald)
              </button>
              <button
                onClick={() => setDrawerTab('unit')}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition',
                  drawerTab === 'unit'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Unit 配置与详情
              </button>
            </div>

            {drawerTab === 'logs' ? (
              <LiveLogViewer type="service" target={detail.name} />
            ) : (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 p-4 text-xs dark:border-white/10">
                  <div>
                    <dt className="text-slate-400">Main PID</dt>
                    <dd className="mt-1 font-mono font-medium">{detail.mainPID || '--'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">内存占用</dt>
                    <dd className="mt-1 tabular-nums font-medium">
                      {detail.memoryBytes ? formatBytes(detail.memoryBytes) : '--'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Load / Sub 状态</dt>
                    <dd className="mt-1 font-mono font-medium">
                      {detail.loadState} / {detail.subState}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">启动时间</dt>
                    <dd className="mt-1 tabular-nums font-medium">
                      {detail.activeEnterAt
                        ? new Date(detail.activeEnterAt).toLocaleString()
                        : '--'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Unit 文件路径</dt>
                    <dd className="mt-1 truncate font-mono">{detail.fragmentPath || '--'}</dd>
                  </div>
                  {detail.execStart && (
                    <div className="col-span-2">
                      <dt className="text-slate-400">ExecStart</dt>
                      <dd className="mt-1 break-all font-mono">{detail.execStart}</dd>
                    </div>
                  )}
                </dl>

                {detail.unitContent && (
                  <div className="overflow-hidden rounded-xl border border-slate-200/70 dark:border-white/10">
                    <div className="flex items-center justify-between border-b border-slate-200/70 bg-slate-500/5 px-3.5 py-2 text-xs dark:border-white/10">
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {detail.fragmentPath}
                      </span>
                      <button
                        onClick={() => {
                          void navigator.clipboard?.writeText(detail.unitContent ?? '')
                          setToast('已复制 Unit 文件内容')
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-slate-500 hover:bg-slate-500/10"
                      >
                        <Copy className="h-3 w-3" />
                        复制
                      </button>
                    </div>
                    <pre className="max-h-72 overflow-auto bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200">
                      {detail.unitContent}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DetailDrawer>

      <CreateServiceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => {
          setToast(`已创建服务 ${name}`)
          void loadUnits()
        }}
      />

      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.action === 'delete'
            ? `确认删除服务 ${confirmState?.unit.name}？`
            : `确认对 ${confirmState?.unit.name} 执行 ${confirmState?.action}？`
        }
        description={
          confirmState?.action === 'delete'
            ? '将停止并禁用该服务，并从 /etc/systemd/system 移除对应的 Unit 文件（系统内置服务受保护无法删除）。'
            : confirmState?.unit.isCritical
              ? '该服务属于系统关键组件，停止、禁用或重启可能影响远程连接或控制面板可用性。'
              : '该操作将立即改变服务运行或自启状态，并记入审计日志。'
        }
        loading={actionBusy}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState) {
            void executeAction(confirmState.unit, confirmState.action, true)
          }
        }}
      />
    </div>
  )
}
