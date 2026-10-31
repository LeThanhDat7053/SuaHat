import { describe, expect, it } from 'vitest'
import { buyUnitsOf, itemUnit, showsAlt } from '../src/lib/units'

const bap = { id: 1, name: 'Bắp', unit: 'g', alt_unit: 'trái', alt_base: 150, alt_qty: 1 }
const tra = { id: 2, name: 'Trà', unit: 'g', alt_unit: 'ml', alt_base: 44, alt_qty: 380 }
const duong = { id: 3, name: 'Đường', unit: 'g' }

describe('Đơn vị nhập hàng', () => {
  it('bắp mua theo trái được (để đầu), vẫn mua theo kg / g được', () => {
    expect(buyUnitsOf(bap)).toEqual([
      { unit: 'trái', factor: 150 },
      { unit: 'kg', factor: 1000 },
      { unit: 'g', factor: 1 },
    ])
  })
  it('trà quy đổi ra ml nước pha thì không mua theo ml', () => {
    expect(buyUnitsOf(tra).map((u) => u.unit)).toEqual(['kg', 'g'])
  })
  it('nguyên liệu mới / không quy đổi như cũ', () => {
    expect(buyUnitsOf(null, 'ml').map((u) => u.unit)).toEqual(['lít', 'ml'])
    expect(buyUnitsOf({ unit: 'cái' }).map((u) => u.unit)).toEqual(['cái'])
  })
})

describe('Đơn vị hiện của dòng công thức', () => {
  it('dòng nhớ đơn vị riêng: mẻ sữa bắp theo trái, mẻ khác theo g', () => {
    expect(itemUnit({ ingredient_id: 1, amount: 3000, unit: 'trái' }, bap)).toBe('trái')
    expect(itemUnit({ ingredient_id: 1, amount: 500, unit: 'g' }, bap)).toBe('g')
    expect(showsAlt({ unit: 'trái' }, bap)).toBe(true)
    expect(showsAlt({ unit: 'g' }, bap)).toBe(false)
  })
  it('dòng cũ chưa nhớ đơn vị: như trước (trà hiện ml)', () => {
    expect(itemUnit({ ingredient_id: 2, amount: 44 }, tra)).toBe('ml')
    expect(showsAlt({}, tra)).toBe(true)
    expect(showsAlt({}, duong)).toBe(false)
  })
})
