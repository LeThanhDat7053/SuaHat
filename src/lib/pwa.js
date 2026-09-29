import { registerSW } from 'virtual:pwa-register'

const CHECK_MS = 60 * 1000 // 1 phút kiểm tra bản mới một lần

// Đang gõ dở hoặc đang mở form thì chưa tải lại, kẻo mất nội dung đang nhập
function safeToReload() {
  if (document.querySelector('.modal-backdrop')) return false
  const el = document.activeElement
  return !el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

function banner(onClick) {
  if (document.getElementById('update-banner')) return
  const b = document.createElement('button')
  b.id = 'update-banner'
  b.className = 'update-banner'
  b.textContent = '✨ Đã có bản mới — bấm để cập nhật'
  b.onclick = onClick
  document.body.appendChild(b)
}

export function setupUpdates() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // tải lại ngay nếu đang không nhập liệu, nếu không thì hiện nút để bấm khi rảnh
      if (safeToReload()) updateSW(true)
      else banner(() => updateSW(true))
    },
    onRegisteredSW(url, reg) {
      if (!reg) return
      const check = () => reg.update().catch(() => {})
      setInterval(check, CHECK_MS)
      // mở lại app từ màn hình chính (không tải lại trang) → kiểm tra luôn
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      window.addEventListener('online', check)
    },
  })
}
