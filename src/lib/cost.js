// Giá vốn 1 phần = chi phí phụ (ly, nắp...) + tổng (lượng nguyên liệu × giá 1 đơn vị)
export function productCost(product, ingMap) {
  const recipe = Array.isArray(product.recipe) ? product.recipe : []
  const ingCost = recipe.reduce((sum, r) => {
    const ing = ingMap[r.ingredient_id]
    return sum + (ing ? Number(r.amount || 0) * Number(ing.price_per_unit || 0) : 0)
  }, 0)
  return Number(product.extra_cost || 0) + ingCost
}

export const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))
