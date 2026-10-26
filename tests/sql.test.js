import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// Chạy THẬT các file SQL (schema + nâng cấp) trên Postgres trong máy (PGlite), rồi gọi thử các hàm database.
const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8')
const FILES = ['schema.sql', 'nang-cap-v2.sql', 'nang-cap-v3.sql', 'nang-cap-v4.sql', 'nang-cap-v6.sql', 'nang-cap-v7.sql', 'nang-cap-v8.sql', 'nang-cap-v9.sql', 'nang-cap-v10.sql']

let db
const one = async (q, p) => (await db.query(q, p)).rows[0]
const count = async (q, p) => Number((await one(`select count(*)::int as n from ${q}`, p)).n)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role authenticated; create role anon;`) // có sẵn trên Supabase
  for (const f of FILES) await db.exec(sql(f))
  await db.exec(`insert into products (id, name, price) overriding system value values (7, 'Sữa điều', 25000)`)
}, 60000)

const order = { date: '2026-10-26', note: 'Chị Lan', lines: [{ product_id: 7, qty: 2 }], total: 50000, wholesale: false, created_at: '2026-10-26T02:00:00Z', done_at: '2026-10-26T02:05:00Z' }
const rows = [
  { date: '2026-10-26', product_id: 7, product_name: 'Sữa điều (Ly)', source: 'quick:{id}:ly:da', pack: 'ly', quantity: 2, unit_price: 25000, unit_cost: 9000, usage: { 1: 50 } },
]
const save = (cid, o, r) => one(`select * from save_quick_order($1, $2::jsonb, $3::jsonb)`, [cid, JSON.stringify(o), r ? JSON.stringify(r) : null])

describe('File nâng cấp', () => {
  it('chạy lại lần 2 không lỗi, không mất dữ liệu', async () => {
    for (const f of FILES.slice(1)) await db.exec(sql(f))
    expect(await count('products')).toBe(1)
  })
})

describe('save_quick_order (nang-cap-v10)', () => {
  it('"Xong luôn": lưu đơn đã xong + dòng bán, thay {id} bằng số đơn thật', async () => {
    const o = await save('may-1-don-1', order, rows)
    expect(o.status).toBe('done')
    expect(new Date(o.done_at).toISOString()).toBe('2026-10-26T02:05:00.000Z')
    expect(new Date(o.created_at).toISOString()).toBe('2026-10-26T02:00:00.000Z') // giờ lập đơn thật, không phải giờ gửi
    const s = await one(`select * from sales where source like 'quick:%'`)
    expect(s.source).toBe(`quick:${o.id}:ly:da`)
    expect(Number(s.quantity)).toBe(2)
    expect(Number(s.unit_cost)).toBe(9000)
    expect(s.usage).toEqual({ 1: 50 })
    expect(s.wholesale).toBe(false)
  })

  it('gửi lại cùng mã → trả đơn cũ, không thêm đơn, không cộng tiền lần 2', async () => {
    const before = await count('sales')
    const o1 = await one(`select id from quick_orders where client_id = 'may-1-don-1'`)
    const o2 = await save('may-1-don-1', order, rows)
    expect(o2.id).toBe(o1.id)
    expect(await count(`quick_orders where client_id = 'may-1-don-1'`)).toBe(1)
    expect(await count('sales')).toBe(before)
  })

  it('đơn chờ giao: không ghi doanh thu; bấm xong 1 lần mới ghi; bấm lần 2 bị chặn', async () => {
    const o = await save('may-1-don-2', { ...order, note: 'Anh Tú' }, null)
    expect(o.status).toBe('pending')
    expect(await count(`sales where source like $1`, [`quick:${o.id}:%`])).toBe(0)

    const done = rows.map((r) => ({ ...r, source: `quick:${o.id}:ly:da` }))
    await db.query(`select complete_quick_order($1, $2::jsonb)`, [o.id, JSON.stringify(done)])
    expect(await count(`sales where source like $1`, [`quick:${o.id}:%`])).toBe(1)
    await expect(db.query(`select complete_quick_order($1, $2::jsonb)`, [o.id, JSON.stringify(done)])).rejects.toThrow(/đã được bấm xong/)
    expect(await count(`sales where source like $1`, [`quick:${o.id}:%`])).toBe(1)
  })

  it('đơn bán sỉ: cờ sỉ ghi vào đơn và dòng bán', async () => {
    const o = await save('may-2-don-1', { ...order, wholesale: true }, rows.map((r) => ({ ...r, wholesale: true })))
    expect(o.wholesale).toBe(true)
    const s = await one(`select wholesale from sales where source like $1`, [`quick:${o.id}:%`])
    expect(s.wholesale).toBe(true)
  })

  it('ghi chú trống → null như đơn lập bình thường', async () => {
    const o = await save('may-2-don-2', { ...order, note: '' }, null)
    expect(o.note).toBeNull()
  })
})
