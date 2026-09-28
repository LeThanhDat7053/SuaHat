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

export const fmtTime = (t) => (t ? t.slice(0, 5) : '')
