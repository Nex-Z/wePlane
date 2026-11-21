import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { RotateCw, Trash2 } from 'lucide-react'
import { buildTerminalWSUrl } from '@/api/client'
import { cn } from '@/lib/format'

export function TerminalView({visible}: {visible:boolean}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [sessionSeq, setSessionSeq] = useState(0)

  useEffect(() => {
    if (visible) window.dispatchEvent(new Event("resize"))
  }, [visible])

  useEffect(() => {
    if (status !== 'connected') return
    const warnOnUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnOnUnload)
    return () => window.removeEventListener('beforeunload', warnOnUnload)
  }, [status])

  const connect = useCallback(() => {
    setSessionSeq((n) => n + 1)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: '#090d16',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(el)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    setStatus('connecting')
    const ws = new WebSocket(buildTerminalWSUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      fitAddon.fit()
      ws.send(
        JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }),
      )
      term.focus()
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term.write(ev.data)
      }
    }

    ws.onerror = () => {
      setStatus('disconnected')
    }

    ws.onclose = () => {
      setStatus('disconnected')
      term.writeln('\r\n\x1b[33m[wePlane] 终端连接已断开\x1b[0m')
    }

    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    const handleResize = () => {
      if (!el.offsetWidth) return
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows,
          }),
        )
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      inputDisposable.dispose()
      ws.close()
      term.dispose()
    }
  }, [sessionSeq])

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              status === 'connected'
                ? 'bg-emerald-500'
                : status === 'connecting'
                  ? 'animate-pulse bg-amber-500'
                  : 'bg-rose-500',
            )}
          />
          <span className="text-slate-600 dark:text-slate-300">
            {status === 'connected'
              ? '终端已连接'
              : status === 'connecting'
                ? '正在连接终端...'
                : '终端已断开'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => termRef.current?.clear()}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清屏
          </button>
          <button
            onClick={connect}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <RotateCw className="h-3.5 w-3.5" />
            重连
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200/70 bg-[#090d16] p-3 shadow-inner dark:border-white/10">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  )
}
