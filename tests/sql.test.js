import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// Chạy THẬT các file SQL (schema + nâng cấp) trên Postgres trong máy (PGlite), rồi gọi thử các hàm database.
const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8')
const FILES = ['schema.sql', 'nang-cap-v2.sql', 'nang-cap-v3.sql', 'nang-cap-v4.sql', 'nang-cap-v6.sql', 'nang-cap-v7.sql', 'nang-cap-v8.sql', 'nang-cap-v9.sql', 'nang-cap-v10.sql', 'nang-cap-v11.sql']

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

describe('nang-cap-v11.sql (gộp bắp)', () => {
  const run = () => db.exec(sql('nang-cap-v11.sql'))

  it('gộp Bắp SB (trái) vào Bắp (g): mẻ trái vẫn hiện trái, mẻ g vẫn hiện g, lịch sử đổi ra g rồi xóa Bắp SB', async () => {
    await db.exec(`
      insert into ingredients (id, name, unit, price_per_unit) overriding system value values
        (101, 'Bắp', 'g', 16), (102, 'Bắp SB', 'trái', 6571), (103, 'Đường', 'g', 20);
      insert into recipes (id, name, yield_ml, items) overriding system value values
        (201, 'Sữa bắp', 5000, '[{"ingredient_id":102,"amount":4},{"ingredient_id":103,"amount":300}]'),
        (202, 'Chè bắp', 3000, '[{"ingredient_id":101,"amount":120}]');
      insert into products (id, name, price, recipe) overriding system value values
        (301, 'Bắp xào', 20000, '[{"ingredient_id":101,"amount":100}]');
      insert into purchases (date, ingredient_id, item_name, quantity, unit, total) values ('2026-10-20', 102, 'Bắp SB', 30, 'trái', 240000);
      insert into stock_counts (date, ingredient_id, counted, expected, unit_price) values ('2026-10-21', 102, 2, 5, 8000);
    `)
    await run()

    const g = await one(`select * from ingredients where id = 101`)
    expect([g.alt_unit, Number(g.alt_base), Number(g.alt_qty), +Number(g.price_per_unit).toFixed(4)]).toEqual(['trái', 150, 1, 53.3333])
    expect(await count(`ingredients where id = 102`)).toBe(0)
    expect((await one(`select items from recipes where id = 201`)).items).toEqual([
      { ingredient_id: 101, amount: 600, unit: 'trái' },
      { ingredient_id: 103, amount: 300 },
    ])
    expect((await one(`select items from recipes where id = 202`)).items).toEqual([{ ingredient_id: 101, amount: 120, unit: 'g' }])
    expect((await one(`select recipe from products where id = 301`)).recipe).toEqual([{ ingredient_id: 101, amount: 100, unit: 'g' }])
    const p = await one(`select * from purchases where ingredient_id = 101`)
    expect([Number(p.quantity), p.unit, Number(p.total), p.in_count, p.item_name]).toEqual([4500, 'g', 240000, true, 'Bắp'])
    const c = await one(`select * from stock_counts where ingredient_id = 101`)
    // tiền hao hụt giữ nguyên: (5 − 2) trái × 8.000đ = (750 − 300) g × 53,33đ
    expect([Number(c.counted), Number(c.expected), (Number(c.expected) - Number(c.counted)) * Number(c.unit_price)]).toEqual([300, 750, 24000])
  })

  it('chạy lần 2 → không nhân lượng lần nữa', async () => {
    await run()
    expect((await one(`select items from recipes where id = 201`)).items[0].amount).toBe(600)
    expect(Number((await one(`select quantity from purchases where ingredient_id = 101`)).quantity)).toBe(4500)
  })
})
