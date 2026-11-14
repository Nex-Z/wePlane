import { cn } from '@/lib/format'

interface StatusBadgeProps {
  state: string
  className?: string
}

const stateStyles: Record<string, string> = {
  active: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  running: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  enabled: 'bg-sky-500/12 text-sky-600 dark:text-sky-400 border-sky-500/20',
  failed: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/20',
  exited: 'bg-slate-500/12 text-slate-600 dark:text-slate-400 border-slate-500/20',
  inactive: 'bg-slate-500/12 text-slate-600 dark:text-slate-400 border-slate-500/20',
  disabled: 'bg-slate-500/12 text-slate-500 dark:text-slate-400 border-slate-500/20',
  paused: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/20',
  restarting: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/20',
}

const stateLabels: Record<string, string> = {
  active: '运行中',
  running: '运行中',
  activating: '启动中',
  deactivating: '停止中',
  restarting: '重启中',
  failed: '异常',
  inactive: '已停止',
  exited: '已退出',
  dead: '已停止',
  paused: '已暂停',
  enabled: '已启用',
  disabled: '未启用',
  static: '静态',
  masked: '已屏蔽',
  indirect: '间接启用',
  unknown: '未知',
}

export function StatusBadge({ state, className }: StatusBadgeProps) {
  const key = state.toLowerCase()
  const style = stateStyles[key] ?? 'bg-slate-500/10 text-slate-500 border-slate-500/20'
  const label = stateLabels[key] ?? state
  const isHealthy = key === 'active' || key === 'running'
  const isError = key === 'failed'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        style,
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          isHealthy && 'bg-emerald-500',
          isError && 'bg-rose-500',
          !isHealthy && !isError && 'bg-current opacity-60',
        )}
      />
      {label}
    </span>
  )
}
