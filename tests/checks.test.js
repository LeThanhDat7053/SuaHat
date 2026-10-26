import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: null, fetchAll: async () => ({ data: [] }), getSetting: async (_k, f) => f, getSettingStrict: async (_k, f) => f }))
vi.mock('../src/lib/live', () => ({ notifyChange: () => {} }))

const { findIssues } = await import('../src/lib/checks')

// Quán "khỏe": mọi thứ đủ → không có vấn đề nào
function healthy() {
  return {
    today: '2026-10-26',
    ingredients: [
      { id: 1, name: 'Hạt điều', unit: 'g', price_per_unit: 300 },
      { id: 4, name: 'Chai', unit: 'cái', price_per_unit: 2000 },
      { id: 3, name: 'Nước', unit: 'ml', price_per_unit: 0, no_stock: true },
    ],
    recipes: [{ id: 10, name: 'Mẻ điều', yield_ml: 10000, items: [{ ingredient_id: 1, amount: 1000 }, { ingredient_id: 3, amount: 9000 }] }],
    products: [{ id: 7, name: 'Sữa điều', price: 25000, active: true, recipe_id: 10, volume_ml: 500, recipe: [{ ingredient_id: 4, amount: 1 }] }],
    stock: { 1: 500, 4: 10, 3: 0 },
    lastCount: { 1: { date: '2026-10-01' }, 4: { date: '2026-10-01' } },
    chaiDef: { surcharge: 3000, cost: 2500 },
    sales: [
      { id: 1, date: '2026-10-20', product_id: 7, product_name: 'Sữa điều (Ly)', source: 'quick:5:ly', pack: 'ly', quantity: 2, unit_price: 25000, unit_cost: 17000 },
      { id: 2, date: '2026-10-21', product_id: 7, product_name: 'Sữa điều (Ly)', source: 'order:12:chai', pack: 'chai', quantity: 1, unit_price: 28000, unit_cost: 19500 },
    ],
    quickDone: [{ id: 5, date: '2026-10-20', note: 'Chị Lan', total: 50000, lines: [{ qty: 2 }] }],
    quickStale: [],
    ordersDone: [{ id: 12, customer: 'Anh Tú', order_date: '2026-10-21', total: 28000, lines: [{ qty: 1 }] }],
    ordersStale: [],
    upgrades: [{ file: 'nang-cap-v10.sql', what: 'x', ok: true }],
    outbox: [],
  }
}
const ids = (d) => findIssues(d).map((i) => i.id)
const issue = (d, id) => findIssues(d).find((i) => i.id === id)

describe('Kiểm tra số liệu', () => {
  it('quán đủ dữ liệu → không báo gì', () => expect(findIssues(healthy())).toEqual([]))

  it('đơn đã giao mà không có dòng bán → báo mất doanh thu (không nhầm đơn 1 với đơn 12)', () => {
    const d = healthy()
    d.ordersDone.push({ id: 1, customer: 'Cô Ba', order_date: '2026-10-22', total: 75000, lines: [{ qty: 3 }] })
    d.quickDone.push({ id: 51, date: '2026-10-22', note: '', total: 25000, lines: [{ qty: 1 }] }) // có quick:5 nhưng không có quick:51
    const i = issue(d, 'lost-revenue')
    expect(i.level).toBe('error')
    expect(i.items.map((x) => x.key)).toEqual(['o1', 'q51'])
  })

  it('đơn đã xong nhưng không có món (đơn cũ ghi chữ) → không báo', () => {
    const d = healthy()
    d.ordersDone.push({ id: 2, customer: 'X', order_date: '2026-10-22', total: 0, lines: [] })
    expect(ids(d)).not.toContain('lost-revenue')
  })

  it('món chưa có công thức → báo; món chỉ có chi phí phụ thì không', () => {
    const d = healthy()
    d.products.push({ id: 8, name: 'Nước cam', price: 20000, active: true, recipe: [] })
    d.products.push({ id: 9, name: 'Bánh', price: 15000, active: true, recipe: [], extra_cost: 8000 })
    d.products.push({ id: 10, name: 'Món ẩn', price: 15000, active: false, recipe: [] })
    expect(issue(d, 'no-recipe').items.map((x) => x.text)).toEqual(['Nước cam'])
  })

  it('mẻ thiếu số ml / món thiếu dung tích', () => {
    const d = healthy()
    d.recipes.push({ id: 11, name: 'Mẻ óc chó', yield_ml: 0, items: [{ ingredient_id: 1, amount: 500 }] })
    d.products.push({ id: 20, name: 'Sữa óc chó', price: 30000, active: true, recipe_id: 11, volume_ml: 500, recipe: [{ ingredient_id: 4, amount: 1 }] })
    d.products.push({ id: 21, name: 'Sữa điều 1L', price: 50000, active: true, recipe_id: 10, volume_ml: 0, recipe: [{ ingredient_id: 4, amount: 1 }] })
    expect(issue(d, 'batch-yield').items.map((x) => x.text)).toEqual(['Sữa óc chó', 'Sữa điều 1L'])
  })

  it('nguyên liệu dùng trong món mà chưa có giá → báo; "nhà có" thì không', () => {
    const d = healthy()
    d.ingredients[0].price_per_unit = 0
    const i = issue(d, 'no-price')
    expect(i.items.map((x) => x.text)).toEqual(['Hạt điều'])
    expect(i.items[0].note).toBe('dùng trong Sữa điều')
  })

  it('món bán dưới giá vốn', () => {
    const d = healthy()
    d.products[0].price = 15000 // vốn 15.000 + 2.000 chai = 17.000
    expect(issue(d, 'loss').items[0].note).toBe('bán 15.000đ · vốn 17.000đ')
  })

  it('dòng bán giá vốn 0đ: gom theo món + Ly/Chai, tính đúng phần lãi bị báo cao (gồm phần tặng)', () => {
    const d = healthy()
    d.sales.push({ id: 3, date: '2026-10-22', product_id: 7, product_name: 'Sữa điều', source: '', pack: '', quantity: 3, gift_qty: 1, unit_price: 25000, unit_cost: 0 })
    d.sales.push({ id: 4, date: '2026-10-23', product_id: 7, product_name: 'Sữa điều (Chai)', source: 'quick:6:chai', pack: 'chai', quantity: 2, unit_price: 28000, unit_cost: '0' })
    const i = issue(d, 'zero-cost')
    // Ly: 4 phần × 17.000 ; Chai: 2 × (17.000 + 2.500)
    expect(i.items).toMatchObject([
      { key: '7:ly', ids: [3], cost: 17000, note: 'lãi đang bị báo cao ≈ 68.000đ' },
      { key: '7:chai', ids: [4], cost: 19500, note: 'lãi đang bị báo cao ≈ 39.000đ' },
    ])
  })

  it('tồn kho âm, chưa kiểm kê (bỏ qua nguyên liệu "nhà có")', () => {
    const d = healthy()
    d.stock[1] = -120
    d.ingredients.push({ id: 5, name: 'Đường', unit: 'g', price_per_unit: 20 })
    d.stock[5] = 300
    expect(issue(d, 'negative-stock').items[0]).toMatchObject({ text: 'Hạt điều', note: 'còn -120 g' })
    expect(issue(d, 'never-counted').items.map((x) => x.text)).toEqual(['Đường'])
  })

  it('chưa chạy file nâng cấp, hàng chờ lỗi / đang chờ; xếp lỗi trước, "để biết" sau', () => {
    const d = healthy()
    d.upgrades.push({ file: 'nang-cap-v9.sql', what: 'Bán sỉ', ok: false })
    d.outbox = [
      { id: 'a', type: 'sale', date: '2026-10-26', product_id: 7, row: { product_name: 'Sữa điều' } },
      { id: 'b', type: 'quick-new', order: { note: 'Chị Lan', total: 50000, date: '2026-10-26' }, rows: null, error: 'Cần chạy file v10' },
    ]
    d.ingredients.push({ id: 5, name: 'Đường', unit: 'g', price_per_unit: 20 })
    d.products[0].price = 15000
    expect(ids(d)).toEqual(['upgrade', 'outbox-failed', 'loss', 'outbox-waiting', 'never-counted'])
    expect(issue(d, 'outbox-failed').items[0].note).toBe('Cần chạy file v10')
  })
})
