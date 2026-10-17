import { useSyncExternalStore } from 'react'

// Giao diện sáng / tối: riêng từng máy. 'auto' = theo cài đặt của điện thoại/máy tính.
const KEY = 'theme'
const listeners = new Set()
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

function read() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

let mode = read()

// màu thanh trạng thái điện thoại theo nền app
function apply() {
  const root = document.documentElement
  if (mode === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
  const dark = mode === 'dark' || (mode === 'auto' && media?.matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17130f' : '#7b4a26')
}

export function setTheme(value) {
  mode = value
  try {
    if (value === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch {
    /* máy chặn lưu trữ: chỉ có tác dụng tới khi tải lại */
  }
  apply()
  listeners.forEach((fn) => fn())
}

export function setupTheme() {
  apply()
  media?.addEventListener?.('change', apply)
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useTheme = () => useSyncExternalStore(subscribe, () => mode)

export const THEMES = [
  { id: 'light', label: 'Sáng' },
  { id: 'dark', label: 'Tối' },
  { id: 'auto', label: 'Theo máy' },
]
