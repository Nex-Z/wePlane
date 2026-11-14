import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Play, RefreshCw, RotateCw, Search, ShieldAlert, Square } from 'lucide-react'
import { api } from '@/api/client'
import type { ServiceAction, ServiceDetail, ServiceUnit } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailDrawer } from '@/components/common/DetailDrawer'
import { LiveLogViewer } from '@/components/common/LiveLogViewer'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatBytes } from '@/lib/format'

const colHelper = createColumnHelper<ServiceUnit>()

export function ServicesView() {
  const [units, setUnits] = useState<ServiceUnit[]>([])
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<ServiceDetail | null>(null)
  const [confirmState, setConfirmState] = useState<{
    unit: ServiceUnit
    action: ServiceAction
  } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadUnits = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.services.list(search, stateFilter)
      setUnits(data)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '加载服务列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, stateFilter])

  useEffect(() => {
    const t = setTimeout(() => void loadUnits(), 150)
    return () => clearTimeout(t)
  }, [loadUnits])

  useEffect(() => {
    if (!selectedName) {
      setDetail(null)
      return
    }
    api.services.get(selectedName).then(setDetail).catch(console.error)
  }, [selectedName])

  const executeAction = async (unit: ServiceUnit, action: ServiceAction, confirm = false) => {
    setActionBusy(true)
    try {
      await api.services.control(unit.name, action, confirm)
      setToast(`已对 ${unit.name} 执行 ${action}`)
      await loadUnits()
      if (selectedName === unit.name) {
        const updated = await api.services.get(unit.name)
        setDetail(updated)
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActionBusy(false)
      setConfirmState(null)
    }
  }

  const triggerAction = (unit: ServiceUnit, action: ServiceAction) => {
    if (action === 'stop' || action === 'disable' || (unit.isCritical && action === 'restart')) {
      setConfirmState({ unit, action })
      return
    }
    void executeAction(unit, action, false)
  }

  const columns = useMemo(
    () => [
      colHelper.accessor('name', {
        header: '服务名称',
        cell: (info) => {
          const row = info.row.original
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold">{row.name}</span>
              {row.isCritical && (
                <span title="系统关键服务" className="text-amber-500">
                  <ShieldAlert className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          )
        },
      }),
      colHelper.accessor('description', {
        header: '描述',
        cell: (info) => (
          <span className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
            {info.getValue()}
          </span>
        ),
      }),
      colHelper.accessor('activeState', {
        header: '运行状态',
        cell: (info) => <StatusBadge state={info.getValue()} />,
      }),
      colHelper.accessor('unitFileState', {
        header: '开机自启',
        cell: (info) => <StatusBadge state={info.getValue()} />,
      }),
      colHelper.accessor('memoryBytes', {
        header: '内存',
        cell: (info) => (
          <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
            {info.getValue() > 0 ? formatBytes(info.getValue()) : '--'}
          </span>
        ),
      }),
      colHelper.display({
        id: 'actions',
        header: () => <span className="block text-right">快捷操作</span>,
        cell: (info) => {
          const u = info.row.original
          const isRunning = u.activeState === 'active'
          return (
            <div
              className="flex justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
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
            </div>
          )
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: units,
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
              placeholder="搜索服务名或描述..."
              className="glass-surface w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="glass-surface rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="failed">failed</option>
            <option value="inactive">inactive</option>
          </select>
        </div>

        <button
          onClick={() => void loadUnits()}
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
                  onClick={() => setSelectedName(row.original.name)}
                  className="cursor-pointer transition hover:bg-sky-500/5"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {units.length === 0 && !loading && (
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
        subtitle={detail?.description}
        onClose={() => setSelectedName(null)}
      >
        {detail && (
          <div className="space-y-6">
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

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Journald 实时日志
              </h3>
              <LiveLogViewer type="service" target={detail.name} />
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={confirmState !== null}
        title={`确认对 ${confirmState?.unit.name} 执行 ${confirmState?.action}？`}
        description={
          confirmState?.unit.isCritical
            ? '该服务属于系统关键组件，停止或重启可能影响远程连接或控制面板可用性。'
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
