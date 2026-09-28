import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Phone, Plus, StickyNote, Check, Pencil, Trash2 } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { addDays, fmtDateLong, fmtTime, money, parseDate, toDateStr, todayStr } from '../lib/format'
import { Field, Modal, MoneyInput, PageHeader } from '../components/ui'
import { linesTotal, orderItemsText, orderSource, syncOrderSales } from '../lib/orders'

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
export const STATUS = {
  pending: { label: 'Chờ giao', cls: 'warn' },
  done: { label: 'Đã giao', cls: 'good' },
  cancelled: { label: 'Đã hủy', cls: 'neutral' },
}

function gridDays(ym) {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const offset = (first.getDay() + 6) % 7 // thứ 2 là đầu tuần
  const start = toDateStr(new Date(y, m - 1, 1 - offset))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  return toDateStr(new Date(y, m - 1 + n, 1)).slice(0, 7)
}

export default function CalendarPage() {
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [selected, setSelected] = useState(todayStr())
  const [orders, setOrders] = useState([])
  const [notes, setNotes] = useState([])
  const [editOrder, setEditOrder] = useState(null)
  const [editNote, setEditNote] = useState(null)

  const days = gridDays(month)
  const from = days[0]
  const to = days[days.length - 1]

  async function load() {
    const [o, n] = await Promise.all([
      supabase.from('orders').select('*').gte('order_date', from).lte('order_date', to).order('order_time', { nullsFirst: true }),
      supabase.from('notes').select('*').gte('date', from).lte('date', to).order('created_at'),
    ])
    if (showError(o.error || n.error)) return
    setOrders(o.data)
    setNotes(n.data)
  }
  useEffect(() => {
    load()
  }, [month])

  function pick(d) {
    setSelected(d)
    if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7))
  }

  async function setStatus(order, status) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (showError(error)) return
    showError(await syncOrderSales({ ...order, status }))
    load()
  }
  async function removeNote(note) {
    if (!confirm('Xóa ghi chú này?')) return
    const { error } = await supabase.from('notes').delete().eq('id', note.id)
    if (!showError(error)) load()
  }

  const dayOrders = orders.filter((o) => o.order_date === selected)
  const dayNotes = notes.filter((n) => n.date === selected)
  const today = todayStr()
  const monthLabel = parseDate(month + '-01').toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader title="Lịch đơn" subtitle="Đơn đặt trước và ghi chú theo ngày">
        <button className="btn btn-ghost" onClick={() => setEditNote({ date: selected })}>
          <StickyNote size={18} /> Ghi chú
        </button>
        <button className="btn btn-primary" onClick={() => setEditOrder({ order_date: selected })}>
          <Plus size={18} /> Đơn đặt
        </button>
      </PageHeader>

      <div className="calendar-layout">
        <div className="card calendar">
          <div className="cal-head">
            <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Tháng trước">
              <ChevronLeft size={20} />
            </button>
            <strong className="cal-title">{monthLabel}</strong>
            <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Tháng sau">
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-weekday">
                {w}
              </div>
            ))}
            {days.map((d) => {
              const os = orders.filter((o) => o.order_date === d && o.status !== 'cancelled')
              const hasNote = notes.some((n) => n.date === d)
              const pendingCount = os.filter((o) => o.status === 'pending').length
              return (
                <button
                  key={d}
                  className={[
                    'cal-day',
                    d.slice(0, 7) !== month && 'other',
                    d === today && 'today',
                    d === selected && 'selected',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pick(d)}
                >
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  <span className="cal-marks">
                    {os.length > 0 && (
                      <span className={`cal-count ${pendingCount ? 'warn' : 'good'}`}>{os.length} đơn</span>
                    )}
                    {hasNote && <span className="cal-note-dot" title="Có ghi chú" />}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="cal-legend muted small">
            <span>
              <span className="cal-count warn">n đơn</span> còn đơn chờ giao
            </span>
            <span>
              <span className="cal-count good">n đơn</span> đã giao hết
            </span>
            <span>
              <span className="cal-note-dot" /> có ghi chú
            </span>
          </div>
        </div>

        <div className="day-panel">
          <h2 className="day-title">{fmtDateLong(selected)}</h2>

          {dayOrders.length === 0 && dayNotes.length === 0 && (
            <p className="muted">Không có đơn hay ghi chú nào trong ngày này.</p>
          )}

          {dayOrders.map((o) => (
            <div key={o.id} className={`card order-card ${o.status}`}>
              <div className="order-top">
                <div>
                  <strong>{o.customer}</strong>
                  {o.order_time && <span className="muted"> · {fmtTime(o.order_time)}</span>}
                </div>
                <span className={`badge badge-${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
              </div>
              {orderItemsText(o) && <p className="order-items">{orderItemsText(o, '\n')}</p>}
              {o.lines?.length > 0 && o.items && <p className="muted small">{o.items}</p>}
              {o.note && <p className="muted small">Ghi chú: {o.note}</p>}
              <div className="order-money small">
                <span>Tổng {money(o.total)}</span>
                {o.deposit > 0 && <span>Đã cọc {money(o.deposit)}</span>}
                {o.total - o.deposit > 0 && o.status !== 'cancelled' && (
                  <strong>Còn thu {money(o.total - o.deposit)}</strong>
                )}
              </div>
              <div className="order-actions">
                {o.phone && (
                  <a className="btn btn-ghost btn-sm" href={`tel:${o.phone}`}>
                    <Phone size={16} /> {o.phone}
                  </a>
                )}
                {o.status === 'pending' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(o, 'done')}>
                    <Check size={16} /> Đã giao
                  </button>
                )}
                {o.status === 'done' && !o.lines?.length && (
                  <span className="muted small">Đơn chưa chọn món nên chưa tính vào doanh thu — bấm Sửa để chọn món.</span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setEditOrder(o)}>
                  <Pencil size={16} /> Sửa
                </button>
              </div>
            </div>
          ))}

          {dayNotes.map((n) => (
            <div key={n.id} className="card note-card">
              <StickyNote size={18} className="note-icon" />
              <p className="grow">{n.content}</p>
              <button className="icon-btn" onClick={() => setEditNote(n)} aria-label="Sửa ghi chú">
                <Pencil size={16} />
              </button>
              <button className="icon-btn" onClick={() => removeNote(n)} aria-label="Xóa ghi chú">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {editOrder && (
        <OrderForm
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={(date) => {
            setEditOrder(null)
            pick(date)
            load()
          }}
        />
      )}
      {editNote && (
        <NoteForm
          note={editNote}
          onClose={() => setEditNote(null)}
          onSaved={(date) => {
            setEditNote(null)
            pick(date)
            load()
          }}
        />
      )}
    </>
  )
}

export function OrderForm({ order, onClose, onSaved }) {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({
    order_date: order.order_date || todayStr(),
    order_time: order.order_time ? fmtTime(order.order_time) : '',
    customer: order.customer || '',
    phone: order.phone || '',
    lines: order.lines?.length ? order.lines : [],
    items: order.items || '',
    discount: order.discount || '',
    total: order.total ?? '',
    deposit: order.deposit ?? '',
    status: order.status || 'pending',
    note: order.note || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase
      .from('products')
      .select('id,name,price,active')
      .order('active', { ascending: false })
      .order('name')
      .then(({ data, error }) => {
        if (showError(error)) return
        setProducts(data)
        if (!order.id && !order.lines?.length && data[0]) set('lines', [{ product_id: data[0].id, name: data[0].name, qty: 1, price: data[0].price }])
      })
  }, [])

  const setLine = (i, patch) => set('lines', form.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const lines = form.lines.filter((l) => l.product_id && Number(l.qty) > 0)
  const hasLines = lines.length > 0
  const sub = linesTotal(lines)
  const total = hasLines ? Math.max(0, sub - Number(form.discount || 0)) : Number(form.total || 0)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      order_date: form.order_date,
      order_time: form.order_time || null,
      customer: form.customer.trim(),
      phone: form.phone.trim() || null,
      lines: lines.map((l) => ({ product_id: Number(l.product_id), name: l.name, qty: Math.floor(Number(l.qty)), price: Number(l.price || 0) })),
      items: form.items.trim() || null,
      discount: hasLines ? Number(form.discount || 0) : 0,
      total,
      deposit: Number(form.deposit || 0),
      status: form.status,
      note: form.note.trim() || null,
    }
    const { data, error } = order.id
      ? await supabase.from('orders').update(payload).eq('id', order.id).select().single()
      : await supabase.from('orders').insert(payload).select().single()
    if (showError(error)) return setBusy(false)
    // đơn đã giao → ghi / cập nhật doanh thu
    showError(await syncOrderSales(data))
    setBusy(false)
    onSaved(payload.order_date)
  }

  async function remove() {
    if (!confirm(`Xóa đơn của ${order.customer}?${order.status === 'done' ? '\nDoanh thu của đơn này cũng bị gỡ khỏi bán hàng.' : ''}`)) return
    const del = await supabase.from('sales').delete().eq('source', orderSource(order.id))
    if (showError(del.error)) return
    const { error } = await supabase.from('orders').delete().eq('id', order.id)
    if (!showError(error)) onSaved(order.order_date)
  }

  return (
    <Modal title={order.id ? 'Sửa đơn đặt' : 'Đơn đặt mới'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="Ngày giao">
            <input type="date" value={form.order_date} onChange={(e) => set('order_date', e.target.value)} required />
          </Field>
          <Field label="Giờ giao">
            <input type="time" value={form.order_time} onChange={(e) => set('order_time', e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Tên khách">
            <input value={form.customer} onChange={(e) => set('customer', e.target.value)} required />
          </Field>
          <Field label="Số điện thoại">
            <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        <div className="field">
          <span className="field-label">Món đặt</span>
          <span className="field-hint">Chọn món để app tự tính tiền và tự ghi doanh thu khi bấm “Đã giao”.</span>
          <div className="recipe">
            {form.lines.map((l, i) => (
              <div key={i} className="order-line">
                <select
                  value={l.product_id}
                  onChange={(e) => {
                    const p = products.find((x) => String(x.id) === e.target.value)
                    setLine(i, p ? { product_id: p.id, name: p.name, price: p.price } : { product_id: '' })
                  }}
                >
                  <option value="">— Chọn món —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.active ? '' : ' (đang ẩn)'}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                  aria-label="Số lượng"
                />
                <MoneyInput value={l.price} onChange={(v) => setLine(i, { price: v })} aria-label="Đơn giá" />
                <button type="button" className="icon-btn" onClick={() => set('lines', form.lines.filter((_, idx) => idx !== i))} aria-label="Bỏ món">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => set('lines', [...form.lines, { product_id: '', name: '', qty: 1, price: '' }])}
            >
              <Plus size={16} /> Thêm món
            </button>
          </div>
        </div>
        <Field label="Ghi chú món" hint="Ít đường, không đá…">
          <textarea rows={2} value={form.items} onChange={(e) => set('items', e.target.value)} />
        </Field>

        <div className="form-row">
          {hasLines ? (
            <Field label="Giảm giá cả đơn" hint={`Tạm tính ${money(sub)} → tổng ${money(total)}`}>
              <MoneyInput value={form.discount} onChange={(v) => set('discount', v)} />
            </Field>
          ) : (
            <Field label="Tổng tiền">
              <MoneyInput value={form.total} onChange={(v) => set('total', v)} />
            </Field>
          )}
          <Field label="Đã cọc">
            <MoneyInput value={form.deposit} onChange={(v) => set('deposit', v)} />
          </Field>
        </div>
        <Field label="Trạng thái">
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ghi chú">
          <textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Địa chỉ giao…" />
        </Field>
        <div className="form-actions">
          {order.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              Xóa
            </button>
          )}
          <span className="grow align-right">
            Tổng <strong>{money(total)}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function NoteForm({ note, onClose, onSaved }) {
  const [date, setDate] = useState(note.date || todayStr())
  const [content, setContent] = useState(note.content || '')

  async function submit(e) {
    e.preventDefault()
    const payload = { date, content: content.trim() }
    const { error } = note.id
      ? await supabase.from('notes').update(payload).eq('id', note.id)
      : await supabase.from('notes').insert(payload)
    if (!showError(error)) onSaved(date)
  }

  return (
    <Modal title={note.id ? 'Sửa ghi chú' : 'Ghi chú mới'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Ngày">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Nội dung">
          <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} required autoFocus />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary">Lưu</button>
        </div>
      </form>
    </Modal>
  )
}
