import { missingColumn } from './quick'

// Ghi kèm cột mới của nang-cap-v8.sql (usage). Database chưa chạy file đó thì bỏ cột này
// và ghi lại, app vẫn chạy như cũ (kho tính theo công thức hiện tại).
let hasUsage = true
const strip = (row) => {
  const { usage: _, ...rest } = row
  return rest
}

export async function withUsage(run, rows) {
  if (hasUsage) {
    const res = await run(rows)
    if (!missingColumn(res.error)) return res
    hasUsage = false
  }
  return run(Array.isArray(rows) ? rows.map(strip) : strip(rows))
}
