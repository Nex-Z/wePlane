import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  return () => window.removeEventListener('popstate', notify)
}

function commit(url: URL, replace: boolean) {
  if (url.href === location.href) return
  if (replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigate(tab: string, params: Record<string, string> = {}) {
  const url = new URL(location.href)
  url.search = new URLSearchParams({ tab, ...params }).toString()
  commit(url, false)
}

export function useParam<T extends string>(
  key: string,
  fallback: T,
  replace = false,
): [T, (value: T) => void] {
  const search = useSyncExternalStore(subscribe, () => location.search)
  const value = new URLSearchParams(search).get(key) || fallback
  return [
    value as T,
    (next) => {
      const url = new URL(location.href)
      if (next && next !== fallback) url.searchParams.set(key, next)
      else url.searchParams.delete(key)
      commit(url, replace)
    },
  ]
}
