import { supabase } from './supabase'
import { fmtTime, parseDate } from './format'
import { orderItemsText } from './orders'

// Các mức "báo trước giờ giao" hay dùng (phút)
export const BEFORE_OPTIONS = [
  [15, '15 phút'],
  [30, '30 phút'],
  [60, '1 tiếng'],
  [120, '2 tiếng'],
  [1440, '1 ngày'],
]

// Date → "2026-10-02T14:30" cho ô <input type="datetime-local">
export function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Giờ giao của đơn (theo giờ máy), không có giờ giao thì null
export function orderDue(date, time) {
  if (!date || !time) return null
  const d = parseDate(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

// Giá trị form báo thức từ 1 đơn / ghi chú đã lưu
export function reminderForm(rec, defaultAt) {
  if (!rec?.remind_at) return { mode: 'off', before: 30, at: defaultAt }
  if (rec.remind_before != null) return { mode: 'before', before: rec.remind_before, at: defaultAt }
  return { mode: 'at', before: 30, at: toLocalInput(new Date(rec.remind_at)) }
}

// Form → các cột lưu vào database. Trả về { error } nếu chưa đủ thông tin.
export function reminderPayload(form, rec, due) {
  let remind_at = null
  let remind_before = null
  if (form.mode === 'before') {
    if (!due) return { error: 'Muốn báo trước giờ giao thì cần chọn giờ giao' }
    remind_before = Number(form.before)
    remind_at = new Date(due.getTime() - remind_before * 60000).toISOString()
  } else if (form.mode === 'at') {
    if (!form.at) return { error: 'Chọn giờ báo thức' }
    remind_at = new Date(form.at).toISOString()
  }
  const changed = !rec?.remind_at || !remind_at || new Date(rec.remind_at).getTime() !== new Date(remind_at).getTime()
  const out = { remind_at, remind_before }
  // đổi giờ báo → báo lại từ đầu và bật lại
  if (changed) Object.assign(out, { reminded_at: null, remind_off: false })
  return { payload: out }
}

export const fmtRemind = (iso) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', weekday: 'short', day: '2-digit', month: '2-digit' })

// Báo thức chưa bấm "Đã biết" (kể cả đang tắt nếu includeOff), của đơn còn chờ giao và ghi chú.
// Bỏ qua những cái đã quá hạn hơn 2 ngày.
export async function loadReminders({ includeOff = false } = {}) {
  const since = new Date(Date.now() - 2 * 86400000).toISOString()
  const base = (table, cols) => {
    let q = supabase.from(table).select(cols).not('remind_at', 'is', null).is('reminded_at', null).gte('remind_at', since).order('remind_at')
    if (!includeOff) q = q.eq('remind_off', false)
    return q
  }
  const [o, n] = await Promise.all([
    base('orders', '*').eq('status', 'pending'),
    base('notes', '*'),
  ])
  if (o.error || n.error) throw o.error || n.error
  return [
    ...o.data.map((r) => ({
      table: 'orders',
      id: r.id,
      date: r.order_date,
      title: `Đơn ${r.customer}${r.order_time ? ` · giao ${fmtTime(r.order_time)}` : ''}`,
      body: orderItemsText(r) || r.note || '',
      remind_at: r.remind_at,
      remind_before: r.remind_before,
      remind_off: r.remind_off,
    })),
    ...n.data.map((r) => ({
      table: 'notes',
      id: r.id,
      date: r.date,
      title: 'Ghi chú',
      body: r.content,
      remind_at: r.remind_at,
      remind_before: null,
      remind_off: r.remind_off,
    })),
  ].sort((a, b) => a.remind_at.localeCompare(b.remind_at))
}

// Báo cho bộ canh báo thức tải lại ngay sau khi sửa
export const remindersChanged = () => window.dispatchEvent(new Event('reminders-changed'))

export async function updateReminder(item, patch) {
  const { error } = await supabase.from(item.table).update(patch).eq('id', item.id)
  if (!error) remindersChanged()
  return error
}

export const dismissReminder = (item) => updateReminder(item, { reminded_at: new Date().toISOString() })
export const snoozeReminder = (item, minutes) =>
  updateReminder(item, { remind_at: new Date(Date.now() + minutes * 60000).toISOString(), remind_before: null, reminded_at: null })
export const setReminderOff = (item, off) => updateReminder(item, { remind_off: off })

// ---------- Thông báo trên máy ----------
export const canNotify = () => typeof Notification !== 'undefined'

export async function askNotifyPermission() {
  if (!canNotify() || Notification.permission !== 'default') return canNotify() && Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export async function systemNotify(item) {
  if (!canNotify() || Notification.permission !== 'granted') return
  const opts = { body: item.body, tag: `${item.table}-${item.id}`, renotify: true, requireInteraction: true, icon: '/pwa-192.png', data: { url: `/lich?ngay=${item.date}` } }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return await reg.showNotification(`⏰ ${item.title}`, opts)
    new Notification(`⏰ ${item.title}`, opts)
  } catch (e) {
    console.error(e)
  }
}

// Tiếng "bíp bíp" ngắn, không cần file âm thanh
export function beep(times = 3) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + i * 0.45
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.32)
    }
    setTimeout(() => ctx.close(), times * 450 + 500)
  } catch {
    /* máy không hỗ trợ âm thanh */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300])
}
