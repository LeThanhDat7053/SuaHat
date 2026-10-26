import { isNetworkError } from './net'

// Bản sao dữ liệu cần để bán hàng (món, giá, công thức…) giữ trong máy:
// mở app lúc mất mạng vẫn có menu và giá đúng để lập đơn.
const PREFIX = 'keep:'

export function keep(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* máy chặn lưu trữ / đầy bộ nhớ: bỏ qua */
  }
}

export function kept(key) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key))
  } catch {
    return null
  }
}

// Tải dữ liệu: được thì lưu bản sao, rớt mạng thì dùng bản sao lần trước (nếu có)
export async function withKept(key, load) {
  try {
    const value = await load()
    keep(key, value)
    return value
  } catch (e) {
    const old = kept(key)
    if (old != null && isNetworkError(e)) return old
    throw e
  }
}
