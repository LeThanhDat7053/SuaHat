import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb } from './fakeDb'

let fake
vi.mock('../src/lib/supabase', () => ({
  get supabase() {
    return fake.supabase
  },
  fetchAll: (b) => fake.fetchAll(b),
  getSetting: async (_k, f) => f,
}))

const { loadStock, countLoss } = await import('../src/lib/stock')

// Kho mẫu:
//  Kiểm kê cuối ngày 01/10 (bấm lưu lúc 20:00): điều 2.000g, đường 1.000g, chai 50 cái. Nước "nhà có" không kiểm kê.
//  Món Sữa điều 500ml: mẻ 10 lít (1.000g điều, 300g đường, 9 lít nước) + 1 chai
//    → mỗi phần 50g điều, 15g đường, 1 chai.
function tables() {
  return {
    ingredients: [
      { id: 1, name: 'Hạt điều', unit: 'g' },
      { id: 2, name: 'Đường', unit: 'g' },
      { id: 3, name: 'Nước', unit: 'ml', no_stock: true },
      { id: 4, name: 'Chai', unit: 'cái' },
    ],
    products: [{ id: 7, name: 'Sữa điều', recipe_id: 10, volume_ml: 500, recipe: [{ ingredient_id: 4, amount: 1 }] }],
    recipes: [{ id: 10, yield_ml: 10000, items: [{ ingredient_id: 1, amount: 1000 }, { ingredient_id: 2, amount: 300 }, { ingredient_id: 3, amount: 9000 }] }],
    stock_counts: [
      { id: 1, ingredient_id: 1, date: '2026-10-01', counted: 2000, created_at: '2026-10-01T20:00:00Z' },
      { id: 2, ingredient_id: 2, date: '2026-10-01', counted: 1000, created_at: '2026-10-01T20:00:00Z' },
      { id: 3, ingredient_id: 4, date: '2026-10-01', counted: 50, created_at: '2026-10-01T20:00:00Z' },
    ],
    purchases: [
      // nhập TRƯỚC lúc lưu kiểm kê → đã nằm trong số đếm, không cộng
      { id: 1, ingredient_id: 1, date: '2026-10-01', quantity: 500, created_at: '2026-10-01T10:00:00Z' },
      // nhập sau kiểm kê → cộng
      { id: 2, ingredient_id: 1, date: '2026-10-02', quantity: 1000, created_at: '2026-10-02T08:00:00Z' },
      // đánh dấu "đã nằm trong số kiểm kê" → không cộng
      { id: 3, ingredient_id: 2, date: '2026-10-02', quantity: 500, created_at: '2026-10-02T08:00:00Z', in_count: true },
      { id: 4, ingredient_id: 4, date: '2026-10-03', quantity: 20, created_at: '2026-10-03T08:00:00Z' },
    ],
    sales: [
      // bán trong ngày kiểm kê → đã nằm trong số đếm, không trừ
      { id: 1, product_id: 7, date: '2026-10-01', quantity: 10, gift_qty: 0, usage: null },
      // dòng cũ chưa chốt lượng (usage null) → theo công thức: 4 bán + 1 tặng = 5 phần
      { id: 2, product_id: 7, date: '2026-10-02', quantity: 4, gift_qty: 1, usage: null },
      // đã chốt lượng lúc bán (công thức cũ 40g điều / phần) → dùng số đã chốt, không theo công thức mới
      { id: 3, product_id: 7, date: '2026-10-03', quantity: 2, gift_qty: 0, usage: { 1: 40, 4: 1 } },
    ],
    waste: [{ id: 1, product_id: 7, date: '2026-10-03', quantity: 1, usage: null }],
  }
}

beforeEach(() => {
  fake = createFakeDb(tables())
})

describe('loadStock — tồn kho', () => {
  it('tính đúng từng nguyên liệu', async () => {
    const { stock } = await loadStock()
    // điều: 2.000 + 1.000 − 5 × 50 − 2 × 40 − 1 × 50 = 2.620
    expect(stock[1]).toBe(2620)
    // đường: 1.000 − 5 × 15 − 0 (dòng đã chốt không có đường) − 1 × 15 = 910
    expect(stock[2]).toBe(910)
    // chai: 50 + 20 − 5 − 2 − 1 = 62
    expect(stock[4]).toBe(62)
    // nước nhà có: không trừ
    expect(stock[3]).toBe(0)
  })

  it('xem tồn kho tới 1 ngày (dùng khi kiểm kê lùi ngày)', async () => {
    const { stock } = await loadStock('2026-10-02')
    expect(stock[1]).toBe(2000 + 1000 - 250)
    expect(stock[4]).toBe(50 - 5) // chai nhập ngày 03/10 chưa tính
  })

  it('nguyên liệu chưa kiểm kê lần nào: tính từ 0, cộng mọi lần nhập', async () => {
    fake.db.stock_counts = fake.db.stock_counts.filter((c) => c.ingredient_id !== 4)
    const { stock } = await loadStock()
    // 0 + 20 − 5 − 2 − 1 (cả dòng bán ngày 01/10: 10 phần, vì chai chưa từng kiểm kê) − 10
    expect(stock[4]).toBe(20 - 5 - 2 - 1 - 10)
    // nguyên liệu khác vẫn như cũ
    expect(stock[1]).toBe(2620)
  })

  it('kiểm kê lần sau thay số lần trước', async () => {
    fake.db.stock_counts.push({ id: 9, ingredient_id: 1, date: '2026-10-02', counted: 3000, created_at: '2026-10-02T21:00:00Z' })
    const { stock } = await loadStock()
    // 3.000 (đếm cuối ngày 02/10, đã gồm hàng nhập sáng 02/10) − 80 − 50
    expect(stock[1]).toBe(2870)
  })

  it('database chưa chạy nâng cấp v8 (chưa có cột usage / in_count) vẫn tính được', async () => {
    fake = createFakeDb(tables(), { missing: ['sales.usage', 'waste.usage', 'purchases.in_count'] })
    const { stock } = await loadStock()
    // không đọc được số đã chốt → mọi dòng theo công thức hiện tại: 5 + 2 + 1 = 8 phần × 50g
    expect(stock[1]).toBe(2000 + 1000 - 8 * 50)
    // không biết phiếu nào "đã nằm trong kiểm kê" → phiếu đường 500g được cộng
    expect(stock[2]).toBe(1000 + 500 - 8 * 15)
  })
})

describe('countLoss — tiền hao hụt 1 lần kiểm kê', () => {
  it('thiếu 100g × 300đ = 30.000đ', () => expect(countLoss({ expected: 1000, counted: 900, unit_price: 300 })).toBe(30000))
  it('dư thì không cộng tiền', () => expect(countLoss({ expected: 1000, counted: 1100, unit_price: 300 })).toBe(0))
  it('số dạng chữ từ database', () => expect(countLoss({ expected: '10', counted: '7', unit_price: '2000' })).toBe(6000))
})
