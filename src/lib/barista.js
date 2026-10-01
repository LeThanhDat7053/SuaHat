import { useSyncExternalStore } from 'react'

// Chế độ pha chế: riêng từng máy (máy ở quầy pha bật, máy chủ quán không bị ảnh hưởng).
// Chỉ hiện đơn hàng + công thức, ẩn doanh thu / lãi / nhập hàng / chi phí.
const KEY = 'barista-mode'
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = read()

export function setBarista(value) {
  on = !!value
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* máy chặn lưu trữ: chỉ có tác dụng tới khi tải lại */
  }
  listeners.forEach((fn) => fn())
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useBarista = () => useSyncExternalStore(subscribe, () => on)

// Trang được mở trong chế độ pha chế
export const BARISTA_PATHS = ['/ban-hang', '/cong-thuc', '/khac', '/huong-dan']
