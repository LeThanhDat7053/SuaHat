import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: null, getSetting: async (_k, f) => f, fetchAll: async () => ({ data: [] }) }))

const { presetRange, prevRange, profitReport, summarize } = await import('../src/lib/report')
const { addDays, monthRange, periodRange } = await import('../src/lib/format')

describe('Ngày tháng', () => {
  it('addDays qua tháng, qua năm, năm nhuận', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('tuần tính từ thứ 2 đến chủ nhật', () => {
    expect(periodRange('week', '2026-10-28')).toEqual({ from: '2026-10-26', to: '2026-11-01' }) // thứ 4
    expect(periodRange('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' }) // chủ nhật
  })
  it('tháng 2', () => expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' }))
})

describe('Kỳ xem báo cáo (hôm nay là thứ 4, 28/10/2026)', () => {
  const t = '2026-10-28'
  it.each([
    ['today', { from: t, to: t }],
    ['yesterday', { from: '2026-10-27', to: '2026-10-27' }],
    ['week', { from: '2026-10-26', to: t }],
    ['lastweek', { from: '2026-10-19', to: '2026-10-25' }],
    ['month', { from: '2026-10-01', to: t }],
    ['lastmonth', { from: '2026-09-01', to: '2026-09-30' }],
  ])('%s', (key, want) => expect(presetRange(key, t)).toEqual(want))
})

describe('Kỳ trước để so sánh', () => {
  it('tuần này T2–T4 → T2–T4 tuần trước', () => expect(prevRange({ from: '2026-10-26', to: '2026-10-28' })).toEqual({ from: '2026-10-19', to: '2026-10-21' }))
  it('tháng này 1–28 → 1–28 tháng trước', () => expect(prevRange({ from: '2026-10-01', to: '2026-10-28' })).toEqual({ from: '2026-09-01', to: '2026-09-28' }))
  it('trọn tháng 3 → trọn tháng 2', () => expect(prevRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' }))
  it('1–30/3 → tháng 2 chỉ tới 28', () => expect(prevRange({ from: '2026-03-01', to: '2026-03-30' })).toEqual({ from: '2026-02-01', to: '2026-02-28' }))
  it('tự chọn 5 ngày (T7–T4) → 5 ngày liền trước', () => expect(prevRange({ from: '2026-10-10', to: '2026-10-14' })).toEqual({ from: '2026-10-05', to: '2026-10-09' }))
})

// Số mẫu tính tay:
//  A: bán lẻ 10 ly × 25.000, giảm 10.000, tặng 1, vốn 9.000 → thu 240.000, vốn (10+1) × 9.000 = 99.000
//  B: bán sỉ 4 × 20.000, vốn 9.000                         → thu  80.000, vốn 36.000
//  C: 2 chai × 28.000, vốn 11.500                          → thu  56.000, vốn 23.000
//  Hủy 2 phần × 9.000 = 18.000
const sales = [
  { date: '2026-10-01', quantity: 10, gift_qty: 1, unit_price: 25000, unit_cost: 9000, discount: 10000 },
  { date: '2026-10-01', quantity: 4, unit_price: 20000, unit_cost: 9000, wholesale: true },
  { date: '2026-10-02', quantity: 2, unit_price: '28000', unit_cost: '11500', pack: 'chai' },
]
const waste = [{ quantity: 2, unit_cost: 9000 }]

describe('summarize — doanh thu, giá vốn, lãi gộp', () => {
  const s = summarize(sales, waste)
  it('doanh thu 376.000', () => expect(s.revenue).toBe(376000))
  it('giá vốn 158.000 (tính cả phần tặng)', () => expect(s.cogs).toBe(158000))
  it('hàng hủy 18.000', () => expect(s.wasteCost).toBe(18000))
  it('lãi gộp = 376.000 − 158.000 − 18.000 = 200.000', () => expect(s.gross).toBe(200000))
  it('số phần bán lẻ 12 (không tính 4 phần sỉ)', () => expect(s.cups).toBe(12))
  it('bán sỉ: 4 phần, thu 80.000, lãi 44.000', () => {
    expect(s.wsQty).toBe(4)
    expect(s.wsRevenue).toBe(80000)
    expect(s.wsGross).toBe(44000)
  })
})

describe('profitReport — lãi ròng, tiền còn lại', () => {
  const r = profitReport(
    {
      sales,
      waste,
      // đi chợ 300.000 (nhập kho) + sữa đặc 50.000 (tính lúc mua) + rau nhà có 20.000 (không tính lúc mua)
      purchases: [{ total: 300000, ingredients: {} }, { total: '50000', ingredients: { cost_on_buy: true } }, { total: 20000, ingredients: { cost_on_buy: true, no_stock: true } }],
      expenses: [{ amount: 30000 }, { amount: '20000' }],
      // kiểm kê: điều thiếu 100g × 300 = 30.000 ; đường dư 100g → không cộng tiền
      counts: [
        { expected: 1000, counted: 900, unit_price: 300 },
        { expected: 500, counted: 600, unit_price: 20 },
      ],
    },
    2,
  )
  it('tiền đi chợ 370.000', () => expect(r.bought).toBe(370000))
  it('nguyên liệu tính lúc mua 50.000 (bỏ hàng nhà có)', () => expect(r.direct).toBe(50000))
  it('chi phí khác 50.000', () => expect(r.other).toBe(50000))
  it('hao hụt chỉ tính phần thiếu: 30.000', () => expect(r.shrink).toBe(30000))
  it('lãi ròng = 200.000 − 30.000 − 50.000 − 50.000 = 70.000', () => expect(r.net).toBe(70000))
  it('tiền còn lại = 376.000 − 370.000 − 50.000 = −44.000', () => expect(r.cash).toBe(-44000))
  it('lãi mỗi ly lẻ = (200.000 − 44.000) / 12 = 13.000', () => expect(r.perCup).toBe(13000))
  it('hòa vốn: (50.000 + 50.000 − 44.000) / 13.000 / 2 ngày ≈ 2,15 ly/ngày', () => expect(r.needPerDay).toBeCloseTo(56000 / 13000 / 2, 10))
  it('bán trung bình 6 ly/ngày', () => expect(r.soldPerDay).toBe(6))
  it('không bán được ly nào → không chia cho 0', () => {
    const z = profitReport({ sales: [], waste: [], purchases: [], expenses: [{ amount: 1000 }], counts: [] }, 1)
    expect(z.perCup).toBe(0)
    expect(z.needPerDay).toBe(0)
    expect(z.net).toBe(-1000)
  })
})
