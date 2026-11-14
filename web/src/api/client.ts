import type {
  AuditEntry,
  AuthStatus,
  BarkSettings,
  ComposeDeployPayload,
  ContainerAction,
  ContainerDetail,
  ContainerSummary,
  CreateContainerPayload,
  CreateServiceRequest,
  FileContentResponse,
  FileListResponse,
  HistoryPoint,
  HostInfo,
  MetricsSnapshot,
  PanelSettings,
  ProcessInfo,
  ServiceAction,
  ServiceDetail,
  ServiceUnit,
  SettingsPayload,
} from './types'

interface ApiEnvelope<T> {
  data?: T
  error?: {
    code: string
    message: string
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const rawText = await res.text()
  let body: ApiEnvelope<T> = {}
  try {
    body = rawText ? (JSON.parse(rawText) as ApiEnvelope<T>) : {}
  } catch {
    throw new Error(`接口返回非 JSON 响应 (${res.status})，请确认后端已重启到最新版本`)
  }
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? `请求失败 (${res.status})`)
  }
  return body.data as T
}

export const api = {
  auth: {
    me: () => request<AuthStatus>('/api/v1/auth/me'),
    login: (username: string, password: string) =>
      request<{ username: string; mockMode: boolean }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    setup: (username: string, password: string) =>
      request<{ username: string; mockMode: boolean }>('/api/v1/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),
    changePassword: (oldPassword: string, newPassword: string) =>
      request<{ ok: boolean }>('/api/v1/auth/password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      }),
  },
  system: {
    info: () => request<HostInfo>('/api/v1/system/info'),
    snapshot: () => request<MetricsSnapshot>('/api/v1/system/snapshot'),
    history: (params: { range?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params.range) qs.set('range', params.range)
      if (params.from) qs.set('from', params.from)
      if (params.to) qs.set('to', params.to)
      return request<HistoryPoint[]>(`/api/v1/system/history?${qs.toString()}`)
    },
    processes: (sort: 'cpu' | 'mem' = 'cpu', limit = 10) =>
      request<ProcessInfo[]>(`/api/v1/system/processes?sort=${sort}&limit=${limit}`),
  },
  services: {
    list: (q = '', state = '') => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (state) params.set('state', state)
      const qs = params.toString()
      return request<ServiceUnit[]>(`/api/v1/services${qs ? `?${qs}` : ''}`)
    },
    get: (unit: string) => request<ServiceDetail>(`/api/v1/services/${encodeURIComponent(unit)}`),
    control: (unit: string, action: ServiceAction, confirm = false) =>
      request<{ unit: string; action: ServiceAction }>(
        `/api/v1/services/${encodeURIComponent(unit)}/action`,
        {
          method: 'POST',
          headers: confirm ? { 'X-Weplane-Confirm': 'true' } : undefined,
          body: JSON.stringify({ action }),
        },
      ),
    daemonReload: () =>
      request<{ ok: boolean }>('/api/v1/services/daemon-reload', {
        method: 'POST',
      }),
    create: (payload: CreateServiceRequest) =>
      request<{ name: string }>('/api/v1/services', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (unit: string, confirm = false) =>
      request<{ unit: string; deleted: boolean }>(`/api/v1/services/${encodeURIComponent(unit)}`, {
        method: 'DELETE',
        headers: confirm ? { 'X-Weplane-Confirm': 'true' } : undefined,
      }),
  },
  containers: {
    list: (all = true) => request<ContainerSummary[]>(`/api/v1/containers?all=${all}`),
    inspect: (id: string) => request<ContainerDetail>(`/api/v1/containers/${encodeURIComponent(id)}`),
    control: (id: string, action: ContainerAction, confirm = false) =>
      request<{ id: string; action: ContainerAction }>(
        `/api/v1/containers/${encodeURIComponent(id)}/action`,
        {
          method: 'POST',
          headers: confirm ? { 'X-Weplane-Confirm': 'true' } : undefined,
          body: JSON.stringify({ action }),
        },
      ),
    create: (payload: CreateContainerPayload) =>
      request<{ id: string }>('/api/v1/containers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (id: string, confirm = false) =>
      request<{ id: string; deleted: boolean }>(`/api/v1/containers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: confirm ? { 'X-Weplane-Confirm': 'true' } : undefined,
      }),
    deployCompose: (payload: ComposeDeployPayload) =>
      request<{ project: string; output: string }>('/api/v1/compose/deploy', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    controlCompose: (project: string, action: 'up' | 'restart' | 'down', confirm = false) =>
      request<{ project: string; action: string; output: string }>(
        `/api/v1/compose/${encodeURIComponent(project)}/action`,
        {
          method: 'POST',
          headers: confirm ? { 'X-Weplane-Confirm': 'true' } : undefined,
          body: JSON.stringify({ action }),
        },
      ),
  },
  audit: {
    recent: (limit = 50) => request<AuditEntry[]>(`/api/v1/audit?limit=${limit}`),
  },
  settings: {
    get: () => request<SettingsPayload>('/api/v1/settings'),
    update: (payload: PanelSettings) =>
      request<PanelSettings>('/api/v1/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    testBark: (payload: BarkSettings) =>
      request<{ ok: boolean }>('/api/v1/settings/bark/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  files: {
    list: (path = '/') =>
      request<FileListResponse>(`/api/v1/files?path=${encodeURIComponent(path)}`),
    read: (path: string) =>
      request<FileContentResponse>(`/api/v1/files/content?path=${encodeURIComponent(path)}`),
    write: (path: string, content: string) =>
      request<{ path: string; ok: boolean }>('/api/v1/files/content', {
        method: 'PUT',
        body: JSON.stringify({ path, content }),
      }),
    mkdir: (path: string) =>
      request<{ path: string; ok: boolean }>('/api/v1/files/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
    upload: async (dir: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/v1/files/upload?dir=${encodeURIComponent(dir)}`, {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      })
      const json = (await res.json()) as ApiEnvelope<{ path: string; ok: boolean }>
      if (!res.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`)
      }
      return json.data as { path: string; ok: boolean }
    },
    downloadUrl: (path: string) =>
      `/api/v1/files/download?path=${encodeURIComponent(path)}`,
    delete: (path: string, confirm = false) =>
      request<{ path: string; deleted: boolean }>(
        `/api/v1/files?path=${encodeURIComponent(path)}`,
        {
          method: 'DELETE',
          headers: confirm ? { 'X-Weplane-Confirm': 'true' } : undefined,
        },
      ),
  },
}

export function buildLogsWSUrl(type: 'service' | 'container', target: string, tail = 100): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/v1/ws/logs?type=${type}&target=${encodeURIComponent(target)}&tail=${tail}`
}

export function buildTerminalWSUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/v1/ws/terminal`
}
