import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Box,
  Calendar,
  Cog,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/api/client'
import type { HistoryPoint, HostInfo, MetricsSnapshot } from '@/api/types'
import {
  ResourceInspectorDrawer,
  type InspectorTab,
} from '@/features/overview/ResourceInspectorDrawer'
import { cn, formatBytes, formatRate, formatUptime } from '@/lib/format'

type RangePreset =
  | '5m'
  | '1h'
  | '6h'
  | '24h'
  | '3d'
  | '7d'
  | '15d'
  | '30d'
  | '90d'
  | '180d'
  | 'custom'

type HealthLevel = 'healthy' | 'warning' | 'critical'

interface ChartRow {
  label: string
  cpu: number
  load1: number
  memPercent: number
  swapPercent: number
  diskReadMBs: number
  diskWriteMBs: number
  netRxKBs: number
  netTxKBs: number
}

const presets: { id: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { id: '5m', label: '实时' },
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '3d', label: '3天' },
  { id: '7d', label: '7天' },
  { id: '15d', label: '15天' },
  { id: '30d', label: '30天' },
  { id: '90d', label: '3月' },
  { id: '180d', label: '6月' },
]

function getHealth(val: number, warn: number, crit: number): HealthLevel {
  if (val >= crit) return 'critical'
  if (val >= warn) return 'warning'
  return 'healthy'
}

const healthMeta: Record<HealthLevel, { bar: string; border: string; spark: string }> = {
  healthy: {
    bar: 'bg-emerald-500',
    border: 'border-t-emerald-500/70',
    spark: '#10b981',
  },
  warning: {
    bar: 'bg-amber-500',
    border: 'border-t-amber-500/80',
    spark: '#f59e0b',
  },
  critical: {
    bar: 'bg-rose-500',
    border: 'border-t-rose-500/90',
    spark: '#f43f5e',
  },
}

function formatChartLabel(iso: string, range: RangePreset): string {
  const d = new Date(iso)
  if (range === '5m') {
    return d.toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  if (range === '1h' || range === '6h' || range === '24h') {
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })
  }
  if (range === '3d' || range === '7d') {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function toChartRow(p: HistoryPoint, range: RangePreset): ChartRow {
  return {
    label: formatChartLabel(p.timestamp, range),
    cpu: p.cpu,
    load1: p.load1,
    memPercent: p.memPercent,
    swapPercent: p.swapPercent,
    diskReadMBs: p.diskReadMBs,
    diskWriteMBs: p.diskWriteMBs,
    netRxKBs: p.netRxKBs,
    netTxKBs: p.netTxKBs,
  }
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function OverviewView({
  onNavigate,
}: {
  onNavigate?: (tab: 'services' | 'containers') => void
}) {
  const [host, setHost] = useState<HostInfo | null>(null)
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null)
  const [range, setRange] = useState<RangePreset>('5m')
  const [fromDate, setFromDate] = useState(() => toLocalDateStr(new Date(Date.now() - 6 * 86400_000)))
  const [toDate, setToDate] = useState(() => toLocalDateStr(new Date()))
  const [chartData, setChartData] = useState<ChartRow[]>([])
  const [liveSpark, setLiveSpark] = useState<ChartRow[]>([])
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>(null)

  const loadHistory = useCallback(
    async (targetRange: RangePreset, fromISO?: string, toISO?: string) => {
      try {
        const pts = await api.system.history(
          targetRange === 'custom' ? { from: fromISO, to: toISO } : { range: targetRange },
        )
        setChartData(pts.map((p) => toChartRow(p, targetRange)))
      } catch (err) {
        console.error(err)
      }
    },
    [],
  )

  useEffect(() => {
    api.system.info().then(setHost).catch(console.error)
    void loadHistory('5m')
  }, [loadHistory])

  useEffect(() => {
    const es = new EventSource('/api/v1/events/metrics', { withCredentials: true })
    es.addEventListener('metrics', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as MetricsSnapshot
        setSnap(data)
        const primaryNet = data.networks?.[0]
        const row: ChartRow = {
          label: new Date(data.timestamp).toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          cpu: data.cpuUsagePercent,
          load1: data.load1,
          memPercent: data.memory.usedPercent,
          swapPercent: data.swap.usedPercent,
          diskReadMBs: Math.round(((data.diskIO?.readBytesPerSec ?? 0) / (1024 * 1024)) * 10) / 10,
          diskWriteMBs:
            Math.round(((data.diskIO?.writeBytesPerSec ?? 0) / (1024 * 1024)) * 10) / 10,
          netRxKBs: Math.round((primaryNet?.rxBytesPerSec ?? 0) / 1024),
          netTxKBs: Math.round((primaryNet?.txBytesPerSec ?? 0) / 1024),
        }
        setLiveSpark((prev) => [...prev.slice(-23), row])
        if (range === '5m') {
          setChartData((prev) => [...prev.slice(-89), row])
        }
      } catch {
        // Ignore parse error
      }
    })
    return () => es.close()
  }, [range])

  const handlePresetClick = (preset: Exclude<RangePreset, 'custom'>) => {
    setRange(preset)
    void loadHistory(preset)
  }

  const handleDateChange = (nextFrom: string, nextTo: string) => {
    setFromDate(nextFrom)
    setToDate(nextTo)
    if (nextFrom && nextTo) {
      setRange('custom')
      const fromISO = new Date(`${nextFrom}T00:00:00`).toISOString()
      const toISO = new Date(`${nextTo}T23:59:59`).toISOString()
      void loadHistory('custom', fromISO, toISO)
    }
  }

  const cpuVal = snap?.cpuUsagePercent ?? 0
  const cpuHealth = getHealth(cpuVal, 65, 85)

  const memVal = snap?.memory.usedPercent ?? 0
  const memHealth = getHealth(memVal, 75, 88)

  const busiestDisk = useMemo(() => {
    if (!snap?.disks || snap.disks.length === 0) return null
    return [...snap.disks].sort((a, b) => b.usedPercent - a.usedPercent)[0]
  }, [snap])
  const diskVal = busiestDisk?.usedPercent ?? 0
  const diskHealth = getHealth(diskVal, 80, 90)

  const primaryNet = snap?.networks?.[0]
  const netHealth: HealthLevel = primaryNet && !primaryNet.isUp ? 'critical' : 'healthy'
  const totalNetRx = snap?.networks?.reduce((acc, n) => acc + n.rxBytesPerSec, 0) ?? 0
  const totalNetTx = snap?.networks?.reduce((acc, n) => acc + n.txBytesPerSec, 0) ?? 0

  return (
    <div className="space-y-5">
      {/* Alerts Banner */}
      {snap?.alerts && snap.alerts.length > 0 && (
        <div className="space-y-2">
          {snap.alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm',
                alert.level === 'critical'
                  ? 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{alert.source}:</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top 4 Telemetry Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* 1. CPU */}
        <div
          onClick={() => setInspectorTab('cpu')}
          className={cn(
            'glass-surface cursor-pointer rounded-2xl border-t-2 p-4 transition hover:ring-1 hover:ring-sky-500/35',
            healthMeta[cpuHealth].border,
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Cpu className="h-4 w-4 text-sky-500" />
            <span>处理器 (CPU)</span>
          </div>
          <div className="mt-2.5 flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {snap ? `${cpuVal.toFixed(1)}%` : '--'}
            </div>
            <Sparkline data={liveSpark} dataKey="cpu" color={healthMeta[cpuHealth].spark} />
          </div>
          <ProgressBar percent={cpuVal} barClass={healthMeta[cpuHealth].bar} />
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              {snap ? `Load ${snap.load1.toFixed(2)} / ${snap.load5.toFixed(2)}` : '采集中...'}
            </span>
            <span>{host ? `${host.cpuCores} 核` : '--'}</span>
          </div>
        </div>

        {/* 2. Memory */}
        <div
          onClick={() => setInspectorTab('mem')}
          className={cn(
            'glass-surface cursor-pointer rounded-2xl border-t-2 p-4 transition hover:ring-1 hover:ring-violet-500/35',
            healthMeta[memHealth].border,
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <MemoryStick className="h-4 w-4 text-violet-500" />
            <span>内存占用</span>
          </div>
          <div className="mt-2.5 flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {snap ? `${memVal.toFixed(1)}%` : '--'}
            </div>
            <Sparkline
              data={liveSpark}
              dataKey="memPercent"
              color={healthMeta[memHealth].spark}
            />
          </div>
          <ProgressBar percent={memVal} barClass={healthMeta[memHealth].bar} />
          <div className="mt-2.5 flex items-center justify-between text-[11px] tabular-nums">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {snap
                ? `${formatBytes(snap.memory.usedBytes)} / ${formatBytes(snap.memory.totalBytes)}`
                : '采集中...'}
            </span>
            <span className="text-slate-400">
              {snap ? `可用 ${formatBytes(snap.memory.availableBytes)}` : '--'}
            </span>
          </div>
        </div>

        {/* 3. Disk I/O */}
        <div
          onClick={() => setInspectorTab('disk')}
          className={cn(
            'glass-surface cursor-pointer rounded-2xl border-t-2 p-4 transition hover:ring-1 hover:ring-emerald-500/35',
            healthMeta[diskHealth].border,
          )}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-emerald-500" />
              <span>磁盘 ({busiestDisk?.mountPoint ?? '/'})</span>
            </span>
            <span className="tabular-nums text-[11px] text-slate-400">
              {busiestDisk ? `${diskVal.toFixed(0)}%` : '--'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="space-y-0.5 tabular-nums">
              <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{snap ? formatRate(snap.diskIO?.readBytesPerSec ?? 0) : '--'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                <ArrowUp className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{snap ? formatRate(snap.diskIO?.writeBytesPerSec ?? 0) : '--'}</span>
              </div>
            </div>
            <Sparkline
              data={liveSpark}
              dataKey="diskReadMBs"
              color={healthMeta[diskHealth].spark}
            />
          </div>

          <ProgressBar percent={diskVal} barClass={healthMeta[diskHealth].bar} />
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>
              {busiestDisk
                ? `${formatBytes(busiestDisk.usedBytes)} / ${formatBytes(busiestDisk.totalBytes)}`
                : '--'}
            </span>
            <span>
              {snap
                ? `${Math.round((snap.diskIO?.readIops ?? 0) + (snap.diskIO?.writeIops ?? 0))} IOPS`
                : '--'}
            </span>
          </div>
        </div>

        {/* 4. Network I/O */}
        <div
          onClick={() => setInspectorTab('net')}
          className={cn(
            'glass-surface cursor-pointer rounded-2xl border-t-2 p-4 transition hover:ring-1 hover:ring-sky-500/35',
            healthMeta[netHealth].border,
          )}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Network className="h-4 w-4 text-sky-500" />
              <span>网络 ({primaryNet?.interface ?? 'eth0'})</span>
            </span>
            <span className="text-[11px] text-slate-400">
              {primaryNet?.isUp ? 'Up' : 'Down'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="space-y-0.5 tabular-nums">
              <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span>{snap ? formatRate(totalNetRx) : '--'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                <ArrowUp className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                <span>{snap ? formatRate(totalNetTx) : '--'}</span>
              </div>
            </div>
            <Sparkline data={liveSpark} dataKey="netRxKBs" color="#0ea5e9" />
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>{primaryNet ? `↓ ${formatBytes(primaryNet.rxTotalBytes)}` : '--'}</span>
            <span>{primaryNet ? `↑ ${formatBytes(primaryNet.txTotalBytes)}` : '--'}</span>
          </div>
        </div>
      </div>

      {/* Time Range Segmented Bar + Direct Dual Date Picker */}
      <div className="glass-surface flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetClick(p.id)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                range === p.id
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-500/10 dark:text-slate-300',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/60 px-2.5 py-1 text-xs dark:border-white/10 dark:bg-white/5">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => handleDateChange(e.target.value, toDate)}
            className="bg-transparent text-xs outline-none"
            aria-label="开始日期"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => handleDateChange(fromDate, e.target.value)}
            className="bg-transparent text-xs outline-none"
            aria-label="结束日期"
          />
        </div>
      </div>

      {/* 4 Trend Charts (2x2) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="CPU 使用率趋势 (%)" icon={<Activity className="h-4 w-4 text-sky-500" />}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={28} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="cpu"
              name="CPU %"
              stroke="#0ea5e9"
              strokeWidth={2}
              fill="url(#cpuGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title="内存与 Swap 占用趋势 (%)"
          icon={<MemoryStick className="h-4 w-4 text-violet-500" />}
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={28} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="memPercent"
              name="内存 %"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#memGrad)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="swapPercent"
              name="Swap %"
              stroke="#ec4899"
              strokeWidth={1.5}
              fillOpacity={0}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title="硬盘读写 I/O 趋势 (MB/s)"
          icon={<HardDrive className="h-4 w-4 text-emerald-500" />}
        >
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="diskReadMBs"
              name="读取 MB/s"
              stroke="#10b981"
              strokeWidth={2}
              fill="#10b981"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="diskWriteMBs"
              name="写入 MB/s"
              stroke="#f97316"
              strokeWidth={2}
              fill="#f97316"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title="网络吞吐趋势 (KB/s)"
          icon={<Network className="h-4 w-4 text-amber-500" />}
        >
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="netRxKBs"
              name="下行 KB/s"
              stroke="#06b6d4"
              strokeWidth={2}
              fill="#06b6d4"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="netTxKBs"
              name="上行 KB/s"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="#f59e0b"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartCard>
      </div>

      {/* Bottom Row: Host Info + Disks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-surface rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4 text-slate-500" />
            主机信息
          </div>
          <dl className="divide-y divide-slate-200/50 text-sm dark:divide-white/5">
            <InfoRow label="主机名" value={host?.hostname ?? '--'} />
            <InfoRow
              label="系统 IP"
              value={host?.ipAddresses?.length ? host.ipAddresses.join(' · ') : '--'}
              tabular
            />
            <InfoRow label="操作系统" value={host?.os ?? '--'} />
            <InfoRow
              label="内核 / 架构"
              value={host ? `${host.kernel} (${host.arch})` : '--'}
            />
            <InfoRow
              label="处理器"
              value={host ? `${host.cpuModel} (${host.cpuCores} 核)` : '--'}
            />
            <InfoRow
              label="CPU 温度"
              value={snap?.cpuTempC !== undefined ? `${snap.cpuTempC.toFixed(1)} °C` : '--'}
              tabular
            />
            <InfoRow
              label="负载进程"
              value={snap ? `${snap.procsRunning} 运行 / ${snap.procsTotal} 总计` : '--'}
              tabular
            />
            <InfoRow label="系统时区" value={host?.timezone ?? '--'} />
            <InfoRow
              label="开机时间"
              value={host?.bootTime ? new Date(host.bootTime).toLocaleString() : '--'}
              tabular
            />
            <InfoRow
              label="运行时长"
              value={
                snap ? formatUptime(snap.uptimeSec) : host ? formatUptime(host.uptimeSec) : '--'
              }
              tabular
            />
          </dl>
        </div>

        <div className="space-y-4">
          <div className="glass-surface rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <HardDrive className="h-4 w-4 text-slate-500" />
              磁盘挂载点空间
            </div>
            <div className="space-y-3.5">
              {(snap?.disks ?? []).map((disk) => {
                const lvl = getHealth(disk.usedPercent, 80, 90)
                return (
                  <div key={disk.mountPoint}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {disk.mountPoint}{' '}
                        <span className="text-slate-400">
                          ({disk.device} · {disk.fsType})
                        </span>
                      </span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)} ({disk.usedPercent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      <div
                        className={cn('h-full rounded-full transition-all', healthMeta[lvl].bar)}
                        style={{ width: `${Math.min(100, disk.usedPercent)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="glass-surface rounded-2xl p-5">
            <div className="mb-3 text-sm font-semibold">服务与容器状态</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => onNavigate?.('services')}
                className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/40 px-4 py-3 text-left transition hover:border-sky-500/40 hover:bg-sky-500/5 dark:border-white/10 dark:bg-white/5"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Cog className="h-3.5 w-3.5 text-sky-500" />
                    <span>systemd 服务</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {snap?.workloads.servicesActive ?? 0} 运行
                    </span>
                    <span
                      className={
                        (snap?.workloads.servicesFailed ?? 0) > 0
                          ? 'text-rose-500'
                          : 'font-normal text-slate-400'
                      }
                    >
                      · {snap?.workloads.servicesFailed ?? 0} 异常
                    </span>
                    <span className="font-normal text-slate-400">
                      · {snap?.workloads.servicesInactive ?? 0} 停止
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
              </button>

              <button
                onClick={() => onNavigate?.('containers')}
                className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/40 px-4 py-3 text-left transition hover:border-sky-500/40 hover:bg-sky-500/5 dark:border-white/10 dark:bg-white/5"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Box className="h-3.5 w-3.5 text-violet-500" />
                    <span>Docker 容器</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {snap?.workloads.containersRunning ?? 0} 运行
                    </span>
                    <span
                      className={
                        (snap?.workloads.containersError ?? 0) > 0
                          ? 'text-rose-500'
                          : 'font-normal text-slate-400'
                      }
                    >
                      · {snap?.workloads.containersError ?? 0} 异常
                    </span>
                    <span className="font-normal text-slate-400">
                      · {snap?.workloads.containersStopped ?? 0} 停止
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ResourceInspectorDrawer
        tab={inspectorTab}
        snap={snap}
        onChangeTab={setInspectorTab}
        onClose={() => setInspectorTab(null)}
      />
    </div>
  )
}

const tooltipStyle = {
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.2)',
  backgroundColor: 'rgba(15,23,42,0.92)',
  color: '#f8fafc',
  fontSize: '12px',
}

function Sparkline({
  data,
  dataKey,
  color,
}: {
  data: ChartRow[]
  dataKey: keyof ChartRow
  color: string
}) {
  if (data.length <= 1) return <div className="h-8 w-24 shrink-0" />
  return (
    <div className="h-8 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ProgressBar({ percent, barClass }: { percent: number; barClass: string }) {
  return (
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
      <div
        className={cn('h-full rounded-full transition-all duration-300', barClass)}
        style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
      />
    </div>
  )
}

function InfoRow({
  label,
  value,
  tabular = false,
}: {
  label: string
  value: string
  tabular?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={cn('truncate text-right font-medium', tabular && 'tabular-nums')}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactElement
}) {
  return (
    <div className="glass-surface rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
