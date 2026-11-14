import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, KeyRound, Save, Send, ServerCog, Sliders } from 'lucide-react'
import { api } from '@/api/client'
import type { PanelSettings, RuntimeInfo } from '@/api/types'

interface SettingsViewProps {
  username: string
}

const defaultSettings: PanelSettings = {
  cpuAlertPercent: 85,
  memAlertPercent: 85,
  diskAlertPercent: 90,
  refreshIntervalSec: 2,
  defaultLogTail: 100,
  bark: {
    enabled: false,
    serverUrl: 'https://api.day.app',
    deviceKey: '',
    group: 'wePlane',
    notifyAlert: true,
    notifyLogin: false,
  },
}

export function SettingsView({ username }: SettingsViewProps) {
  const [settings, setSettings] = useState<PanelSettings>(defaultSettings)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [testingBark, setTestingBark] = useState(false)
  const [savingBark, setSavingBark] = useState(false)
  const [barkMsg, setBarkMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    api.settings
      .get()
      .then((res) => {
        setSettings(res.settings)
        setRuntime(res.runtime)
      })
      .catch((err) => {
        setSettingsMsg({
          type: 'err',
          text: err instanceof Error ? err.message : '加载设置失败',
        })
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsMsg(null)
    setSavingSettings(true)
    try {
      const updated = await api.settings.update(settings)
      setSettings(updated)
      setSettingsMsg({ type: 'ok', text: '面板设置已保存' })
    } catch (err) {
      setSettingsMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '保存设置失败',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null)
    if (!oldPassword || !newPassword) {
      setPwdMsg({ type: 'err', text: '请填写原密码与新密码' })
      return
    }
    if (newPassword.length < 6) {
      setPwdMsg({ type: 'err', text: '新密码长度不能少于 6 位' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'err', text: '两次输入的新密码不一致' })
      return
    }

    setSavingPwd(true)
    try {
      await api.auth.changePassword(oldPassword, newPassword)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwdMsg({ type: 'ok', text: '密码已更新，下次登录生效' })
    } catch (err) {
      setPwdMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '修改密码失败',
      })
    } finally {
      setSavingPwd(false)
    }
  }

  const handleSaveBark = async (e: React.FormEvent) => {
    e.preventDefault()
    setBarkMsg(null)
    setSavingBark(true)
    try {
      const updated = await api.settings.update(settings)
      setSettings(updated)
      setBarkMsg({ type: 'ok', text: 'Bark 推送设置已保存' })
    } catch (err) {
      setBarkMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '保存推送设置失败',
      })
    } finally {
      setSavingBark(false)
    }
  }

  const handleTestBark = async () => {
    setBarkMsg(null)
    setTestingBark(true)
    try {
      await api.settings.testBark(settings.bark)
      setBarkMsg({ type: 'ok', text: '测试推送已发送，请检查 Bark 客户端' })
    } catch (err) {
      setBarkMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '发送测试推送失败',
      })
    } finally {
      setTestingBark(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Account & Security */}
        <section className="glass-surface rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">账号与安全</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                当前管理员：<span className="font-mono font-medium">{username}</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3.5 text-xs">
            {pwdMsg && (
              <div
                className={
                  pwdMsg.type === 'ok'
                    ? 'flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-emerald-600 dark:text-emerald-300'
                    : 'rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-rose-600 dark:text-rose-300'
                }
              >
                {pwdMsg.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                <span>{pwdMsg.text}</span>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                原密码
              </span>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                新密码（至少 6 位）
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                确认新密码
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
              />
            </label>

            <div className="pt-1">
              <button
                type="submit"
                disabled={savingPwd}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {savingPwd ? '提交中...' : '修改密码'}
              </button>
            </div>
          </form>
        </section>

        {/* 2. Alerts & Preferences */}
        <section className="glass-surface rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">告警阈值与偏好</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                配置资源告警水位线及日志/刷新默认参数
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-3.5 text-xs">
            {settingsMsg && (
              <div
                className={
                  settingsMsg.type === 'ok'
                    ? 'flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-emerald-600 dark:text-emerald-300'
                    : 'rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-rose-600 dark:text-rose-300'
                }
              >
                {settingsMsg.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                <span>{settingsMsg.text}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  CPU 告警 (%)
                </span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  disabled={loading}
                  value={settings.cpuAlertPercent}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, cpuAlertPercent: Number(e.target.value) }))
                  }
                  className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  内存告警 (%)
                </span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  disabled={loading}
                  value={settings.memAlertPercent}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, memAlertPercent: Number(e.target.value) }))
                  }
                  className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  磁盘告警 (%)
                </span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  disabled={loading}
                  value={settings.diskAlertPercent}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, diskAlertPercent: Number(e.target.value) }))
                  }
                  className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  监控刷新间隔
                </span>
                <select
                  disabled={loading}
                  value={settings.refreshIntervalSec}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, refreshIntervalSec: Number(e.target.value) }))
                  }
                  className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
                >
                  <option value={2}>2 秒（实时）</option>
                  <option value={5}>5 秒（均衡）</option>
                  <option value={10}>10 秒（省资源）</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                  日志默认拉取行数
                </span>
                <select
                  disabled={loading}
                  value={settings.defaultLogTail}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, defaultLogTail: Number(e.target.value) }))
                  }
                  className="glass-surface w-full rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500"
                >
                  <option value={100}>100 行</option>
                  <option value={200}>200 行</option>
                  <option value={500}>500 行</option>
                </select>
              </label>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading || savingSettings}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {savingSettings ? '保存中...' : '保存设置'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* 3. Push Notification Settings (Bark) */}
      <section className="glass-surface rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">推送设置（Bark）</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                支持官方 api.day.app 或自建 Bark 服务端
              </p>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              disabled={loading}
              checked={settings.bark.enabled}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  bark: { ...s.bark, enabled: e.target.checked },
                }))
              }
              className="h-3.5 w-3.5 rounded accent-sky-600"
            />
            <span>启用 Bark 推送</span>
          </label>
        </div>

        <form onSubmit={handleSaveBark} className="space-y-4 text-xs">
          {barkMsg && (
            <div
              className={
                barkMsg.type === 'ok'
                  ? 'flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-emerald-600 dark:text-emerald-300'
                  : 'rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-rose-600 dark:text-rose-300'
              }
            >
              {barkMsg.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              <span>{barkMsg.text}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                Bark 服务端地址
              </span>
              <input
                type="text"
                disabled={loading}
                value={settings.bark.serverUrl}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bark: { ...s.bark, serverUrl: e.target.value },
                  }))
                }
                placeholder="https://api.day.app"
                className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                Device Key（或完整推送 URL）
              </span>
              <input
                type="text"
                disabled={loading}
                value={settings.bark.deviceKey}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bark: { ...s.bark, deviceKey: e.target.value },
                  }))
                }
                placeholder="输入 Bark Key"
                className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                消息分组 (Group)
              </span>
              <input
                type="text"
                disabled={loading}
                value={settings.bark.group}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bark: { ...s.bark, group: e.target.value },
                  }))
                }
                placeholder="wePlane"
                className="glass-surface w-full rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                disabled={loading}
                checked={settings.bark.notifyAlert}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bark: { ...s.bark, notifyAlert: e.target.checked },
                  }))
                }
                className="h-3.5 w-3.5 rounded accent-sky-600"
              />
              <span>资源或服务异常告警推送</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                disabled={loading}
                checked={settings.bark.notifyLogin}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bark: { ...s.bark, notifyLogin: e.target.checked },
                  }))
                }
                className="h-3.5 w-3.5 rounded accent-sky-600"
              />
              <span>管理员登录成功提醒</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={loading || testingBark}
              onClick={() => void handleTestBark()}
              className="glass-surface inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium hover:bg-white disabled:opacity-60 dark:hover:bg-white/10"
            >
              <Send className="h-3.5 w-3.5" />
              {testingBark ? '发送中...' : '发送测试推送'}
            </button>
            <button
              type="submit"
              disabled={loading || savingBark}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {savingBark ? '保存中...' : '保存推送设置'}
            </button>
          </div>
        </form>
      </section>

      {/* 4. Runtime Info */}
      <section className="glass-surface rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-300">
            <ServerCog className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">运行环境信息</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              当前 wePlane 服务端启动参数与运行时信息（只读）
            </p>
          </div>
        </div>

        <dl className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-400">监听地址</dt>
            <dd className="mt-1 font-mono font-medium">{runtime?.addr ?? '--'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">数据目录</dt>
            <dd className="mt-1 truncate font-mono font-medium">{runtime?.dataDir ?? '--'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Docker Socket</dt>
            <dd className="mt-1 truncate font-mono font-medium">{runtime?.dockerSocket ?? '--'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">运行模式</dt>
            <dd className="mt-1 font-medium">
              {runtime ? (runtime.mockMode ? 'Mock 模拟模式' : 'Linux 生产模式') : '--'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Go 运行时</dt>
            <dd className="mt-1 font-mono font-medium">{runtime?.goVersion ?? '--'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">目标平台</dt>
            <dd className="mt-1 font-mono font-medium">
              {runtime ? `${runtime.os}/${runtime.arch}` : '--'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
