import type {
  AuditEntry,
  AuthStatus,
  ContainerAction,
  ContainerDetail,
  ContainerSummary,
  HistoryPoint,
  HostInfo,
  MetricsSnapshot,
  ProcessInfo,
  ServiceAction,
  ServiceDetail,
  ServiceUnit,
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
  const body = (await res.json()) as ApiEnvelope<T>
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
  },
  audit: {
    recent: (limit = 50) => request<AuditEntry[]>(`/api/v1/audit?limit=${limit}`),
  },
}

export function buildLogsWSUrl(type: 'service' | 'container', target: string, tail = 100): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/v1/ws/logs?type=${type}&target=${encodeURIComponent(target)}&tail=${tail}`
}
