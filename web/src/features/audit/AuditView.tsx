import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '@/api/client'
import type { AuditEntry } from '@/api/types'
import { StatusBadge } from '@/components/common/StatusBadge'

export function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setEntries(await api.audit.recent(80))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          记录所有登录与状态变更操作（追加写入服务端审计日志）
        </p>
        <button
          onClick={() => void load()}
          className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium hover:bg-white dark:hover:bg-white/10"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="glass-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-slate-500/5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">动作</th>
                <th className="px-4 py-3 font-medium">目标</th>
                <th className="px-4 py-3 font-medium">结果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
              {entries.map((e, i) => (
                <tr key={i} className="text-xs">
                  <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{e.user}</td>
                  <td className="px-4 py-3 font-mono">{e.action}</td>
                  <td className="px-4 py-3 font-mono">{e.target}</td>
                  <td className="px-4 py-3">
                    <StatusBadge state={e.status === 'success' ? 'active' : 'failed'} />
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    暂无审计记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
