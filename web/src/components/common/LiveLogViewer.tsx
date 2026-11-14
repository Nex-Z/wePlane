import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Trash2 } from 'lucide-react'
import { buildLogsWSUrl } from '@/api/client'
import type { LogLine } from '@/api/types'

interface LiveLogViewerProps {
  type: 'service' | 'container'
  target: string
}

export function LiveLogViewer({ type, target }: LiveLogViewerProps) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLines([])
    setStatus('connecting')
    const ws = new WebSocket(buildLogsWSUrl(type, target, 100))

    ws.onopen = () => setStatus('connected')
    ws.onclose = () => setStatus('closed')
    ws.onerror = () => setStatus('closed')
    ws.onmessage = (evt) => {
      try {
        const line = JSON.parse(evt.data) as LogLine
        setLines((prev) => [...prev.slice(-499), line])
      } catch {
        // Ignore malformed frame
      }
    }

    return () => {
      ws.close()
    }
  }, [type, target])

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, paused])

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-slate-950 text-slate-100 dark:border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/90 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status === 'connected'
                ? 'bg-emerald-400'
                : status === 'connecting'
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
            }`}
          />
          <span className="font-mono text-slate-300">
            {status === 'connected' ? '实时日志流' : status === 'connecting' ? '正在连接...' : '已断开'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-300 hover:bg-white/10"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? '继续滚动' : '暂停滚动'}
          </button>
          <button
            onClick={() => setLines([])}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-300 hover:bg-white/10"
          >
            <Trash2 className="h-3 w-3" />
            清空
          </button>
        </div>
      </div>

      <div className="h-72 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <div className="text-slate-500">等待日志输出...</div>
        ) : (
          lines.map((l, idx) => (
            <div key={idx} className="flex gap-2 py-0.5 hover:bg-white/5">
              <span className="shrink-0 text-slate-500">
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={
                  l.stream === 'stderr'
                    ? 'text-rose-400 break-all'
                    : 'text-slate-200 break-all'
                }
              >
                {l.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
