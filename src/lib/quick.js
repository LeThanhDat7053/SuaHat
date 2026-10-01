import { getSetting, supabase } from './supabase'
import { cached } from './cache'

// Mức chung khi bán dạng Chai (từng món có thể đặt riêng: products.chai_surcharge / chai_cost)
export const CHAI_DEFAULTS = { surcharge: 3000, cost: 2500 }

export const PACKS = { ly: 'Ly', chai: 'Chai' }

// Nhiệt độ: chỉ để pha đúng, không đổi giá. '' = không ghi (đơn cũ)
export const TEMPS = { da: 'Đá', nong: 'Nóng' }

// "Ly đá", "Chai nóng", "Ly"
export const variantText = (pack, temp) => [PACKS[pack], TEMPS[temp]?.toLowerCase()].filter(Boolean).join(' ')

// Chưa chạy file nang-cap-v3.sql → chưa có bảng quick_orders
export const missingTable = (e) => e && (e.code === 'PGRST205' || e.code === '42P01' || e.code === 'PGRST202')

export const getChaiDefaults = () =>
  cached('chai-defaults', async () => ({ ...CHAI_DEFAULTS, ...((await getSetting('chai', null)) || {}) }), 300000)

const has = (v) => v !== null && v !== undefined && v !== ''

export const chaiSurcharge = (product, def) => Number(has(product.chai_surcharge) ? product.chai_surcharge : def.surcharge)
export const chaiExtraCost = (product, def) => Number(has(product.chai_cost) ? product.chai_cost : def.cost)

// Giá bán / giá vốn 1 phần theo Ly hoặc Chai. lyCost = giá vốn tính từ công thức.
export const packPrice = (product, pack, def) => Number(product.price) + (pack === 'chai' ? chaiSurcharge(product, def) : 0)
export const packCost = (product, pack, lyCost, def) => lyCost + (pack === 'chai' ? chaiExtraCost(product, def) : 0)

export const lineKey = (l) => `${l.product_id}:${l.pack}:${l.temp || ''}`
export const linesTotal = (lines) => lines.reduce((s, l) => s + l.qty * l.price, 0)
export const linesProfit = (lines) => lines.reduce((s, l) => s + l.qty * (l.price - l.cost), 0)
export const packQty = (lines, pack) => lines.filter((l) => l.pack === pack).reduce((s, l) => s + l.qty, 0)

// Cộng thêm món vào danh sách: cùng món + cùng loại thì gộp số lượng
export function addLines(lines, adds) {
  const out = lines.map((l) => ({ ...l }))
  adds.forEach((a) => {
    if (!(a.qty > 0)) return
    const cur = out.find((l) => lineKey(l) === lineKey(a))
    if (cur) Object.assign(cur, { qty: cur.qty + a.qty, price: a.price, cost: a.cost })
    else out.push({ ...a })
  })
  return out
}

// "2 Ly · 1 Chai" cho 1 món
export function packText(ly, chai) {
  return [ly > 0 && `${ly} Ly`, chai > 0 && `${chai} Chai`].filter(Boolean).join(' · ')
}

// Các dòng của 1 món, gọn: "2 Ly đá · 1 Ly nóng · 1 Chai"
export function variantsText(lines) {
  const order = (l) => Object.keys(PACKS).indexOf(l.pack) * 3 + ['da', 'nong', ''].indexOf(l.temp || '')
  return [...lines]
    .filter((l) => l.qty > 0)
    .sort((a, b) => order(a) - order(b))
    .map((l) => `${l.qty} ${variantText(l.pack, l.temp)}`)
    .join(' · ')
}

// Đơn đã giao → ghi vào bán hàng (1 dòng cho mỗi món + loại + đá/nóng), làm trong 1 giao dịch ở database.
// Tên món chỉ ghi Ly / Chai để báo cáo không bị tách theo đá / nóng; đá / nóng nằm trong source.
export async function completeQuickOrder(order) {
  const rows = order.lines
    .filter((l) => l.qty > 0)
    .map((l) => ({
      date: order.date,
      product_id: l.product_id,
      product_name: `${l.name} (${PACKS[l.pack]})`,
      source: `quick:${order.id}:${l.pack}${l.temp ? `:${l.temp}` : ''}`,
      pack: l.pack,
      quantity: l.qty,
      unit_price: l.price,
      unit_cost: l.cost,
    }))
  const { error } = await supabase.rpc('complete_quick_order', { p_id: order.id, p_rows: rows })
  return error
}

export async function reopenQuickOrder(order) {
  const { error } = await supabase.rpc('reopen_quick_order', { p_id: order.id })
  return error
}
