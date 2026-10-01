import { supabase } from './supabase'
import { productCost, toMap } from './cost'
import { PACKS, getChaiDefaults, packCost, packText } from './quick'

// Dòng Ly: 'order:12' (như trước), dòng Chai: 'order:12:chai' — 1 món đặt cả Ly lẫn Chai vẫn ghi được 2 dòng bán
export const orderSource = (id) => `order:${id}`
const packSource = (id, pack) => orderSource(id) + (pack === 'ly' ? '' : `:${pack}`)

// Gỡ doanh thu của 1 đơn đặt (cả dòng Ly và Chai)
export const deleteOrderSales = (id) =>
  supabase
    .from('sales')
    .delete()
    .in('source', Object.keys(PACKS).map((pack) => packSource(id, pack)))

// Đơn cũ chưa chọn Ly / Chai → tính là Ly
export const linePack = (l) => (l.pack in PACKS ? l.pack : 'ly')

// Danh sách món của đơn dạng chữ (đơn cũ chỉ có ô chữ `items`)
export const orderItemsText = (o, sep = ', ') =>
  o.lines?.length
    ? o.lines.map((l) => `${l.qty} ${PACKS[linePack(l)]} ${l.name}`).join(sep)
    : (o.items || '').replace(/\n+/g, sep)

// Tổng số Ly / Chai của các đơn: { ly, chai, text: "5 Ly · 2 Chai" }
export function packTotals(orders) {
  const t = { ly: 0, chai: 0 }
  orders.forEach((o) => (o.lines || []).forEach((l) => (t[linePack(l)] += Number(l.qty) || 0)))
  return { ...t, text: packText(t.ly, t.chai) }
}

export const linesTotal = (lines) => lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0)

// Đơn "Đã giao" → ghi các món vào bán hàng của ngày giao. Trạng thái khác → gỡ ra.
// Gọi lại mỗi khi đơn được sửa / đổi trạng thái; trả về lỗi (nếu có).
export async function syncOrderSales(order) {
  const del = await deleteOrderSales(order.id)
  if (del.error) return del.error
  const lines = (order.lines || []).filter((l) => Number(l.qty) > 0)
  if (order.status !== 'done' || lines.length === 0) return null

  const [p, i, r, chaiDef] = await Promise.all([
    supabase.from('products').select('*'),
    supabase.from('ingredients').select('*'),
    supabase.from('recipes').select('*'),
    getChaiDefaults(),
  ])
  if (p.error || i.error || r.error) return p.error || i.error || r.error
  const prodMap = toMap(p.data)
  const ingMap = toMap(i.data)
  const recMap = toMap(r.data)

  // gộp các dòng cùng món + cùng Ly / Chai (mỗi loại 1 dòng bán / đơn), khác giá thì lấy giá bình quân
  const byProduct = {}
  lines.forEach((l) => {
    const pack = linePack(l)
    const g = (byProduct[`${l.product_id || ''}:${pack}`] ||= { product_id: l.product_id || null, name: l.name, pack, qty: 0, amount: 0 })
    g.qty += Number(l.qty)
    g.amount += Number(l.qty) * Number(l.price || 0)
  })
  const rows = Object.values(byProduct).map((g, idx) => {
    const product = prodMap[g.product_id]
    const lyCost = product ? productCost(product, ingMap, recMap) : 0
    return {
      date: order.order_date,
      product_id: g.product_id,
      product_name: `${product?.name || g.name} (${PACKS[g.pack]})`,
      source: packSource(order.id, g.pack),
      pack: g.pack,
      quantity: g.qty,
      unit_price: g.amount / g.qty,
      unit_cost: product ? packCost(product, g.pack, lyCost, chaiDef) : 0,
      discount: idx === 0 ? Number(order.discount || 0) : 0, // giảm giá cả đơn ghi vào dòng đầu
    }
  })
  const ins = await supabase.from('sales').insert(rows)
  return ins.error
}
