import { fetchAll, supabase } from './supabase'
import { productUsage, toMap } from './cost'

// Tồn kho từng nguyên liệu =
//   số kiểm kê gần nhất (cuối ngày kiểm kê; chưa kiểm kê thì tính từ 0)
//   + nhập hàng sau ngày đó
//   − lượng đã dùng sau ngày đó (bán + tặng + hủy, nhân theo công thức hiện tại)
// `until`: chỉ tính đến hết ngày này (dùng khi kiểm kê một ngày đã qua)
export async function loadStock(until) {
  const [ing, prod, rec, cnt] = await Promise.all([
    supabase.from('ingredients').select('*').order('name'),
    supabase.from('products').select('*'),
    supabase.from('recipes').select('*'),
    fetchAll(() => {
      const b = supabase.from('stock_counts').select('*').order('date').order('id')
      return until ? b.lte('date', until) : b
    }),
  ])
  const error = ing.error || prod.error || rec.error || cnt.error
  if (error) throw error

  const lastCount = {}
  cnt.data.forEach((c) => (lastCount[c.ingredient_id] = c))

  // chỉ cần dữ liệu từ lần kiểm kê cũ nhất trở đi
  const dates = ing.data.map((g) => lastCount[g.id]?.date)
  const since = dates.length && dates.every(Boolean) ? dates.sort()[0] : null
  const q = (table, cols) =>
    fetchAll(() => {
      let b = supabase.from(table).select(cols).order('id')
      if (until) b = b.lte('date', until)
      return since ? b.gt('date', since) : b
    })
  const [pur, sal, wst] = await Promise.all([
    q('purchases', 'ingredient_id,date,quantity'),
    q('sales', 'product_id,date,quantity,gift_qty'),
    q('waste', 'product_id,date,quantity'),
  ])
  if (pur.error || sal.error || wst.error) throw pur.error || sal.error || wst.error

  const stock = {}
  ing.data.forEach((g) => (stock[g.id] = Number(lastCount[g.id]?.counted || 0)))
  const counts = (id, date) => id in stock && (!lastCount[id] || date > lastCount[id].date)

  pur.data.forEach((p) => counts(p.ingredient_id, p.date) && (stock[p.ingredient_id] += Number(p.quantity)))

  const prodMap = toMap(prod.data)
  const recMap = toMap(rec.data)
  const usageCache = {}
  const use = (row, n) => {
    const product = prodMap[row.product_id]
    if (!product || !n) return
    const usage = (usageCache[product.id] ||= productUsage(product, recMap))
    for (const [id, amount] of Object.entries(usage)) if (counts(id, row.date)) stock[id] -= amount * n
  }
  sal.data.forEach((r) => use(r, r.quantity + (r.gift_qty || 0)))
  wst.data.forEach((r) => use(r, r.quantity))

  return { stock, lastCount, ingredients: ing.data, products: prod.data, recipes: rec.data }
}
