import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认执行',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="glass-surface w-full max-w-md rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-500/10 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm transition ${
              danger
                ? 'bg-rose-600 hover:bg-rose-500 disabled:opacity-50'
                : 'bg-sky-600 hover:bg-sky-500 disabled:opacity-50'
            }`}
          >
            {loading ? '执行中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
