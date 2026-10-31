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

describe('gop-bap.sql', () => {
  const run = (g) => db.exec(sql('gop-bap.sql').replace('gam_moi_trai numeric := 0;', `gam_moi_trai numeric := ${g};`))

  it('chưa điền số g 1 trái → báo lỗi, không sửa gì', async () => {
    await expect(db.exec(sql('gop-bap.sql'))).rejects.toThrow(/gam_moi_trai/)
  })

  it('gộp Bắp SB (trái) vào Bắp (g): mẻ trái vẫn hiện trái, mẻ g vẫn hiện g', async () => {
    await db.exec(`
      insert into ingredients (id, name, unit, price_per_unit) overriding system value values
        (101, 'Bắp', 'g', 0), (102, 'Bắp SB', 'trái', 6000), (103, 'Đường', 'g', 20);
      insert into recipes (id, name, yield_ml, items) overriding system value values
        (201, 'Sữa bắp', 5000, '[{"ingredient_id":102,"amount":20},{"ingredient_id":103,"amount":300}]'),
        (202, 'Chè bắp', 3000, '[{"ingredient_id":101,"amount":500}]');
      insert into products (id, name, price, recipe) overriding system value values
        (301, 'Bắp xào', 20000, '[{"ingredient_id":101,"amount":100}]');
    `)
    await expect(db.exec(sql('gop-bap-xem-truoc.sql'))).resolves.toBeTruthy()
    await run(150)

    const g = await one(`select * from ingredients where id = 101`)
    expect([g.alt_unit, Number(g.alt_base), Number(g.alt_qty), Number(g.price_per_unit)]).toEqual(['trái', 150, 1, 40])
    expect((await one(`select items from recipes where id = 201`)).items).toEqual([
      { ingredient_id: 101, amount: 3000, unit: 'trái' },
      { ingredient_id: 103, amount: 300 },
    ])
    expect((await one(`select items from recipes where id = 202`)).items).toEqual([{ ingredient_id: 101, amount: 500, unit: 'g' }])
    expect((await one(`select recipe from products where id = 301`)).recipe).toEqual([{ ingredient_id: 101, amount: 100, unit: 'g' }])
    const t = await one(`select * from ingredients where id = 102`)
    expect([t.name, t.no_stock]).toEqual(['Bắp SB (đã gộp vào Bắp)', true])
  })

  it('chạy lần 2 → báo đã gộp, không nhân lượng lần nữa', async () => {
    await expect(run(150)).rejects.toThrow(/đã gộp rồi/)
    expect((await one(`select items from recipes where id = 201`)).items[0].amount).toBe(3000)
  })
})
