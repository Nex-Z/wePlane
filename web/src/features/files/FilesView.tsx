import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Download,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { api } from '@/api/client'
import type { FileEntry } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailDrawer } from '@/components/common/DetailDrawer'
import { cn, formatBytes } from '@/lib/format'

export function FilesView() {
  const [currentPath, setCurrentPath] = useState('/')
  const [parentPath, setParentPath] = useState('/')
  const [pathInput, setPathInput] = useState('/')
  const [items, setItems] = useState<FileEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [savingFile, setSavingFile] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [newNameModal, setNewNameModal] = useState<'dir' | 'file' | null>(null)
  const [newNameValue, setNewNameValue] = useState('')

  const [conflict, setConflict] = useState<{dir:string; file:File} | null>(null)
  const [uploading,setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const loadDir = useCallback(async (targetPath: string) => {
    setLoading(true)
    try {
      const res = await api.files.list(targetPath)
      setCurrentPath(res.path)
      setParentPath(res.parent)
      setPathInput(res.path)
      setItems(res.items)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '加载目录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDir('/')
  }, [loadDir])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, search])

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean)
    const crumbs: { label: string; path: string }[] = [{ label: '/', path: '/' }]
    let acc = ''
    for (const p of parts) {
      acc += '/' + p
      crumbs.push({ label: p, path: acc })
    }
    return crumbs
  }, [currentPath])

  const openEditor = async (entry: FileEntry) => {
    try {
      const res = await api.files.read(entry.path)
      setEditingPath(res.path)
      setEditorContent(res.content)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '打开文件失败')
    }
  }

  const handleSaveEditor = async () => {
    if (!editingPath) return
    setSavingFile(true)
    try {
      await api.files.write(editingPath, editorContent)
      setToast(`已保存 ${editingPath}`)
      setEditingPath(null)
      await loadDir(currentPath)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '保存文件失败')
    } finally {
      setSavingFile(false)
    }
  }

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newNameValue.trim().replace(/^\/+/, '')
    if (!name || !newNameModal) return
    const target = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
    try {
      if (newNameModal === 'dir') {
        await api.files.mkdir(target)
        setToast(`已新建目录 ${name}`)
      } else {
        await api.files.create(target)
        setToast(`已新建文件 ${name}`)
      }
      setNewNameModal(null)
      setNewNameValue('')
      await loadDir(currentPath)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '创建失败')
    }
  }

  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await upload(currentPath, file)
  }

  const upload = async (dir: string, file: File, overwrite = false) => {
    setUploading(true)
    try {
      await api.files.upload(dir, file, overwrite)
      setConflict(null)
      setToast(`已上传 ${file.name}`)
      await loadDir(currentPath)
    } catch (err) {
      if (!overwrite && err instanceof Error && 'status' in err && err.status === 409) setConflict({dir,file})
      else {setConflict(null); setToast(err instanceof Error ? err.message : '上传失败')}
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.files.delete(deleteTarget.path, true)
      setToast(`已删除 ${deleteTarget.name}`)
      setDeleteTarget(null)
      await loadDir(currentPath)
    } catch (err) {
      setToast(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Path bar + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void loadDir(pathInput || '/')
          }}
          className="flex min-w-[280px] flex-1 items-center gap-2"
        >
          <button
            type="button"
            onClick={() => void loadDir(parentPath)}
            disabled={currentPath === '/'}
            title="返回上一级"
            className="glass-surface rounded-xl p-2 text-slate-600 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="/"
            className="glass-surface flex-1 rounded-xl px-3 py-1.5 font-mono text-xs outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="glass-surface rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            跳转
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-44">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="过滤当前目录..."
              className="glass-surface w-full rounded-xl py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={() => {
              setNewNameValue('')
              setNewNameModal('dir')
            }}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            新建目录
          </button>
          <button
            onClick={() => {
              setNewNameValue('')
              setNewNameModal('file')
            }}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <FilePlus className="h-3.5 w-3.5" />
            新建文件
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-500"
          >
            <Upload className="h-3.5 w-3.5" />
            上传
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            onChange={(e) => void handleUploadChange(e)}
          />
          <button
            onClick={() => void loadDir(currentPath)}
            className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        {breadcrumbs.map((c, idx) => (
          <div key={c.path} className="flex items-center gap-1">
            {idx > 0 && <span>/</span>}
            <button
              onClick={() => void loadDir(c.path)}
              className={cn(
                'rounded-md px-1.5 py-0.5 font-mono transition hover:bg-slate-500/10',
                idx === breadcrumbs.length - 1 && 'font-semibold text-slate-800 dark:text-slate-100',
              )}
            >
              {c.label}
            </button>
          </div>
        ))}
      </div>

      {toast && (
        <div className="flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs text-sky-700 dark:text-sky-300">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            关闭
          </button>
        </div>
      )}

      {/* File Table */}
      <div className="glass-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/70 bg-slate-500/5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">大小</th>
                <th className="px-4 py-3 font-medium">权限</th>
                <th className="px-4 py-3 font-medium">修改时间</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400">
                    {loading ? '正在加载目录...' : '当前目录为空'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr
                    key={item.path}
                    onClick={() => {
                      if (item.isDir) {
                        void loadDir(item.path)
                      } else {
                        void openEditor(item)
                      }
                    }}
                    className="cursor-pointer transition hover:bg-slate-500/5"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {item.isDir ? (
                          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                        ) : (
                          <File className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <span className="font-mono text-xs font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {item.isDir ? '--' : formatBytes(item.size)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {item.mode}
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {new Date(item.modTime).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {!item.isDir && (
                          <>
                            <button
                              onClick={() => void openEditor(item)}
                              title="编辑文本"
                              className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-500/10"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={api.files.downloadUrl(item.path)}
                              download={item.name}
                              title="下载"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-300"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteTarget(item)}
                          title="删除"
                          className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Text File Editor Modal */}
      <DetailDrawer
        open={editingPath !== null}
        title={editingPath ?? ''}
        subtitle="在线文本编辑"
        onClose={() => setEditingPath(null)}
      >
        <div className="space-y-4">
          <textarea
            rows={18}
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            className="w-full rounded-xl border border-slate-200/70 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-sky-500 dark:border-white/10"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingPath(null)}
              className="glass-surface rounded-xl px-4 py-2 text-xs font-medium hover:bg-white dark:hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="button"
              disabled={savingFile}
              onClick={() => void handleSaveEditor()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {savingFile ? '保存中...' : '保存文件'}
            </button>
          </div>
        </div>
      </DetailDrawer>

      {/* New Dir / New File Modal */}
      {newNameModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={() => setNewNameModal(null)}
        >
          <form
            onSubmit={handleCreateItem}
            onClick={(e) => e.stopPropagation()}
            className="glass-surface w-full max-w-sm rounded-2xl p-6 shadow-2xl"
          >
            <h3 className="text-sm font-semibold">
              {newNameModal === 'dir' ? '新建目录' : '新建文件'}
            </h3>
            <p className="mt-1 font-mono text-xs text-slate-400">当前目录：{currentPath}</p>
            <input
              autoFocus
              type="text"
              value={newNameValue}
              onChange={(e) => setNewNameValue(e.target.value)}
              placeholder={newNameModal === 'dir' ? '输入目录名' : '输入文件名（如 app.conf）'}
              className="glass-surface mt-4 w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewNameModal(null)}
                className="glass-surface rounded-xl px-3 py-1.5 text-xs font-medium"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              >
                创建
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog open={!!conflict} title="覆盖已有文件？" description={conflict ? `将替换 ${conflict.dir.replace(/\/$/, '')}/${conflict.file.name}` : ''} confirmLabel="覆盖文件" loading={uploading} onCancel={() => setConflict(null)} onConfirm={() => {if(conflict) void upload(conflict.dir,conflict.file,true)}} />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`确认删除${deleteTarget?.isDir ? '目录' : '文件'} ${deleteTarget?.name}？`}
        description={`将永久删除 ${deleteTarget?.path}，此操作不可恢复并记入审计日志。`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  )
}
