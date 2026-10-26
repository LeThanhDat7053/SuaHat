import { countLoss } from './stock'
import { saleCost, saleRevenue, soldQty } from './cost'
import { addDays, daysBetween, monthRange, periodRange, todayStr } from './format'

// Các phép tính của trang Tổng quan (tách riêng để có test tự động)

export function presetRange(key, t = todayStr()) {
  if (key === 'today') return { from: t, to: t }
  if (key === 'yesterday') return { from: addDays(t, -1), to: addDays(t, -1) }
  if (key === 'week') return { from: periodRange('week', t).from, to: t }
  if (key === 'lastweek') return periodRange('week', addDays(t, -7))
  if (key === 'month') return { from: monthRange(t.slice(0, 7)).from, to: t }
  const firstThis = monthRange(t.slice(0, 7)).from
  return monthRange(addDays(firstThis, -1).slice(0, 7))
}

// Kỳ trước để so sánh:
// - trong 1 tuần, bắt đầu thứ 2 ("Tuần này") → cùng các thứ của tuần trước (T2–T6 so với T2–T6)
// - trong 1 tháng, bắt đầu ngày 1 ("Tháng này") → cùng các ngày của tháng trước (1–17 so với 1–17)
// - còn lại: kỳ liền trước, cùng số ngày
export function prevRange({ from, to }) {
  const n = daysBetween(from, to).length
  if (periodRange('week', from).from === from && n <= 7) return { from: addDays(from, -7), to: addDays(to, -7) }
  if (from.slice(8) === '01' && from.slice(0, 7) === to.slice(0, 7)) {
    const last = monthRange(addDays(from, -1).slice(0, 7))
    const to2 = `${last.from.slice(0, 8)}${to.slice(8)}`
    // trọn tháng (VD "Tháng trước") → so trọn tháng trước nữa
    const full = to === monthRange(to.slice(0, 7)).to
    return { from: last.from, to: full || to2 > last.to ? last.to : to2 }
  }
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

export const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0)

// Hao hụt kiểm kê: chỉ tính phần THIẾU. Dư không cộng tiền (kẻo lãi bị ảo).
// Kiểm kê nhầm thì xóa lần đó ở Lịch sử kiểm kê ("Nhập sai") để gỡ tiền.
export const shrinkOf = (counts) => sum(counts, countLoss)

// Tiền mua nguyên liệu "Tính 1 lần lúc mua" (sữa đặc, đường…): trừ thẳng vào lãi kỳ mua
export const directBuy = (purchases) => sum(purchases, (r) => (r.ingredients?.cost_on_buy && !r.ingredients?.no_stock ? Number(r.total) : 0))

export function summarize(sales, waste) {
  const revenue = sum(sales, saleRevenue)
  const cogs = sum(sales, saleCost)
  const wasteCost = sum(waste, (r) => r.quantity * r.unit_cost)
  // bán sỉ: tính doanh thu / giá vốn nhưng không tính vào số phần (kẻo độn số bán lẻ)
  const cups = sum(sales, soldQty)
  const ws = sales.filter((r) => r.wholesale)
  const wsQty = sum(ws, (r) => r.quantity)
  const wsRevenue = sum(ws, saleRevenue)
  const wsGross = wsRevenue - sum(ws, saleCost)
  return { revenue, cogs, wasteCost, cups, wsQty, wsRevenue, wsGross, gross: revenue - cogs - wasteCost }
}

// Lãi ròng, tiền còn lại, điểm hòa vốn của 1 kỳ (`days` = số ngày của kỳ)
export function profitReport({ sales, purchases, expenses, waste, counts }, days) {
  const cur = summarize(sales, waste)
  const bought = sum(purchases, (r) => Number(r.total))
  const other = sum(expenses, (r) => Number(r.amount))
  const shrink = shrinkOf(counts)
  const direct = directBuy(purchases)
  // lãi mỗi phần bán lẻ (bỏ phần bán sỉ ra); tiền lãi từ bán sỉ bù bớt chi phí khi tính điểm hòa vốn
  const perCup = cur.cups ? (cur.gross - cur.wsGross) / cur.cups : 0
  return {
    cur,
    bought,
    other,
    shrink,
    direct,
    net: cur.gross - shrink - other - direct,
    cash: cur.revenue - bought - other,
    perCup,
    needPerDay: perCup > 0 ? Math.max(0, other + direct - cur.wsGross) / perCup / days : 0,
    soldPerDay: cur.cups / days,
  }
}
