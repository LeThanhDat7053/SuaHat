export const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ'

export const num = (n, digits = 2) =>
  (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: digits })

// 1.250.000 → "1,25tr", 85.000 → "85k"
export function moneyShort(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return num(v / 1e6, 1) + 'tr'
  if (Math.abs(v) >= 1e3) return num(v / 1e3, 0) + 'k'
  return num(v, 0)
}

export function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayStr = () => toDateStr(new Date())

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s, n) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export const fmtDate = (s) =>
  parseDate(s).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

export const fmtDateLong = (s) =>
  parseDate(s).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })

// "2026-09" → { from: "2026-09-01", to: "2026-09-30" }
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  return { from: toDateStr(new Date(y, m - 1, 1)), to: toDateStr(new Date(y, m, 0)) }
}

export const thisMonth = () => todayStr().slice(0, 7)

// Kỳ xem báo cáo: 'day' | 'week' | 'month'. Tuần tính từ thứ 2 đến chủ nhật.
export function periodRange(mode, date) {
  if (mode === 'day') return { from: date, to: date }
  if (mode === 'week') {
    const from = addDays(date, -((parseDate(date).getDay() + 6) % 7))
    return { from, to: addDays(from, 6) }
  }
  return monthRange(date.slice(0, 7))
}

export function shiftPeriod(mode, date, dir) {
  if (mode === 'day') return addDays(date, dir)
  if (mode === 'week') return addDays(date, 7 * dir)
  const d = parseDate(date.slice(0, 7) + '-01')
  d.setMonth(d.getMonth() + dir)
  return toDateStr(d)
}

const dm = (s) => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}`

export function periodLabel(mode, date) {
  const { from, to } = periodRange(mode, date)
  const t = todayStr()
  const current = from <= t && t <= to
  if (mode === 'day') return current ? 'Hôm nay' : fmtDateLong(date)
  if (mode === 'week') return `${current ? 'Tuần này' : 'Tuần'} ${dm(from)} – ${dm(to)}`
  return `${current ? 'Tháng này' : 'Tháng'} ${Number(date.slice(5, 7))}/${date.slice(0, 4)}`
}

// Đơn vị lớn để mua / báo giá: 1 kg = 1000 g, 1 lít = 1000 ml
export const BIG_UNIT = { g: 'kg', ml: 'lít' }

// Giá 1 đơn vị nhỏ có thể lẻ (vd 0,93đ/ml) nên giữ 2 số thập phân
export const unitMoney = (n) => num(n, 2) + 'đ'

// 5000 g → "5 kg", 250 g → "250 g"
export function fmtQty(q, unit) {
  const big = BIG_UNIT[unit]
  // so sau khi làm tròn: 999,999 g hiện là "1 kg" chứ không phải "1.000 g"
  if (big && Math.abs(Math.round(q * 100) / 100) >= 1000) return `${num(q / 1000, 3)} ${big}`
  return `${num(q)} ${unit}`
}

// giá theo đơn vị lớn nếu có: 280đ/g → "280.000đ/kg"
export function unitPrice(price, unit) {
  const big = BIG_UNIT[unit]
  return big ? `${money(price * 1000)}/${big}` : `${unitMoney(price)}/${unit}`
}

export const fmtTime = (t) => (t ? t.slice(0, 5) : '')
