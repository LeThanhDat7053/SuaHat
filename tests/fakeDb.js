// Database giả trong bộ nhớ, bắt chước đủ phần supabase-js mà app dùng:
// from(bảng).select().eq/neq/lt/lte/gt/gte/in().order().range() / insert / update / delete / upsert, rpc().
// `missing`: các cột coi như chưa có (giả lập chưa chạy file nâng cấp) → trả lỗi 42703 như Postgres.
// state.offline = true: mọi lệnh trả lỗi mạng như trình duyệt khi rớt wifi. state.session = null: chưa đăng nhập.

export function createFakeDb(tables = {}, { missing = [], rpc = {} } = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]))
  const calls = []
  const state = { offline: false, session: { user: { id: 'admin' } } }
  const NET = { data: null, error: { name: 'TypeError', message: 'TypeError: Failed to fetch' } }
  let nextId = 1000

  function from(table) {
    const filters = []
    const orders = []
    let op = 'select'
    let cols = '*'
    let payload = null
    let rangeArg = null
    let single = null
    let head = false
    let opts = {}

    const q = {
      select(c = '*', o = {}) {
        if (op === 'select') cols = c
        head = !!o.head
        return q
      },
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      neq: (c, v) => (filters.push((r) => r[c] !== v), q),
      lt: (c, v) => (filters.push((r) => r[c] < v), q),
      lte: (c, v) => (filters.push((r) => r[c] <= v), q),
      gt: (c, v) => (filters.push((r) => r[c] > v), q),
      gte: (c, v) => (filters.push((r) => r[c] >= v), q),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
      order: (c) => (orders.push(c), q),
      limit: () => q,
      range: (a, b) => ((rangeArg = [a, b]), q),
      maybeSingle: () => ((single = 'maybe'), q),
      single: () => ((single = 'one'), q),
      insert: (p) => ((op = 'insert'), (payload = p), q),
      upsert: (p, o = {}) => ((op = 'upsert'), (payload = p), (opts = o), q),
      update: (p) => ((op = 'update'), (payload = p), q),
      delete: () => ((op = 'delete'), q),
      then: (ok, fail) => Promise.resolve(run()).then(ok, fail),
    }

    function run() {
      if (state.offline) return NET
      calls.push({ table, op, payload })
      const rows = (db[table] ||= [])
      const missingCol = cols !== '*' && cols.split(',').map((s) => s.trim()).find((c) => missing.includes(`${table}.${c}`))
      if (missingCol) return { data: null, error: { code: '42703', message: `column ${missingCol} does not exist` } }
      const match = (r) => filters.every((f) => f(r))
      if (op === 'insert' || op === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }))
        const keys = opts.onConflict?.split(',')
        const out = list.map((r) => {
          const old = keys && rows.find((x) => keys.every((k) => x[k] === r[k]))
          if (old) return Object.assign(old, r)
          const row = { id: nextId++, ...r }
          rows.push(row)
          return row
        })
        return shape(out)
      }
      if (op === 'update') {
        const hit = rows.filter(match)
        hit.forEach((r) => Object.assign(r, payload))
        return shape(hit)
      }
      if (op === 'delete') {
        db[table] = rows.filter((r) => !match(r))
        return { data: null, error: null }
      }
      let out = rows.filter(match)
      if (orders.length) {
        out = [...out].sort((a, b) => {
          for (const c of orders) if (a[c] !== b[c]) return a[c] < b[c] ? -1 : 1
          return 0
        })
      }
      if (head) return { data: null, count: out.length, error: null }
      if (rangeArg) out = out.slice(rangeArg[0], rangeArg[1] + 1)
      return shape(out)
    }

    function shape(out) {
      // chỉ trả các cột đã chọn, như Postgres (cột chưa có thì không bao giờ có trong kết quả)
      if (op === 'select' && cols !== '*' && !cols.includes('(')) {
        const keys = cols.split(',').map((s) => s.trim())
        out = out.map((r) => Object.fromEntries(keys.filter((k) => k in r).map((k) => [k, r[k]])))
      }
      if (single === 'one') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }
      if (single === 'maybe') return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }
    return q
  }

  const supabase = {
    from,
    auth: { getSession: async () => ({ data: { session: state.session }, error: null }) },
    rpc: async (name, args) => {
      if (state.offline) return NET
      calls.push({ rpc: name, args })
      const fn = rpc[name]
      if (!fn) return { data: null, error: { code: 'PGRST202', message: `function ${name} not found` } }
      return fn(args, db, state)
    },
  }

  async function fetchAll(build) {
    const size = 1000
    let out = []
    for (let start = 0; ; start += size) {
      const { data, error } = await build().range(start, start + size - 1)
      if (error) return { data: null, error }
      out = out.concat(data)
      if (data.length < size) return { data: out, error: null }
    }
  }

  return { db, calls, state, supabase, fetchAll }
}
