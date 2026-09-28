export const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

// Giá tiền nguyên liệu của 1 mẻ
export function batchCost(recipe, ingMap) {
  const items = Array.isArray(recipe?.items) ? recipe.items : []
  return items.reduce((s, r) => s + Number(r.amount || 0) * Number(ingMap[r.ingredient_id]?.price_per_unit || 0), 0)
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

// Giá vốn 1 phần = nguyên liệu (theo giá bình quân hiện tại) + chi phí phụ
export function productCost(product, ingMap, recipeMap = {}) {
  const usage = productUsage(product, recipeMap)
  const ing = Object.entries(usage).reduce((s, [id, amount]) => s + amount * Number(ingMap[id]?.price_per_unit || 0), 0)
  return Number(product.extra_cost || 0) + ing
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
