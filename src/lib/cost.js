export const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

// Giá 1 đơn vị nguyên liệu để tính giá vốn mỗi ly.
// "Nhà có" và "Tính 1 lần lúc mua" = 0đ (cái sau đã trừ vào lãi ngày mua).
export const unitCost = (g) => (g && !g.no_stock && !g.cost_on_buy ? Number(g.price_per_unit || 0) : 0)

// Giá tiền nguyên liệu của 1 mẻ
export function batchCost(recipe, ingMap) {
  const items = Array.isArray(recipe?.items) ? recipe.items : []
  return items.reduce((s, r) => s + Number(r.amount || 0) * unitCost(ingMap[r.ingredient_id]), 0)
}

// Lượng từng nguyên liệu cho 1 phần: { ingredient_id: lượng }
//   = phần của công thức mẻ (theo dung tích / số ml mẻ ra được)
//   + nguyên liệu thêm cho mỗi phần (chai, nắp, topping…)
export function productUsage(product, recipeMap = {}) {
  const out = {}
  const add = (id, amount) => {
    if (id && amount) out[id] = (out[id] || 0) + amount
  }
  ;(Array.isArray(product.recipe) ? product.recipe : []).forEach((r) => add(r.ingredient_id, Number(r.amount || 0)))
  const batch = recipeMap[product.recipe_id]
  const yieldMl = Number(batch?.yield_ml || 0)
  const volume = Number(product.volume_ml || 0)
  if (batch && yieldMl > 0 && volume > 0) {
    ;(batch.items || []).forEach((r) => add(r.ingredient_id, (Number(r.amount || 0) * volume) / yieldMl))
  }
  return out
}

// Lượng nguyên liệu của 1 phần, chốt lúc bán (lưu vào sales.usage / waste.usage) để sau này
// sửa công thức / xóa món không làm đổi số đã bán. {} = món không có công thức, null = không rõ món.
export function usageSnapshot(product, recipeMap = {}) {
  if (!product) return null
  const out = {}
  for (const [id, amount] of Object.entries(productUsage(product, recipeMap))) out[id] = +amount.toFixed(4)
  return out
}

// Giá vốn 1 phần = nguyên liệu (theo giá bình quân hiện tại) + chi phí phụ
export function productCost(product, ingMap, recipeMap = {}) {
  const usage = productUsage(product, recipeMap)
  const ing = Object.entries(usage).reduce((s, [id, amount]) => s + amount * unitCost(ingMap[id]), 0)
  return Number(product.extra_cost || 0) + ing
}

// Nguồn gốc nguyên liệu của 1 phần, để hiện rõ phần nào không nằm trong giá vốn:
//   buy  = "Tính 1 lần lúc mua": tiền đã trừ vào lãi ngày mua (value = ước tính theo giá bình quân)
//   free = "Nhà có": không tính tiền
export function productSources(product, ingMap, recipeMap = {}) {
  const out = { buy: { value: 0, names: [] }, free: { names: [] } }
  Object.entries(productUsage(product, recipeMap)).forEach(([id, amount]) => {
    const g = ingMap[id]
    if (!g) return
    if (g.no_stock) out.free.names.push(g.name)
    else if (g.cost_on_buy) {
      out.buy.names.push(g.name)
      out.buy.value += amount * Number(g.price_per_unit || 0)
    }
  })
  return out
}

// Giá bình quân sau khi nhập thêm: (tồn × giá cũ + tiền mua mới) / (tồn + lượng mua mới)
export function avgPrice(stock, oldPrice, quantity, total) {
  const s = Math.max(0, Number(stock) || 0)
  const q = Number(quantity) || 0
  return s + q > 0 ? (s * Number(oldPrice || 0) + Number(total || 0)) / (s + q) : 0
}

// Doanh thu / giá vốn của 1 dòng bán hàng
export const saleRevenue = (r) => r.quantity * Number(r.unit_price) - Number(r.discount || 0)
export const saleCost = (r) => (r.quantity + (r.gift_qty || 0)) * Number(r.unit_cost)

// Mức lãi (% giá bán) dưới mức này thì báo "lãi mỏng"
export const DEFAULT_MARGIN = 40

// Giá bán thấp nhất để đạt mức lãi `margin` (% giá bán), làm tròn lên nghìn đồng.
// null khi chưa tính được (chưa có giá vốn, hoặc mức lãi ≥ 100%).
export function suggestPrice(cost, margin) {
  const m = Number(margin)
  if (!(cost > 0) || !(m < 100)) return null
  return Math.ceil(cost / (1 - m / 100) / 1000) * 1000
}
