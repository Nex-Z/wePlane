import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DetailDrawerProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

export function DetailDrawer({ open, title, subtitle, onClose, children }: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="glass-surface flex h-full w-full max-w-2xl flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="关闭抽屉"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  )
}
