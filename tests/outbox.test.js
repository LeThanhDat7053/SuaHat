import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb } from './fakeDb'

// localStorage giả (máy thật: trình duyệt)
const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
}

let fake
vi.mock('../src/lib/supabase', () => ({
  get supabase() {
    return fake.supabase
  },
  fetchAll: (b) => fake.fetchAll(b),
  getSetting: async (_k, f) => f,
  getSettingStrict: async (_k, f) => f,
}))
vi.mock('../src/lib/live', () => ({ notifyChange: () => {} }))

const ob = await import('../src/lib/outbox')
const { invalidateCache } = await import('../src/lib/cache')

// Hàm database giống file nang-cap-v10.sql / v3: lưu đơn theo client_id (chỉ 1 lần), "Đã xong" chỉ 1 lần.
// `loseReply`: lưu xong nhưng trả lỗi mạng (giả lập rớt mạng đúng lúc nhận kết quả).
let loseReply = 0
const rpc = {
  save_quick_order: ({ p_client_id, p_order, p_rows }, db) => {
    const old = db.quick_orders.find((o) => o.client_id === p_client_id)
    if (old) return { data: old, error: null }
    const o = { id: db.quick_orders.length + 1, ...p_order, client_id: p_client_id, status: p_rows ? 'done' : 'pending' }
    db.quick_orders.push(o)
    if (p_rows) p_rows.forEach((r, i) => db.sales.push({ id: 900 + db.sales.length + i, ...r, source: r.source.replace('{id}', o.id) }))
    if (loseReply > 0) {
      loseReply--
      return { data: null, error: { message: 'TypeError: Failed to fetch' } }
    }
    return { data: o, error: null }
  },
  complete_quick_order: ({ p_id, p_rows }, db) => {
    const o = db.quick_orders.find((x) => x.id === p_id && x.status === 'pending')
    if (!o) return { data: null, error: { code: 'P0001', message: 'Đơn này đã được bấm xong rồi (hoặc đã bị xóa)' } }
    o.status = 'done'
    p_rows.forEach((r) => db.sales.push({ id: 900 + db.sales.length, ...r }))
    return { data: null, error: null }
  },
}

const catalog = {
  products: [{ id: 7, name: 'Sữa điều', price: 25000, recipe: [], recipe_id: null, volume_ml: 0 }],
  ingredients: [],
  recipes: [],
}
const lines = [{ product_id: 7, name: 'Sữa điều', pack: 'ly', temp: 'da', qty: 2, price: 25000, cost: 9000 }]
const order = { date: '2026-10-26', note: 'Chị Lan', lines, total: 50000, wholesale: false, created_at: '2026-10-26T02:00:00Z' }
const saleJob = (qty) => ({
  type: 'sale',
  key: 'sale:2026-10-26:7',
  date: '2026-10-26',
  product_id: 7,
  row: { date: '2026-10-26', product_id: 7, product_name: 'Sữa điều', source: '', quantity: qty, unit_price: 25000, unit_cost: 9000 },
})

beforeEach(() => {
  storage.clear()
  loseReply = 0
  invalidateCache()
  fake = createFakeDb({ ...catalog, sales: [], waste: [], quick_orders: [] }, { rpc })
  ob._reset()
})

describe('Có mạng', () => {
  it('gửi ngay, trả kết quả, hàng chờ trống', async () => {
    const res = await ob.send(saleJob(3))
    expect(res.error).toBeFalsy()
    expect(res.queued).toBeFalsy()
    expect(fake.db.sales).toHaveLength(1)
    expect(fake.db.sales[0].quantity).toBe(3)
    expect(ob.outboxJobs()).toHaveLength(0)
  })

  it('lập đơn "Xong luôn": lưu đơn + doanh thu, số đơn thật thay vào source', async () => {
    const res = await ob.sendNewQuickOrder(order, true)
    expect(res.data.status).toBe('done')
    expect(fake.db.quick_orders).toHaveLength(1)
    expect(fake.db.sales).toHaveLength(1)
    expect(fake.db.sales[0]).toMatchObject({ source: 'quick:1:ly:da', quantity: 2, unit_price: 25000, unit_cost: 9000, date: '2026-10-26' })
  })

  it('database từ chối (lỗi dữ liệu) → báo lỗi ngay, không giữ lại', async () => {
    fake.db.quick_orders.push({ id: 5, status: 'pending' })
    const res = await ob.send({ type: 'quick-done', order_id: 5, rows: 'không phải danh sách' })
    expect(res.error).toBeTruthy()
    expect(ob.outboxJobs()).toHaveLength(0)
  })
})

describe('Mất mạng', () => {
  it('giữ trong máy, có mạng lại tự gửi', async () => {
    fake.state.offline = true
    const res = await ob.send(saleJob(3))
    expect(res.queued).toBe(true)
    expect(fake.db.sales).toHaveLength(0)
    expect(JSON.parse(storage.get('outbox'))).toHaveLength(1) // đã lưu vào máy

    fake.state.offline = false
    await ob.flush()
    expect(fake.db.sales).toHaveLength(1)
    expect(ob.outboxJobs()).toHaveLength(0)
  })

  it('tắt app / tải lại trang vẫn còn, rồi gửi được', async () => {
    fake.state.offline = true
    await ob.sendNewQuickOrder(order, true)
    ob._reset() // giả lập mở lại app: đọc lại từ bộ nhớ máy
    expect(ob.outboxJobs()).toHaveLength(1)
    fake.state.offline = false
    await ob.flush()
    expect(fake.db.quick_orders).toHaveLength(1)
    expect(fake.db.sales).toHaveLength(1)
  })

  it('sửa số bán cùng món nhiều lần → chỉ gửi số cuối cùng', async () => {
    fake.state.offline = true
    await ob.send(saleJob(1))
    await ob.send(saleJob(2))
    await ob.send(saleJob(5))
    expect(ob.outboxJobs()).toHaveLength(1)
    fake.state.offline = false
    await ob.flush()
    expect(fake.db.sales).toHaveLength(1)
    expect(fake.db.sales[0].quantity).toBe(5)
  })

  it('gửi đúng thứ tự đã bấm', async () => {
    fake.state.offline = true
    await ob.sendNewQuickOrder(order, false)
    await ob.send(saleJob(4))
    await ob.sendNewQuickOrder({ ...order, note: 'Anh Tú' }, true)
    fake.state.offline = false
    await ob.flush()
    const order_ = fake.calls.map((c) => c.rpc || c.table)
    expect(order_.filter((x) => x !== 'products' && x !== 'ingredients' && x !== 'recipes')).toEqual(['save_quick_order', 'sales', 'save_quick_order'])
    expect(fake.db.quick_orders.map((o) => o.note)).toEqual(['Chị Lan', 'Anh Tú'])
  })

  it('đơn lập lúc mất mạng: sửa / bấm xong / xóa ngay trong máy', async () => {
    fake.state.offline = true
    await ob.sendNewQuickOrder(order, false)
    const [local] = ob.localOrders(ob.outboxJobs())
    expect(local).toMatchObject({ note: 'Chị Lan', status: 'pending', local: true })

    expect(ob.updateJob(local.id, (j) => ({ order: { ...j.order, note: 'Chị Lan bàn 2' } }))).toBe(true)
    await ob.finishLocalOrder(local.id)
    expect(ob.localOrders(ob.outboxJobs())).toHaveLength(0) // đã xong → không còn trong đơn chờ
    expect(ob.unsentSales(ob.outboxJobs())).toHaveLength(1) // nhưng vẫn cộng vào số hôm nay

    fake.state.offline = false
    await ob.flush()
    expect(fake.db.quick_orders[0]).toMatchObject({ note: 'Chị Lan bàn 2', status: 'done' })
    expect(fake.db.sales).toHaveLength(1)
  })

  it('xóa đơn chưa gửi → không gửi gì', async () => {
    fake.state.offline = true
    await ob.sendNewQuickOrder(order, false)
    const [local] = ob.localOrders(ob.outboxJobs())
    expect(ob.removeJob(local.id)).toBe(true)
    fake.state.offline = false
    await ob.flush()
    expect(fake.db.quick_orders).toHaveLength(0)
  })
})

describe('Không bao giờ ghi trùng', () => {
  it('đã lưu nhưng rớt mạng lúc nhận kết quả → gửi lại vẫn chỉ 1 đơn, doanh thu 1 lần', async () => {
    loseReply = 1
    const res = await ob.sendNewQuickOrder(order, true)
    expect(res.queued).toBe(true) // máy tưởng chưa gửi được
    expect(fake.db.quick_orders).toHaveLength(1) // thật ra database đã lưu

    await ob.flush() // gửi lại
    expect(fake.db.quick_orders).toHaveLength(1)
    expect(fake.db.sales).toHaveLength(1)
    expect(ob.outboxJobs()).toHaveLength(0)
  })

  it('"Đã xong" gửi lại khi đơn đã xong (lần trước đã tới / máy khác bấm) → coi như xong, không ghi thêm', async () => {
    fake.db.quick_orders.push({ id: 1, ...order, status: 'pending' })
    await ob.sendQuickDone({ id: 1, ...order })
    const res = await ob.sendQuickDone({ id: 1, ...order })
    expect(res.error).toBeFalsy()
    expect(fake.db.sales).toHaveLength(1)
  })
})

describe('Lỗi khi gửi ngầm', () => {
  it('việc lỗi được giữ lại để xử lý, các việc sau vẫn gửi; sửa xong thì gửi lại được', async () => {
    fake.state.offline = true
    await ob.sendNewQuickOrder(order, false)
    await ob.send(saleJob(2))
    const saved = rpc.save_quick_order
    delete rpc.save_quick_order // giả lập chưa chạy nang-cap-v10.sql
    fake.state.offline = false
    await ob.flush()
    const jobs = ob.outboxJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].error).toBe(ob.QUICK_UPGRADE)
    expect(fake.db.sales).toHaveLength(1) // việc sau vẫn gửi

    rpc.save_quick_order = saved // đã chạy file nâng cấp
    await ob.retryFailed()
    expect(ob.outboxJobs()).toHaveLength(0)
    expect(fake.db.quick_orders).toHaveLength(1)
  })

  it('chưa đăng nhập lại được (phiên hết hạn lúc mất mạng) → giữ nguyên, không gửi', async () => {
    fake.state.session = null
    const res = await ob.send(saleJob(1))
    expect(res.queued).toBe(true)
    expect(fake.db.sales).toHaveLength(0)
    fake.state.session = { user: {} }
    await ob.flush()
    expect(fake.db.sales).toHaveLength(1)
  })
})
