import { createClient } from '@supabase/supabase-js'
import { invalidateCache } from './cache'

// Publishable key được thiết kế để công khai trên web (dữ liệu được bảo vệ bằng RLS + đăng nhập),
// nên để sẵn giá trị mặc định: Netlify build được luôn mà không cần khai báo biến môi trường.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://fllzsidrsjzxwbdolgdg.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_c0qnJRVdJMB4uxIfaZjjDg_Fr02yAl1'

export const isConfigured = Boolean(url && key)

// Có lệnh ghi dữ liệu (thêm / sửa / xóa / gọi hàm) → làm cũ bộ nhớ tạm để lần đọc sau lấy số mới
async function trackedFetch(input, init) {
  const res = await fetch(input, init)
  const method = (init?.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && String(input?.url || input).includes('/rest/')) invalidateCache()
  return res
}

// persistSession: lưu đăng nhập trong máy, chỉ mất khi bấm "Đăng xuất"
export const supabase = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: trackedFetch } })
  : null

export const ADMIN_USERNAME = 'admin'
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@suahat.app'

// Supabase trả tối đa 1000 dòng mỗi lần → lấy từng trang cho đủ.
// `build` tạo câu truy vấn mới mỗi lần gọi, nên có .order() để thứ tự không đổi giữa các trang.
export async function fetchAll(build) {
  const size = 1000
  let out = []
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) return { data: null, error }
    out = out.concat(data)
    if (data.length < size) return { data: out, error: null }
  }
}

export async function getSetting(key, fallback) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle()
  return data?.value ?? fallback
}

export async function setSetting(key, value) {
  const { error } = await supabase.from('settings').upsert({ key, value })
  return !showError(error)
}

export function showError(error) {
  if (!error) return false
  console.error(error)
  alert('Có lỗi: ' + (error.message || error))
  return true
}
