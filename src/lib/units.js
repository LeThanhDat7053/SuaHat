import { BIG_UNIT, num } from './format'

// Quy đổi riêng của 1 nguyên liệu trong công thức. VD trà: 44 g = 380 ml
// → công thức gõ "380 ml" thì app lưu 44 g (tính tiền, trừ kho theo g).
export function altOf(g) {
  const base = Number(g?.alt_base)
  const qty = Number(g?.alt_qty)
  return g?.alt_unit && base > 0 && qty > 0 ? { unit: g.alt_unit, base, qty, factor: base / qty } : null
}

// Các đơn vị gõ được trong công thức: [{ unit, factor }] (factor = số đơn vị gốc trong 1 đơn vị này)
export function recipeUnits(g) {
  const out = []
  const alt = altOf(g)
  if (alt) out.push({ unit: alt.unit, factor: alt.factor })
  out.push({ unit: g.unit, factor: 1 })
  if (BIG_UNIT[g.unit]) out.push({ unit: BIG_UNIT[g.unit], factor: 1000 })
  return out.filter((u, i) => out.findIndex((x) => x.unit === u.unit) === i)
}

// "380 ml (44 g)" — lượng gốc kèm theo đơn vị quy đổi nếu có
export function altText(amount, g) {
  const alt = altOf(g)
  return alt ? `${num(amount / alt.factor, 1)} ${alt.unit}` : ''
}

// Đơn vị hiện của 1 dòng công thức: dòng nào nhớ đơn vị riêng (r.unit) thì theo dòng đó,
// VD bắp: mẻ sữa bắp ghi theo trái, mẻ khác ghi theo g. Dòng cũ chưa nhớ thì như trước (ưu tiên đơn vị quy đổi).
export function itemUnit(r, g) {
  const units = g ? recipeUnits(g) : []
  return units.some((u) => u.unit === r?.unit) ? r.unit : units[0]?.unit || g?.unit || ''
}

// Dòng công thức có hiện theo đơn vị quy đổi không (trà ml, bắp trái…)
export const showsAlt = (r, g) => !!altOf(g) && itemUnit(r, g) === altOf(g).unit

// Các đơn vị chọn được lúc nhập hàng: [{ unit, factor }] (factor = số đơn vị gốc trong 1 đơn vị này).
// Quy đổi theo cái đếm được (bắp: 1 trái = 150 g) thì mua theo trái được, để đầu tiên.
// Quy đổi ra g / ml (trà 44 g = 380 ml nước pha) thì không, vì không ai mua theo nước pha.
export function buyUnitsOf(g, unit = g?.unit) {
  const out = []
  const alt = altOf(g)
  if (alt && !BIG_UNIT[alt.unit] && !Object.values(BIG_UNIT).includes(alt.unit)) out.push({ unit: alt.unit, factor: alt.factor })
  if (BIG_UNIT[unit]) out.push({ unit: BIG_UNIT[unit], factor: 1000 })
  out.push({ unit, factor: 1 })
  return out.filter((u, i) => out.findIndex((x) => x.unit === u.unit) === i)
}

// Cách tính tiền nguyên liệu:
//   'cup'  = theo từng ly (mặc định): giá vốn mỗi ly, trừ kho
//   'buy'  = tính 1 lần lúc mua: tiền mua vào thẳng lãi ngày mua, ly bán ra 0đ, vẫn trừ kho + báo sắp hết
//   'free' = nhà có: không tính tiền, không trừ kho
export const costModeOf = (g) => (g?.no_stock ? 'free' : g?.cost_on_buy ? 'buy' : 'cup')
export const COST_MODES = {
  cup: { label: 'Theo từng ly', hint: 'Mặc định. Giá vốn mỗi ly có tiền nguyên liệu này, bán là trừ kho.' },
  buy: {
    label: 'Tính 1 lần lúc mua',
    hint: 'Sữa đặc, đường… Tiền mua trừ thẳng vào lãi ngày mua, ly bán ra không tính nữa. Vẫn trừ kho, báo sắp hết; kiểm kê về 0 không bị trừ tiền lần 2.',
  },
  free: { label: 'Nhà có / không tính', hint: 'Gạo rang nhà có, trái cây chợ khó cân… Không tính tiền, không trừ kho.' },
}
