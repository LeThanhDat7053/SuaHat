import { supabase } from './supabase'
import { productCost, toMap } from './cost'

export const orderSource = (id) => `order:${id}`

// Danh sách món của đơn dạng chữ (đơn cũ chỉ có ô chữ `items`)
export const orderItemsText = (o, sep = ', ') =>
  o.lines?.length ? o.lines.map((l) => `${l.qty} ${l.name}`).join(sep) : (o.items || '').replace(/\n+/g, sep)

export const linesTotal = (lines) => lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0)

// Đơn "Đã giao" → ghi các món vào bán hàng của ngày giao. Trạng thái khác → gỡ ra.
// Gọi lại mỗi khi đơn được sửa / đổi trạng thái; trả về lỗi (nếu có).
export async function syncOrderSales(order) {
  const source = orderSource(order.id)
  const del = await supabase.from('sales').delete().eq('source', source)
  if (del.error) return del.error
  const lines = (order.lines || []).filter((l) => Number(l.qty) > 0)
  if (order.status !== 'done' || lines.length === 0) return null

  const [p, i, r] = await Promise.all([
    supabase.from('products').select('*'),
    supabase.from('ingredients').select('*'),
    supabase.from('recipes').select('*'),
  ])
  if (p.error || i.error || r.error) return p.error || i.error || r.error
  const prodMap = toMap(p.data)
  const ingMap = toMap(i.data)
  const recMap = toMap(r.data)

  // gộp các dòng cùng món (mỗi món 1 dòng bán / đơn), khác giá thì lấy giá bình quân
  const byProduct = {}
  lines.forEach((l) => {
    const g = (byProduct[l.product_id || ''] ||= { product_id: l.product_id || null, name: l.name, qty: 0, amount: 0 })
    g.qty += Number(l.qty)
    g.amount += Number(l.qty) * Number(l.price || 0)
  })
  const rows = Object.values(byProduct).map((g, idx) => {
    const product = prodMap[g.product_id]
    return {
      date: order.order_date,
      product_id: g.product_id,
      product_name: product?.name || g.name,
      source,
      quantity: g.qty,
      unit_price: g.amount / g.qty,
      unit_cost: product ? productCost(product, ingMap, recMap) : 0,
      discount: idx === 0 ? Number(order.discount || 0) : 0, // giảm giá cả đơn ghi vào dòng đầu
    }
  })
  const ins = await supabase.from('sales').insert(rows)
  return ins.error
}
