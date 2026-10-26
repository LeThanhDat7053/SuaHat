import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: null, getSetting: async (_k, f) => f, fetchAll: async () => ({ data: [] }) }))

const { addLines, chaiExtraCost, chaiSurcharge, linesProfit, linesTotal, packCost, packPrice, packQty, variantText, variantsText } = await import('../src/lib/quick')

const def = { surcharge: 3000, cost: 2500 }
const p = { id: 1, name: 'Sữa điều', price: 25000 }

describe('Giá Ly / Chai', () => {
  it('Ly = giá món', () => expect(packPrice(p, 'ly', def)).toBe(25000))
  it('Chai = giá món + phụ thu chung 3.000', () => expect(packPrice(p, 'chai', def)).toBe(28000))
  it('món đặt phụ thu riêng 5.000 → dùng mức riêng', () => expect(packPrice({ ...p, chai_surcharge: 5000 }, 'chai', def)).toBe(30000))
  it('món đặt phụ thu riêng = 0 → không phụ thu (0 không bị coi là "để trống")', () => {
    expect(chaiSurcharge({ ...p, chai_surcharge: 0 }, def)).toBe(0)
    expect(chaiExtraCost({ ...p, chai_cost: 0 }, def)).toBe(0)
  })
  it('để trống ("" hoặc null) → dùng mức chung', () => {
    expect(chaiSurcharge({ ...p, chai_surcharge: '' }, def)).toBe(3000)
    expect(chaiExtraCost({ ...p, chai_cost: null }, def)).toBe(2500)
  })
  it('giá vốn Chai = giá vốn Ly + vốn chai', () => {
    expect(packCost(p, 'ly', 9000, def)).toBe(9000)
    expect(packCost(p, 'chai', 9000, def)).toBe(11500)
  })
})

describe('Dòng của đơn', () => {
  const a = { product_id: 1, name: 'Sữa điều', pack: 'ly', temp: 'da', qty: 2, price: 25000, cost: 9000 }
  it('thêm cùng món + cùng loại → gộp số lượng, không thêm dòng', () => {
    const out = addLines([a], [{ ...a, qty: 3 }])
    expect(out).toHaveLength(1)
    expect(out[0].qty).toBe(5)
  })
  it('khác đá / nóng hoặc khác độ ngọt → dòng riêng', () => {
    const out = addLines([a], [{ ...a, temp: 'nong', qty: 1 }, { ...a, sugar: 'it', qty: 1 }])
    expect(out).toHaveLength(3)
  })
  it('không làm thay đổi danh sách cũ', () => {
    const lines = [a]
    addLines(lines, [{ ...a, qty: 3 }])
    expect(lines[0].qty).toBe(2)
  })
  it('bỏ qua dòng số lượng 0', () => expect(addLines([], [{ ...a, qty: 0 }])).toEqual([]))
  it('tổng tiền / lãi / số Chai', () => {
    const lines = [a, { ...a, pack: 'chai', qty: 1, price: 28000, cost: 11500 }]
    expect(linesTotal(lines)).toBe(2 * 25000 + 28000)
    expect(linesProfit(lines)).toBe(2 * 16000 + 16500)
    expect(packQty(lines, 'chai')).toBe(1)
  })
})

describe('Chữ hiển thị', () => {
  it('variantText', () => {
    expect(variantText('chai', 'nong', 'it')).toBe('Chai nóng · ít ngọt')
    expect(variantText('ly', '', '')).toBe('Ly')
  })
  it('variantsText xếp Ly trước Chai, đá trước nóng', () => {
    const lines = [
      { pack: 'chai', temp: '', qty: 1 },
      { pack: 'ly', temp: 'nong', qty: 1 },
      { pack: 'ly', temp: 'da', qty: 2 },
    ]
    expect(variantsText(lines)).toBe('2 Ly đá · 1 Ly nóng · 1 Chai')
  })
})
