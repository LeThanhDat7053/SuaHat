import { fetchAll, supabase } from './supabase'
import { productUsage, toMap } from './cost'
import { cached, peek } from './cache'

// Tồn kho từng nguyên liệu =
//   số kiểm kê gần nhất (chưa kiểm kê thì tính từ 0)
//   + nhập hàng được LƯU SAU lúc bấm lưu kiểm kê (theo thời điểm lưu, không theo ngày ghi)
//   − lượng đã dùng SAU ngày kiểm kê (bán + tặng + hủy, nhân theo công thức)
// Số kiểm kê = hàng còn lại CUỐI ngày kiểm kê (số bán ngày đó đã nằm trong số đếm).
// `until`: chỉ trừ số bán đến hết ngày này (dùng khi đang kiểm kê)
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
  const counted = ing.data.map((g) => lastCount[g.id]).filter(Boolean)
  const all = counted.length > 0 && counted.length === ing.data.length
  const since = all ? counted.map((c) => c.date).sort()[0] : null
  const sinceTs = all ? counted.map((c) => c.created_at).sort()[0] : null
  const q = (table, cols) =>
    fetchAll(() => {
      let b = supabase.from(table).select(cols).order('id')
      if (until) b = b.lte('date', until)
      return since ? b.gt('date', since) : b
    })
  const [pur, sal, wst] = await Promise.all([
    fetchAll(() => {
      const b = supabase.from('purchases').select('ingredient_id,quantity,created_at').order('id')
      return sinceTs ? b.gt('created_at', sinceTs) : b
    }),
    q('sales', 'product_id,date,quantity,gift_qty'),
    q('waste', 'product_id,date,quantity'),
  ])
  if (pur.error || sal.error || wst.error) throw pur.error || sal.error || wst.error

  const stock = {}
  ing.data.forEach((g) => (stock[g.id] = Number(lastCount[g.id]?.counted || 0)))
  const counts = (id, date) => id in stock && (!lastCount[id] || date > lastCount[id].date)
  const boughtAfter = (id, ts) => id in stock && (!lastCount[id] || ts > lastCount[id].created_at)

  pur.data.forEach((p) => boughtAfter(p.ingredient_id, p.created_at) && (stock[p.ingredient_id] += Number(p.quantity)))

  const prodMap = toMap(prod.data)
  const recMap = toMap(rec.data)
  const usageCache = {}
  // "Nhà có / không tính kho": không trừ khi bán
  const noStock = new Set(ing.data.filter((g) => g.no_stock).map((g) => g.id))
  const use = (row, n) => {
    const product = prodMap[row.product_id]
    if (!product || !n) return
    const usage = (usageCache[product.id] ||= productUsage(product, recMap))
    for (const [id, amount] of Object.entries(usage)) if (counts(id, row.date) && !noStock.has(Number(id))) stock[id] -= amount * n
  }
  sal.data.forEach((r) => use(r, r.quantity + (r.gift_qty || 0)))
  wst.data.forEach((r) => use(r, r.quantity))

  return { stock, lastCount, ingredients: ing.data, products: prod.data, recipes: rec.data }
}

// Tồn kho dùng lại trong 2 phút (tự tính lại ngay khi có nhập / bán / kiểm kê trên máy này)
export const loadStockCached = (until) => cached(`stock:${until || ''}`, () => loadStock(until), 120000)
export const peekStock = (until) => peek(`stock:${until || ''}`)
