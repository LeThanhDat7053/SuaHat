import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, CupSoda } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { money, todayStr } from '../lib/format'
import { productCost, toMap } from '../lib/cost'
import { DateNav, Empty, Loading, PageHeader, StatTile } from '../components/ui'

export default function Sales() {
  const [date, setDate] = useState(todayStr())
  const [products, setProducts] = useState(null)
  const [ingMap, setIngMap] = useState({})
  const [rows, setRows] = useState({}) // product_id → dòng bán của ngày đang xem
  const [others, setOthers] = useState([]) // dòng bán của món đã ẩn / đã xóa
  const [status, setStatus] = useState('')

  const timers = useRef({})
  const pending = useRef({})
  const ingRef = useRef({})
  ingRef.current = ingMap

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('ingredients').select('*'),
    ]).then(([p, i]) => {
      if (showError(p.error || i.error)) return
      setProducts(p.data)
      setIngMap(toMap(i.data))
    })
  }, [])

  const save = useCallback(async (job) => {
    const { date, product, quantity, row } = job
    setStatus('saving')
    const { error } =
      quantity <= 0
        ? await supabase.from('sales').delete().eq('date', date).eq('product_id', product.id)
        : await supabase.from('sales').upsert(
            {
              date,
              product_id: product.id,
              product_name: product.name,
              quantity,
              // giữ giá của lần nhập đầu tiên trong ngày để lịch sử không bị thay đổi
              unit_price: row?.unit_price ?? product.price,
              unit_cost: row?.unit_cost ?? productCost(product, ingRef.current),
            },
            { onConflict: 'date,product_id' },
          )
    setStatus(error ? 'error' : 'saved')
    showError(error)
  }, [])

  const flush = useCallback(() => {
    Object.entries(pending.current).forEach(([id, job]) => {
      clearTimeout(timers.current[id])
      save(job)
    })
    pending.current = {}
  }, [save])

  // lưu ngay những thay đổi chưa kịp lưu khi rời trang
  useEffect(() => flush, [flush])

  useEffect(() => {
    flush()
    let cancelled = false
    setRows({})
    supabase
      .from('sales')
      .select('*')
      .eq('date', date)
      .then(({ data, error }) => {
        if (cancelled || showError(error)) return
        const map = {}
        data.forEach((r) => r.product_id && (map[r.product_id] = r))
        setRows(map)
        setOthers(data)
      })
    return () => {
      cancelled = true
    }
  }, [date, flush])

  function change(product, quantity) {
    quantity = Math.max(0, Math.floor(quantity || 0))
    const row = rows[product.id]
    setRows((prev) => ({
      ...prev,
      [product.id]: {
        ...(row || { unit_price: product.price, unit_cost: productCost(product, ingMap) }),
        product_id: product.id,
        product_name: product.name,
        quantity,
      },
    }))
    pending.current[product.id] = { date, product, quantity, row }
    clearTimeout(timers.current[product.id])
    timers.current[product.id] = setTimeout(() => {
      const job = pending.current[product.id]
      delete pending.current[product.id]
      if (job) save(job)
    }, 500)
  }

  if (!products) return <Loading />

  const activeIds = new Set(products.map((p) => p.id))
  const extraRows = others.filter((r) => !activeIds.has(r.product_id))
  const all = [...Object.values(rows).filter((r) => activeIds.has(r.product_id)), ...extraRows]
  const totalQty = all.reduce((s, r) => s + r.quantity, 0)
  const revenue = all.reduce((s, r) => s + r.quantity * r.unit_price, 0)
  const cost = all.reduce((s, r) => s + r.quantity * r.unit_cost, 0)

  return (
    <>
      <PageHeader title="Bán hàng" subtitle="Bấm vào món để cộng 1 phần. Dữ liệu tự lưu.">
        <span className={`save-status ${status}`}>
          {status === 'saving' ? 'Đang lưu…' : status === 'saved' ? 'Đã lưu' : status === 'error' ? 'Lỗi lưu' : ''}
        </span>
      </PageHeader>

      <DateNav date={date} onChange={setDate} />

      <div className="stats stats-3">
        <StatTile label="Đã bán" value={`${totalQty} phần`} />
        <StatTile label="Doanh thu" value={money(revenue)} />
        <StatTile label="Lãi gộp" value={money(revenue - cost)} note={`Giá vốn ${money(cost)}`} tone="good" />
      </div>

      {products.length === 0 ? (
        <Empty icon={CupSoda}>
          Chưa có sản phẩm nào. <Link to="/san-pham">Thêm sản phẩm</Link> trước nhé.
        </Empty>
      ) : (
        <div className="product-grid">
          {products.map((p) => {
            const q = rows[p.id]?.quantity || 0
            return (
              <div key={p.id} className={`sell-card ${q > 0 ? 'has-qty' : ''}`}>
                <button type="button" className="sell-main" onClick={() => change(p, q + 1)}>
                  <span className="sell-name">{p.name}</span>
                  <span className="muted">{money(rows[p.id]?.unit_price ?? p.price)}</span>
                </button>
                <div className="stepper">
                  <button type="button" onClick={() => change(p, q - 1)} disabled={q === 0} aria-label={`Bớt ${p.name}`}>
                    <Minus size={18} />
                  </button>
                  <input
                    inputMode="numeric"
                    value={q}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => change(p, Number(e.target.value.replace(/\D/g, '')))}
                    aria-label={`Số lượng ${p.name}`}
                  />
                  <button type="button" onClick={() => change(p, q + 1)} aria-label={`Thêm ${p.name}`}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {extraRows.length > 0 && (
        <div className="card list-card" style={{ marginTop: 16 }}>
          <div className="list-head">Món đã ẩn / đã xóa (vẫn tính vào doanh thu)</div>
          {extraRows.map((r) => (
            <div key={r.id} className="list-row">
              <span className="grow">{r.product_name}</span>
              <span>
                {r.quantity} × {money(r.unit_price)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
