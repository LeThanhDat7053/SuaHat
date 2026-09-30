// Bộ nhớ tạm dữ liệu trong phiên dùng app: mở lại trang là thấy ngay số cũ, rồi tự cập nhật ngầm.
// Mọi lệnh ghi (thêm / sửa / xóa) lên database đều làm cũ toàn bộ bộ nhớ (xem supabase.js),
// nên sau khi sửa không bao giờ đọc phải số cũ của chính máy này.

const store = new Map() // key → { value, at, ver, pending }
let version = 0

export function invalidateCache() {
  version++
}

// Giá trị đã có (có thể hơi cũ) để hiện ngay, chưa có thì undefined
export const peek = (key) => store.get(key)?.value

// Lấy dữ liệu: dùng lại nếu còn mới (dưới maxAge ms, chưa có lệnh ghi nào), không thì tải lại.
// Nhiều chỗ gọi cùng lúc chỉ tải 1 lần.
export function cached(key, fn, maxAge = 0) {
  const e = store.get(key)
  if (e && e.ver === version) {
    if (e.pending) return e.pending
    if (Date.now() - e.at < maxAge) return Promise.resolve(e.value)
  }
  const ver = version
  const pending = fn().then(
    (value) => {
      store.set(key, { value, at: Date.now(), ver })
      return value
    },
    (err) => {
      if (store.get(key)?.pending === pending) store.set(key, { ...e, pending: null })
      throw err
    },
  )
  store.set(key, { ...e, ver, pending })
  return pending
}
