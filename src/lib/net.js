import { useSyncExternalStore } from 'react'

// Theo dõi mạng của các lệnh gửi lên database:
// - down: lệnh vừa rồi không tới được máy chủ (mất wifi / rớt mạng)
// - slow: có lệnh chờ quá SLOW_MS mà chưa xong (mạng chậm)
// Lệnh đọc (GET) bị rớt mạng thì tự thử lại vài lần trước khi báo lỗi.

const SLOW_MS = 2500
const RETRY_MS = [800, 2000]

let snap = { down: typeof navigator !== 'undefined' && navigator.onLine === false, slow: false }
let slowCount = 0
const listeners = new Set()

function set(patch) {
  const next = { ...snap, ...patch }
  if (next.down === snap.down && next.slow === snap.slow) return
  snap = next
  listeners.forEach((fn) => fn())
}

export function markDown(down) {
  set({ down })
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set({ down: true }))
  window.addEventListener('online', () => set({ down: false }))
}

// Lỗi do mạng (không phải lỗi dữ liệu): Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError…"
export function isNetworkError(e) {
  if (!e) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const text = `${e.name || ''} ${e.message || e} ${e.details || ''}`
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_network|err_internet|err_connection|timeouterror|retryablefetcherror/i.test(text)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function netFetch(input, init) {
  const method = (init?.method || 'GET').toUpperCase()
  const retries = method === 'GET' || method === 'HEAD' ? RETRY_MS.length : 0
  let fired = false
  const timer = setTimeout(() => {
    fired = true
    slowCount++
    set({ slow: true })
  }, SLOW_MS)
  try {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(input, init)
        set({ down: false })
        return res
      } catch (e) {
        const net = isNetworkError(e) && !init?.signal?.aborted
        if (!net || i >= retries) {
          if (net) set({ down: true })
          throw e
        }
        await wait(RETRY_MS[i])
      }
    }
  } finally {
    clearTimeout(timer)
    if (fired && --slowCount === 0) set({ slow: false })
  }
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useNet = () => useSyncExternalStore(subscribe, () => snap)
