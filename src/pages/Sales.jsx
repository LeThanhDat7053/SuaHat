import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, CupSoda, Ellipsis, Wallet, Trash2 } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { money, moneyShort, todayStr } from '../lib/format'
import { productCost, saleCost, saleRevenue, toMap } from '../lib/cost'
import { DateNav, Empty, Field, Loading, Modal, MoneyInput, PageHeader, SaveButton, StatTile, useSubmit } from '../components/ui'

const isEmptyRow = (r) => !(r.quantity > 0) && !(r.gift_qty > 0) && !(Number(r.discount) > 0)

export default function Sales() {
  const [date, setDate] = useState(todayStr())
  const [products, setProducts] = useState(null)
  const [costCtx, setCostCtx] = useState({ ing: {}, rec: {} })
  const [rows, setRows] = useState({}) // product_id → dòng bán tại quán của ngày đang xem
  const [dayRows, setDayRows] = useState([]) // mọi dòng bán trong ngày (cả đơn đặt, món đã ẩn)
  const [waste, setWaste] = useState({}) // product_id → dòng hủy
  const [deposits, setDeposits] = useState(0)
  const [extra, setExtra] = useState(null) // món đang mở "Tặng / giảm / hủy"
  const [status, setStatus] = useState('')

  const timers = useRef({})
  const pending = useRef({})

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('ingredients').select('*'),
      supabase.from('recipes').select('*'),
    ]).then(([p, i, r]) => {
      if (showError(p.error || i.error || r.error)) return
      setProducts(p.data)
      setCostCtx({ ing: toMap(i.data), rec: toMap(r.data) })
    })
  }, [])

  const save = useCallback(async (date, product, row) => {
    setStatus('saving')
    const { error } = isEmptyRow(row)
      ? await supabase.from('sales').delete().eq('date', date).eq('product_id', product.id).eq('source', '')
      : await supabase.from('sales').upsert(
          {
            date,
            product_id: product.id,
            product_name: product.name,
            source: '',
            quantity: row.quantity || 0,
            gift_qty: row.gift_qty || 0,
            discount: Number(row.discount || 0),
            unit_price: row.unit_price,
            unit_cost: row.unit_cost,
          },
          { onConflict: 'date,product_id,source' },
        )
    setStatus(error ? 'error' : 'saved')
    showError(error)
  }, [])

  const flush = useCallback(() => {
    Object.entries(pending.current).forEach(([id, job]) => {
      clearTimeout(timers.current[id])
      save(job.date, job.product, job.row)
    })
    pending.current = {}
  }, [save])

  // lưu ngay những thay đổi chưa kịp lưu khi rời trang
  useEffect(() => flush, [flush])

  async function loadDay(date, cancelled = () => false) {
    const [s, w, o] = await Promise.all([
      supabase.from('sales').select('*').eq('date', date),
      supabase.from('waste').select('*').eq('date', date),
      supabase.from('orders').select('deposit').eq('order_date', date).eq('status', 'done'),
    ])
    if (cancelled() || showError(s.error || w.error || o.error)) return
    const map = {}
    s.data.forEach((r) => r.product_id && r.source === '' && (map[r.product_id] = r))
    setRows(map)
    setDayRows(s.data)
    setWaste(Object.fromEntries(w.data.map((r) => [r.product_id, r])))
    setDeposits(o.data.reduce((sum, r) => sum + Number(r.deposit), 0))
  }

  useEffect(() => {
    flush()
    let cancelled = false
    setRows({})
    loadDay(date, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [date, flush])

  const newRow = (product) => ({
    quantity: 0,
    gift_qty: 0,
    discount: 0,
    unit_price: product.price,
    unit_cost: productCost(product, costCtx.ing, costCtx.rec),
  })

  // patch: { quantity } hoặc { gift_qty, discount }
  function change(product, patch) {
    if ('quantity' in patch) patch.quantity = Math.max(0, Math.floor(patch.quantity || 0))
    // giữ giá của lần nhập đầu tiên trong ngày để lịch sử không bị thay đổi
    const row = { ...(rows[product.id] || newRow(product)), product_id: product.id, product_name: product.name, source: '', ...patch }
    setRows((prev) => ({ ...prev, [product.id]: row }))
    pending.current[product.id] = { date, product, row }
    clearTimeout(timers.current[product.id])
    timers.current[product.id] = setTimeout(() => {
      const job = pending.current[product.id]
      delete pending.current[product.id]
      if (job) save(job.date, job.product, job.row)
    }, 500)
  }

  async function saveWaste(product, quantity, reason) {
    setStatus('saving')
    const { data, error } =
      quantity > 0
        ? await supabase
            .from('waste')
            .upsert(
              {
                date,
                product_id: product.id,
                product_name: product.name,
                quantity,
                unit_cost: waste[product.id]?.unit_cost ?? productCost(product, costCtx.ing, costCtx.rec),
                reason: reason || null,
              },
              { onConflict: 'date,product_id' },
            )
            .select()
            .single()
        : await supabase.from('waste').delete().eq('date', date).eq('product_id', product.id)
    setStatus(error ? 'error' : 'saved')
    if (showError(error)) return
    setWaste((prev) => {
      const next = { ...prev }
      if (data) next[product.id] = data
      else delete next[product.id]
      return next
    })
  }

  async function removeRow(r) {
    if (!confirm(`Xóa ${r.quantity} phần "${r.product_name}" khỏi doanh thu ngày này?`)) return
    const { error } = await supabase.from('sales').delete().eq('id', r.id)
    if (!showError(error)) setDayRows((prev) => prev.filter((x) => x.id !== r.id))
  }

  if (!products) return <Loading />

  const activeIds = new Set(products.map((p) => p.id))
  const shopRows = Object.values(rows).filter((r) => activeIds.has(r.product_id))
  const otherRows = dayRows.filter((r) => !(r.source === '' && activeIds.has(r.product_id)))
  const orderRows = otherRows.filter((r) => r.source.startsWith('order:'))
  const hiddenRows = otherRows.filter((r) => r.source === '')
  const all = [...shopRows, ...otherRows]
  const totalQty = all.reduce((s, r) => s + r.quantity, 0)
  const revenue = all.reduce((s, r) => s + saleRevenue(r), 0)
  const cost = all.reduce((s, r) => s + saleCost(r), 0)
  const wasteList = Object.values(waste)
  const wasteQty = wasteList.reduce((s, r) => s + r.quantity, 0)
  const wasteCost = wasteList.reduce((s, r) => s + r.quantity * r.unit_cost, 0)

  return (
    <>
      <PageHeader title="Bán hàng" subtitle="Bấm vào món để cộng 1 phần. Dữ liệu tự lưu.">
        <span className={`save-status ${status}`}>
          {status === 'saving' ? (
            <>
              <span className="spinner" aria-hidden="true" /> Đang lưu…
            </>
          ) : status === 'saved' ? (
            '✓ Đã lưu'
          ) : status === 'error' ? (
            'Lỗi lưu'
          ) : (
            ''
          )}
        </span>
      </PageHeader>

      <DateNav date={date} onChange={setDate} />

      <div className="stats stats-3">
        <StatTile label="Đã bán" value={`${totalQty} phần`} note={wasteQty ? `Hủy ${wasteQty} phần` : undefined} />
        <StatTile label="Doanh thu" value={money(revenue)} />
        <StatTile
          label="Lãi gộp"
          value={money(revenue - cost - wasteCost)}
          note={`Giá vốn ${moneyShort(cost)}${wasteCost ? ` · hủy ${moneyShort(wasteCost)}` : ''}`}
          tone="good"
        />
      </div>

      {products.length === 0 ? (
        <Empty icon={CupSoda}>
          Chưa có sản phẩm nào. <Link to="/san-pham">Thêm sản phẩm</Link> trước nhé.
        </Empty>
      ) : (
        <div className="product-grid">
          {products.map((p) => {
            const r = rows[p.id]
            const q = r?.quantity || 0
            const tags = [
              r?.gift_qty > 0 && `Tặng ${r.gift_qty}`,
              r?.discount > 0 && `Giảm ${moneyShort(r.discount)}`,
              waste[p.id] && `Hủy ${waste[p.id].quantity}`,
            ].filter(Boolean)
            return (
              <div key={p.id} className={`sell-card ${q > 0 ? 'has-qty' : ''}`}>
                <div className="sell-top">
                  <button type="button" className="sell-main" onClick={() => change(p, { quantity: q + 1 })}>
                    <span className="sell-name">{p.name}</span>
                    <span className="muted">{money(r?.unit_price ?? p.price)}</span>
                    {tags.length > 0 && <span className="sell-tags">{tags.join(' · ')}</span>}
                  </button>
                  <button type="button" className="icon-btn sell-more" onClick={() => setExtra(p)} aria-label={`Tặng, giảm giá, hủy ${p.name}`}>
                    <Ellipsis size={18} />
                  </button>
                </div>
                <div className="stepper">
                  <button type="button" onClick={() => change(p, { quantity: q - 1 })} disabled={q === 0} aria-label={`Bớt ${p.name}`}>
                    <Minus size={18} />
                  </button>
                  <input
                    inputMode="numeric"
                    value={q}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => change(p, { quantity: Number(e.target.value.replace(/\D/g, '')) })}
                    aria-label={`Số lượng ${p.name}`}
                  />
                  <button type="button" onClick={() => change(p, { quantity: q + 1 })} aria-label={`Thêm ${p.name}`}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {orderRows.length > 0 && (
        <div className="card list-card" style={{ marginTop: 16 }}>
          <div className="list-head">
            <span>Từ đơn đặt đã giao</span>
            <Link to="/lich">Lịch đơn →</Link>
          </div>
          {orderRows.map((r) => (
            <div key={r.id} className="list-row">
              <span className="grow">{r.product_name}</span>
              <span>
                {r.quantity} × {money(r.unit_price)}
                {r.discount > 0 && <span className="muted small"> − {money(r.discount)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {hiddenRows.length > 0 && (
        <div className="card list-card" style={{ marginTop: 16 }}>
          <div className="list-head">Món đã ẩn / đã xóa (vẫn tính vào doanh thu)</div>
          {hiddenRows.map((r) => (
            <div key={r.id} className="list-row">
              <span className="grow">{r.product_name}</span>
              <span>
                {r.quantity} × {money(r.unit_price)}
              </span>
              <button className="icon-btn" onClick={() => removeRow(r)} aria-label={`Xóa ${r.product_name}`}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <DayClosing date={date} revenue={revenue} deposits={deposits} />

      {extra && (
        <ExtraForm
          product={extra}
          row={rows[extra.id]}
          waste={waste[extra.id]}
          onClose={() => setExtra(null)}
          onSave={async (gift_qty, discount, wasteQty, reason) => {
            const r = rows[extra.id]
            if (gift_qty !== (r?.gift_qty || 0) || discount !== Number(r?.discount || 0)) change(extra, { gift_qty, discount })
            if (wasteQty !== (waste[extra.id]?.quantity || 0) || (reason || null) !== (waste[extra.id]?.reason || null))
              await saveWaste(extra, wasteQty, reason)
            setExtra(null)
          }}
        />
      )}
    </>
  )
}

function ExtraForm({ product, row, waste, onClose, onSave }) {
  const [gift, setGift] = useState(row?.gift_qty || '')
  const [discount, setDiscount] = useState(row?.discount || '')
  const [wasteQty, setWasteQty] = useState(waste?.quantity || '')
  const [reason, setReason] = useState(waste?.reason || '')
  const int = (v) => Math.max(0, Math.floor(Number(v) || 0))
  const [busy, onSubmit] = useSubmit(() => onSave(int(gift), Number(discount || 0), int(wasteQty), reason.trim()))

  return (
    <Modal title={product.name} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <div className="form-row">
          <Field label="Tặng khách (phần)" hint="Tính giá vốn, không tính doanh thu">
            <input type="number" min="0" inputMode="numeric" value={gift} onChange={(e) => setGift(e.target.value)} />
          </Field>
          <Field label="Tổng tiền giảm giá hôm nay" hint="VD: khách quen giảm 5.000đ × 3 phần = 15.000đ">
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Hủy / đổ bỏ (phần)" hint="Quá hạn, hỏng, đổ vỡ">
            <input type="number" min="0" inputMode="numeric" value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} />
          </Field>
          <Field label="Lý do hủy">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Quá hạn 3 ngày…" />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Đóng
          </button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}

// Chốt tiền cuối ngày: so tiền thực thu (két + chuyển khoản) với doanh thu trên sổ
function DayClosing({ date, revenue, deposits }) {
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    setForm(null)
    supabase
      .from('day_closings')
      .select('*')
      .eq('date', date)
      .maybeSingle()
      .then(({ data, error }) => {
        if (showError(error)) return
        setSaved(data)
        setForm({ cash: data?.cash ?? '', transfer: data?.transfer ?? '', note: data?.note || '' })
      })
  }, [date])

  const [busy, onSubmit] = useSubmit(submit)

  if (!form) return null
  const collected = Number(form.cash || 0) + Number(form.transfer || 0)
  const expected = revenue - deposits
  const diff = collected - expected
  const touched = form.cash !== '' || form.transfer !== ''

  async function submit() {
    const { data, error } = await supabase
      .from('day_closings')
      .upsert({ date, cash: Number(form.cash || 0), transfer: Number(form.transfer || 0), note: form.note.trim() || null }, { onConflict: 'date' })
      .select()
      .single()
    if (!showError(error)) setSaved(data)
  }

  return (
    <form className="card closing" onSubmit={onSubmit}>
      <div className="section-head">
        <h2>
          <Wallet size={18} className="inline-icon" /> Chốt tiền cuối ngày
        </h2>
        {saved && <span className="badge badge-good">Đã chốt</span>}
      </div>
      <div className="form-row">
        <Field label="Tiền mặt thu trong ngày">
          <MoneyInput value={form.cash} onChange={(v) => setForm({ ...form, cash: v })} />
        </Field>
        <Field label="Chuyển khoản nhận được">
          <MoneyInput value={form.transfer} onChange={(v) => setForm({ ...form, transfer: v })} />
        </Field>
      </div>
      {touched && (
        <div className="summary-box">
          <div className="kv">
            <span>Doanh thu trên sổ{deposits > 0 ? ` (trừ cọc đã thu trước ${money(deposits)})` : ''}</span>
            <span>{money(expected)}</span>
          </div>
          <div className="kv">
            <span>Thực thu</span>
            <span>{money(collected)}</span>
          </div>
          <div className="kv">
            <span>Chênh lệch</span>
            <strong className={Math.abs(diff) < 1 ? 'good-text' : 'danger-text'}>
              {Math.abs(diff) < 1 ? 'Khớp' : `${diff > 0 ? 'Dư' : 'Thiếu'} ${money(Math.abs(diff))}`}
            </strong>
          </div>
        </div>
      )}
      <Field label="Ghi chú">
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: thiếu 10k do thối nhầm" />
      </Field>
      <div className="form-actions">
        <SaveButton busy={busy}>{saved ? 'Cập nhật' : 'Chốt tiền'}</SaveButton>
      </div>
    </form>
  )
}
