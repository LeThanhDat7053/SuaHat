import { fetchAll, supabase } from './supabase'
import { productCost, productUsage, toMap } from './cost'
import { loadStock } from './stock'
import { loadCatalog } from './catalog'
import { getChaiDefaults, missingColumn, missingTable, packCost } from './quick'
import { addDays, fmtDate, fmtQty, money, todayStr } from './format'
import { outboxJobs } from './outbox'
import { cached } from './cache'

// Kiểm tra số liệu: tự quét những chỗ làm số tiền / tồn kho bị sai mà không ai để ý,
// mỗi mục nói rõ hậu quả và chỗ để sửa (có nút sửa luôn nếu sửa tự động được).

export const DAYS = 60 // quét đơn / dòng bán trong 60 ngày gần nhất

// level: 'error' = số tiền / tồn kho đang sai · 'warn' = nên xem · 'info' = để biết
export const LEVELS = { error: 'Đang làm sai số', warn: 'Nên xem lại', info: 'Để biết' }

// Các file nâng cấp database: kiểm bằng cách đọc thử 1 cột mà file đó thêm vào
const UPGRADES = [
  ['nang-cap-v2.sql', 'recipes', 'id', 'Công thức mẻ, hàng hủy, kiểm kê'],
  ['nang-cap-v3.sql', 'quick_orders', 'id', 'Lập đơn nhanh, bán Ly / Chai'],
  ['nang-cap-v4.sql', 'recurring_expenses', 'id', 'Báo thức, chi phí định kỳ'],
  ['nang-cap-v11.sql', 'ingredients', 'category', 'Nhóm nguyên liệu (gồm cả v6), gộp Bắp SB vào Bắp'],
  ['nang-cap-v7.sql', 'ingredients', 'no_stock', 'Nguyên liệu "nhà có", "tính lúc mua"'],
  ['nang-cap-v8.sql', 'sales', 'usage', 'Chốt lượng nguyên liệu lúc bán (sửa công thức không làm nhảy tồn kho)'],
  ['nang-cap-v9.sql', 'sales', 'wholesale', 'Bán sỉ'],
  ['nang-cap-v10.sql', 'quick_orders', 'client_id', 'Bán khi mất mạng không bị ghi trùng'],
]

async function probeUpgrades() {
  const res = await Promise.all(UPGRADES.map(([, table, col]) => supabase.from(table).select(col).limit(1)))
  return UPGRADES.map(([file, , , what], i) => {
    const e = res[i].error
    return { file, what, ok: !(missingTable(e) || missingColumn(e)) }
  })
}

// bảng chưa có (chưa chạy file nâng cấp) → coi như rỗng; lỗi khác thì báo
const rowsOf = (r) => {
  if (missingTable(r.error) || missingColumn(r.error)) return []
  if (r.error) throw r.error
  return r.data
}

export async function loadCheckData(today = todayStr()) {
  const from = addDays(today, -DAYS)
  const [cat, st, chaiDef, sales, quickDone, quickStale, ordersDone, ordersStale, upgrades] = await Promise.all([
    loadCatalog(0),
    loadStock(),
    getChaiDefaults(),
    fetchAll(() => supabase.from('sales').select('*').gte('date', from).order('id')),
    fetchAll(() => supabase.from('quick_orders').select('*').eq('status', 'done').gte('date', from).order('id')),
    supabase.from('quick_orders').select('*').eq('status', 'pending').lt('date', today).order('date'),
    fetchAll(() => supabase.from('orders').select('*').eq('status', 'done').gte('order_date', from).order('id')),
    supabase.from('orders').select('*').eq('status', 'pending').lt('order_date', today).order('order_date'),
    probeUpgrades(),
  ])
  return {
    today,
    products: cat.products,
    ingredients: cat.ingredients,
    recipes: cat.recipes,
    stock: st.stock,
    lastCount: st.lastCount,
    chaiDef,
    sales: rowsOf(sales),
    quickDone: rowsOf(quickDone),
    quickStale: rowsOf(quickStale),
    ordersDone: rowsOf(ordersDone),
    ordersStale: rowsOf(ordersStale),
    upgrades,
    outbox: outboxJobs(),
  }
}

// Quét và dùng lại kết quả trong `maxAge` ms (có lệnh ghi dữ liệu nào thì quét lại)
export const CHECKS_KEY = 'checks'
export const loadChecks = (maxAge = 60000) => cached(CHECKS_KEY, async () => findIssues(await loadCheckData()), maxAge)

const hasLines = (o) => (o.lines || []).some((l) => Number(l.qty) > 0)
const quickName = (o) => o.note || `Đơn #${o.id}`

// Tả 1 việc trong hàng chờ cho người đọc
export function describeJob(j) {
  if (j.type === 'quick-new') return `Đơn ${j.order.note ? `"${j.order.note}"` : 'mới'} ${money(j.order.total)}${j.rows ? ' (đã xong)' : ''} · ${fmtDate(j.order.date)}`
  if (j.type === 'quick-done') return `Bấm "Đã xong" đơn #${j.order_id}`
  if (j.type === 'sale') return `Số bán ${j.row?.product_name || `món #${j.product_id}`} · ${fmtDate(j.date)}`
  if (j.type === 'waste') return `Hàng hủy ${j.row?.product_name || `món #${j.product_id}`} · ${fmtDate(j.date)}`
  return j.type
}

// Quét toàn bộ, trả về danh sách vấn đề (đã xếp: sai số → nên xem → để biết)
export function findIssues(d) {
  const out = []
  const add = (issue) => issue.items.length > 0 && out.push(issue)
  const ingMap = toMap(d.ingredients)
  const recMap = toMap(d.recipes)
  const active = d.products.filter((p) => p.active)

  // ---- database / hàng chờ ----
  add({
    id: 'upgrade',
    level: 'error',
    title: 'Database chưa chạy đủ file nâng cấp',
    why: 'Thiếu thì một số tính năng không chạy hoặc tính theo cách cũ. Supabase → SQL Editor → dán từng file → RUN (chạy lại không sao).',
    items: d.upgrades.filter((u) => !u.ok).map((u) => ({ key: u.file, text: `supabase/${u.file}`, note: u.what })),
  })
  const failed = d.outbox.filter((j) => j.error)
  add({
    id: 'outbox-failed',
    level: 'error',
    title: 'Thao tác lưu lúc mất mạng chưa gửi được',
    why: 'Database từ chối nên chưa có trong doanh thu / tồn kho. Xử lý theo lỗi bên dưới rồi bấm "Gửi lại", hoặc bỏ nếu không cần.',
    items: failed.map((j) => ({ key: j.id, text: describeJob(j), note: j.error, job: j })),
    fix: 'outbox',
  })
  const waiting = d.outbox.filter((j) => !j.error)
  add({
    id: 'outbox-waiting',
    level: 'info',
    title: 'Đang chờ mạng để gửi lên',
    why: 'Đã lưu trong máy này, có mạng sẽ tự gửi. Đừng xóa dữ liệu trình duyệt / gỡ app trước khi gửi xong.',
    items: waiting.map((j) => ({ key: j.id, text: describeJob(j) })),
  })

  // ---- doanh thu ----
  const sources = new Set(d.sales.map((r) => r.source))
  const hasSource = (prefix) => [...sources].some((s) => s === prefix || s.startsWith(prefix + ':'))
  add({
    id: 'lost-revenue',
    level: 'error',
    title: 'Đơn đã giao / đã xong nhưng không có doanh thu',
    why: 'Thường do rớt mạng đúng lúc bấm "Đã giao". Tiền đơn này chưa nằm trong doanh thu, nguyên liệu chưa trừ kho. Bấm "Ghi lại doanh thu" để sửa.',
    items: [
      ...d.ordersDone
        .filter((o) => hasLines(o) && !hasSource(`order:${o.id}`))
        .map((o) => ({ key: `o${o.id}`, text: `Đơn đặt ${o.customer} · ${fmtDate(o.order_date)}`, note: money(o.total), order: o, kind: 'pre' })),
      ...d.quickDone
        .filter((o) => hasLines(o) && !hasSource(`quick:${o.id}`))
        .map((o) => ({ key: `q${o.id}`, text: `${quickName(o)} · ${fmtDate(o.date)}`, note: money(o.total), order: o, kind: 'quick' })),
    ],
    fix: 'resync',
  })
  add({
    id: 'stale',
    level: 'warn',
    title: 'Đơn từ hôm trước vẫn đang chờ',
    why: 'Chưa bấm "Đã xong / Đã giao" thì chưa tính tiền, chưa trừ kho. Đã giao rồi thì bấm xong; khách hủy thì xóa / hủy đơn.',
    items: [
      ...d.quickStale.map((o) => ({ key: `q${o.id}`, text: `${quickName(o)} · ${fmtDate(o.date)}`, note: money(o.total), link: '/don' })),
      ...d.ordersStale.map((o) => ({ key: `o${o.id}`, text: `Đơn đặt ${o.customer} · giao ${fmtDate(o.order_date)}`, note: money(o.total), link: '/lich' })),
    ],
  })

  // ---- món & công thức ----
  const costOf = (p) => productCost(p, ingMap, recMap)
  add({
    id: 'no-recipe',
    level: 'error',
    title: 'Món đang bán chưa có công thức',
    why: 'Giá vốn = 0đ nên app tính lãi bằng cả giá bán (lãi ảo), và không trừ nguyên liệu trong kho.',
    items: active
      .filter((p) => Object.keys(productUsage(p, recMap)).length === 0 && !(Number(p.extra_cost) > 0))
      .map((p) => ({ key: p.id, text: p.name, link: '/san-pham' })),
  })
  add({
    id: 'batch-yield',
    level: 'error',
    title: 'Món dùng công thức mẻ nhưng thiếu số ml',
    why: 'Không chia được mẻ ra từng phần → món này không có giá vốn từ mẻ và không trừ kho nguyên liệu của mẻ.',
    items: active
      .filter((p) => p.recipe_id && recMap[p.recipe_id])
      .flatMap((p) => {
        const r = recMap[p.recipe_id]
        if (!(Number(r.yield_ml) > 0)) return [{ key: `y${p.id}`, text: p.name, note: `mẻ "${r.name}" chưa ghi ra được bao nhiêu ml`, link: '/san-pham' }]
        if (!(Number(p.volume_ml) > 0)) return [{ key: `v${p.id}`, text: p.name, note: 'chưa chọn dung tích (ml) mỗi phần', link: '/san-pham' }]
        return []
      }),
  })
  // nguyên liệu dùng trong món đang bán: id → tên các món
  const usedBy = {}
  active.forEach((p) => Object.keys(productUsage(p, recMap)).forEach((id) => (usedBy[id] ||= []).push(p.name)))
  add({
    id: 'no-price',
    level: 'error',
    title: 'Nguyên liệu chưa có giá',
    why: 'Giá vốn các món dùng nguyên liệu này thấp hơn thực tế → lãi bị báo cao. Nhập hàng 1 lần (app tự tính giá) hoặc sửa giá ở Nguyên liệu.',
    items: d.ingredients
      .filter((g) => usedBy[g.id] && !g.no_stock && !g.cost_on_buy && !(Number(g.price_per_unit) > 0))
      .map((g) => ({ key: g.id, text: g.name, note: `dùng trong ${usedBy[g.id].join(', ')}`, link: '/nguyen-lieu' })),
  })
  add({
    id: 'loss',
    level: 'warn',
    title: 'Món bán dưới giá vốn',
    why: 'Mỗi phần bán ra đang lỗ. Kiểm tra lại giá bán, hoặc công thức / giá nguyên liệu có nhập nhầm không.',
    items: active
      .filter((p) => Number(p.price) > 0 && costOf(p) > Number(p.price))
      .map((p) => ({ key: p.id, text: p.name, note: `bán ${money(p.price)} · vốn ${money(costOf(p))}`, link: '/san-pham' })),
  })
  add({
    id: 'zero-price',
    level: 'warn',
    title: 'Món đang bán chưa có giá',
    why: 'Bán ra được tính 0đ doanh thu.',
    items: active.filter((p) => !(Number(p.price) > 0)).map((p) => ({ key: p.id, text: p.name, link: '/san-pham' })),
  })

  // ---- dòng bán đã ghi ----
  const prodMap = toMap(d.products)
  const zero = {}
  d.sales.forEach((r) => {
    const p = prodMap[r.product_id]
    const n = Number(r.quantity) + Number(r.gift_qty || 0)
    if (!p || n <= 0 || Number(r.unit_cost) !== 0) return
    const pack = r.pack === 'chai' ? 'chai' : 'ly'
    const cost = packCost(p, pack, costOf(p), d.chaiDef)
    if (!(cost > 0)) return
    const g = (zero[`${p.id}:${pack}`] ||= { p, pack, cost, ids: [], qty: 0 })
    g.ids.push(r.id)
    g.qty += n
  })
  add({
    id: 'zero-cost',
    level: 'error',
    title: `Đã bán với giá vốn 0đ (${DAYS} ngày qua)`,
    why: 'Các phần này bán lúc món chưa có công thức / nguyên liệu chưa có giá, nên lãi những ngày đó bị báo cao hơn thực tế. Bấm sửa để tính giá vốn theo công thức hiện tại.',
    items: Object.values(zero).map((g) => ({
      key: `${g.p.id}:${g.pack}`,
      text: `${g.p.name}${g.pack === 'chai' ? ' (Chai)' : ''} · ${g.qty} phần`,
      note: `lãi đang bị báo cao ≈ ${money(g.qty * g.cost)}`,
      ids: g.ids,
      cost: g.cost,
    })),
    fix: 'cost',
  })
  add({
    id: 'sale-no-price',
    level: 'warn',
    title: `Dòng bán giá 0đ (${DAYS} ngày qua)`,
    why: 'Được tính là đã bán nhưng doanh thu 0đ. Nếu là tặng khách thì nên ghi vào ô "Tặng" để số phần bán không bị độn.',
    items: d.sales
      .filter((r) => Number(r.quantity) > 0 && Number(r.unit_price) === 0)
      .map((r) => ({ key: r.id, text: `${r.product_name} · ${fmtDate(r.date)}`, note: `${r.quantity} phần`, link: '/ban-hang' })),
  })

  // ---- tồn kho ----
  const tracked = d.ingredients.filter((g) => !g.no_stock)
  add({
    id: 'negative-stock',
    level: 'warn',
    title: 'Tồn kho âm',
    why: 'Bán ra nhiều hơn số đã nhập + kiểm kê. Thường do quên ghi nhập hàng, công thức ghi nhiều hơn thực tế, hoặc lâu chưa kiểm kê.',
    items: tracked
      .filter((g) => d.stock[g.id] < -1e-6)
      .map((g) => ({ key: g.id, text: g.name, note: `còn ${fmtQty(d.stock[g.id], g.unit)}`, link: '/nguyen-lieu' })),
  })
  add({
    id: 'never-counted',
    level: 'info',
    title: 'Nguyên liệu chưa kiểm kê lần nào',
    why: 'Tồn kho đang tính từ 0 (chỉ cộng hàng nhập). Kiểm kê 1 lần để số tồn đúng với hàng thật.',
    items: tracked.filter((g) => !d.lastCount[g.id]).map((g) => ({ key: g.id, text: g.name, link: '/nguyen-lieu' })),
  })

  const rank = { error: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
