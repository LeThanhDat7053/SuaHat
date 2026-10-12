// Thông báo nhỏ hiện vài giây rồi tự tắt (thay cho hộp alert đen của trình duyệt).
// Cùng 1 nội dung đang hiện thì không chồng thêm, chỉ kéo dài thời gian.

const SHOW_MS = 4500
const shown = new Map() // nội dung → { el, timer }

function box() {
  let el = document.getElementById('toasts')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toasts'
    el.className = 'toasts'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  return el
}

function close(text) {
  const t = shown.get(text)
  if (!t) return
  shown.delete(text)
  clearTimeout(t.timer)
  t.el.classList.add('out')
  setTimeout(() => t.el.remove(), 200)
}

// tone: 'error' | 'warn' | 'good'
export function toast(text, tone = 'error') {
  const old = shown.get(text)
  if (old) {
    clearTimeout(old.timer)
    old.timer = setTimeout(() => close(text), SHOW_MS)
    return
  }
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `toast toast-${tone}`
  el.textContent = text
  el.title = 'Bấm để tắt'
  el.onclick = () => close(text)
  box().appendChild(el)
  shown.set(text, { el, timer: setTimeout(() => close(text), SHOW_MS) })
}
