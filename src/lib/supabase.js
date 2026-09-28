import { createClient } from '@supabase/supabase-js'

// Publishable key được thiết kế để công khai trên web (dữ liệu được bảo vệ bằng RLS + đăng nhập),
// nên để sẵn giá trị mặc định: Netlify build được luôn mà không cần khai báo biến môi trường.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://fllzsidrsjzxwbdolgdg.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_c0qnJRVdJMB4uxIfaZjjDg_Fr02yAl1'

export const isConfigured = Boolean(url && key)

// persistSession: lưu đăng nhập trong máy, chỉ mất khi bấm "Đăng xuất"
export const supabase = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

export const ADMIN_USERNAME = 'admin'
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@suahat.app'

export function showError(error) {
  if (!error) return false
  console.error(error)
  alert('Có lỗi: ' + (error.message || error))
  return true
}
