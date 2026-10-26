import { describe, expect, it } from 'vitest'
import {
  avgPrice,
  batchCost,
  productCost,
  productSources,
  productUsage,
  saleCost,
  saleRevenue,
  soldQty,
  suggestPrice,
  toMap,
  unitCost,
  usageSnapshot,
} from '../src/lib/cost'

// Số liệu mẫu: 1 mẻ sữa điều = 1 kg hạt điều + 300 g đường + 9 lít nước, ra 10 lít.
// Món "Sữa điều 500ml" dùng mẻ đó + 1 chai.
const ingredients = [
  { id: 1, name: 'Hạt điều', unit: 'g', price_per_unit: 300 }, // 300.000đ/kg
  { id: 2, name: 'Đường', unit: 'g', price_per_unit: 20 }, // 20.000đ/kg
  { id: 3, name: 'Nước lọc', unit: 'ml', price_per_unit: 5, no_stock: true }, // nhà có → 0đ
  { id: 4, name: 'Chai 500ml', unit: 'cái', price_per_unit: 2000 },
  { id: 5, name: 'Sữa đặc', unit: 'g', price_per_unit: 50, cost_on_buy: true }, // tính lúc mua → 0đ mỗi ly
]
const ingMap = toMap(ingredients)
const recipe = {
  id: 10,
  yield_ml: 10000,
  items: [
    { ingredient_id: 1, amount: 1000 },
    { ingredient_id: 2, amount: 300 },
    { ingredient_id: 3, amount: 9000 },
  ],
}
const recMap = { 10: recipe }
const product = { id: 7, name: 'Sữa điều', price: 25000, extra_cost: 1000, recipe_id: 10, volume_ml: 500, recipe: [{ ingredient_id: 4, amount: 1 }] }

describe('unitCost — giá 1 đơn vị đưa vào giá vốn', () => {
  it('nguyên liệu thường: lấy giá bình quân', () => expect(unitCost(ingMap[1])).toBe(300))
  it('"Nhà có" không tính tiền', () => expect(unitCost(ingMap[3])).toBe(0))
  it('"Tính 1 lần lúc mua" không tính vào từng ly', () => expect(unitCost(ingMap[5])).toBe(0))
  it('nguyên liệu đã xóa (không có) = 0', () => expect(unitCost(undefined)).toBe(0))
})

describe('batchCost — tiền 1 mẻ', () => {
  it('1000g × 300 + 300g × 20 + nước nhà có = 306.000đ', () => expect(batchCost(recipe, ingMap)).toBe(306000))
  it('công thức rỗng = 0', () => expect(batchCost({ items: null }, ingMap)).toBe(0))
})

describe('productUsage — lượng nguyên liệu cho 1 phần', () => {
  it('500ml / mẻ 10 lít = 1/20 mẻ, cộng thêm 1 chai', () => {
    expect(productUsage(product, recMap)).toEqual({ 1: 50, 2: 15, 3: 450, 4: 1 })
  })
  it('chưa nhập dung tích → chỉ có nguyên liệu thêm', () => {
    expect(productUsage({ ...product, volume_ml: 0 }, recMap)).toEqual({ 4: 1 })
  })
  it('mẻ chưa ghi "ra được bao nhiêu ml" → không chia được, chỉ có nguyên liệu thêm', () => {
    expect(productUsage(product, { 10: { ...recipe, yield_ml: 0 } })).toEqual({ 4: 1 })
  })
  it('cùng 1 nguyên liệu ở mẻ và ở phần thêm thì cộng dồn', () => {
    const p = { ...product, recipe: [{ ingredient_id: 2, amount: 5 }] }
    expect(productUsage(p, recMap)).toEqual({ 1: 50, 2: 20, 3: 450 })
  })
})

describe('usageSnapshot — chốt lượng nguyên liệu lúc bán', () => {
  it('làm tròn 4 chữ số', () => {
    const p = { ...product, volume_ml: 330, recipe: [] }
    // 1000 × 330 / 10000 = 33 ; 300 × 330 / 10000 = 9,9 ; 9000 × 330 / 10000 = 297
    expect(usageSnapshot(p, recMap)).toEqual({ 1: 33, 2: 9.9, 3: 297 })
  })
  it('không rõ món → null (kho tính theo công thức hiện tại)', () => expect(usageSnapshot(null, recMap)).toBeNull())
  it('món không có công thức → {}', () => expect(usageSnapshot({ id: 1, recipe: [] }, recMap)).toEqual({}))
})

describe('productCost — giá vốn 1 phần', () => {
  it('1.000 phụ + 50g điều 15.000 + 15g đường 300 + chai 2.000 = 18.300đ', () => {
    expect(productCost(product, ingMap, recMap)).toBe(18300)
  })
  it('nguyên liệu "tính lúc mua" không cộng vào giá vốn', () => {
    const p = { ...product, recipe: [{ ingredient_id: 5, amount: 20 }] }
    expect(productCost(p, ingMap, recMap)).toBe(1000 + 15000 + 300)
  })
})

describe('productSources — phần không nằm trong giá vốn', () => {
  it('liệt kê "nhà có" và "tính lúc mua" (ước tính tiền)', () => {
    const p = { ...product, recipe: [{ ingredient_id: 5, amount: 20 }] }
    expect(productSources(p, ingMap, recMap)).toEqual({ buy: { value: 1000, names: ['Sữa đặc'] }, free: { names: ['Nước lọc'] } })
  })
})

describe('avgPrice — giá bình quân sau khi nhập', () => {
  it('còn 1kg giá 300đ/g, mua thêm 1kg 400.000đ → 350đ/g', () => expect(avgPrice(1000, 300, 1000, 400000)).toBe(350))
  it('tồn kho âm coi như 0 → lấy giá lần mua mới', () => expect(avgPrice(-200, 300, 1000, 400000)).toBe(400))
  it('hết hàng và mua 0 → 0, không chia cho 0', () => expect(avgPrice(0, 300, 0, 0)).toBe(0))
})

describe('Doanh thu / giá vốn của 1 dòng bán', () => {
  const row = { quantity: 3, gift_qty: 1, unit_price: '25000', unit_cost: '8000', discount: '5000' }
  it('doanh thu = 3 × 25.000 − 5.000 = 70.000 (số dạng chữ từ database vẫn tính đúng)', () => expect(saleRevenue(row)).toBe(70000))
  it('giá vốn tính cả phần tặng: (3 + 1) × 8.000 = 32.000', () => expect(saleCost(row)).toBe(32000))
  it('dòng không có tặng / giảm', () => {
    expect(saleRevenue({ quantity: 2, unit_price: 10000 })).toBe(20000)
    expect(saleCost({ quantity: 2, unit_cost: 4000 })).toBe(8000)
  })
  it('bán sỉ không cộng vào số phần, bán lẻ thì có', () => {
    expect(soldQty({ quantity: 50, wholesale: true })).toBe(0)
    expect(soldQty({ quantity: 5 })).toBe(5)
  })
})

describe('suggestPrice — giá bán để đạt mức lãi', () => {
  it('vốn 10.000, muốn lãi 40% → 16.667 → làm tròn lên 17.000', () => expect(suggestPrice(10000, 40)).toBe(17000))
  it('vốn 10.000, lãi 45% → 18.182 → luôn làm tròn LÊN 19.000 (không xuống 18.000)', () => expect(suggestPrice(10000, 45)).toBe(19000))
  it('vốn 9.000, lãi 40% → đúng 15.000 thì giữ nguyên', () => expect(suggestPrice(9000, 40)).toBe(15000))
  it('chưa có giá vốn / mức lãi ≥ 100% → null', () => {
    expect(suggestPrice(0, 40)).toBeNull()
    expect(suggestPrice(10000, 100)).toBeNull()
  })
})
