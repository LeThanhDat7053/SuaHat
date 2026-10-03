import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlarmClock, BellOff, ChevronLeft, ChevronRight, Phone, Plus, StickyNote, Check, Pencil, Trash2 } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { addDays, fmtDateLong, fmtTime, money, parseDate, toDateStr, todayStr } from '../lib/format'
import { Field, Modal, MoneyInput, PageHeader, SaveButton, useSubmit } from '../components/ui'
import { deleteOrderSales, linePack, linesTotal, markOrderDone, orderItemsText, packTotals, showAt, syncOrderSales } from '../lib/orders'
import { CHAI_DEFAULTS, PACKS, getChaiDefaults, packPrice } from '../lib/quick'
import { orderDue, reminderForm, reminderPayload, remindersChanged, setReminderOff, toLocalInput } from '../lib/reminders'
import { ReminderField, ReminderList } from '../components/Reminders'
import { cached, peek } from '../lib/cache'
import { loadCatalog } from '../lib/catalog'
import { useLive } from '../lib/live'

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

async function fetchMonth(from, to) {
  const [o, n] = await Promise.all([
    supabase.from('orders').select('*').gte('order_date', from).lte('order_date', to).order('order_time', { nullsFirst: true }),
    supabase.from('notes').select('*').gte('date', from).lte('date', to).order('created_at'),
  ])
  if (o.error || n.error) throw o.error || n.error
  return { orders: o.data, notes: n.data }
}

export default function CalendarPage() {
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [selected, setSelected] = useState(todayStr())
  const [orders, setOrders] = useState([])
  const [notes, setNotes] = useState([])
  const [editOrder, setEditOrder] = useState(null)
  const [editNote, setEditNote] = useState(null)
  const [showAlarms, setShowAlarms] = useState(false)
  const [params, setParams] = useSearchParams()

  // mở từ báo thức: /lich?ngay=2026-10-02
  useEffect(() => {
    const d = params.get('ngay')
    if (!d) return
    pick(d)
    setParams({}, { replace: true })
  }, [params])

  const days = gridDays(month)
  const from = days[0]
  const to = days[days.length - 1]

  // tháng đã xem trong phiên này thì hiện ngay, tải mới ngầm
  async function load() {
    try {
      const d = await cached(`calendar:${from}`, () => fetchMonth(from, to))
      setOrders(d.orders)
      setNotes(d.notes)
    } catch (e) {
      showError(e)
    }
  }
  useEffect(() => {
    const c = peek(`calendar:${from}`)
    if (c) {
      setOrders(c.orders)
      setNotes(c.notes)
    }
    load()
  }, [month])

  useLive(['orders', 'notes'], load)

  function pick(d) {
    setSelected(d)
    if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7))
  }

  async function setStatus(order, status) {
    if (status === 'done') {
      showError(await markOrderDone(order))
      return load()
    }
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (showError(error)) return
    showError(await syncOrderSales({ ...order, status }))
    load()
  }
  async function toggleAlarm(table, rec) {
    const error = await setReminderOff({ table, id: rec.id }, !rec.remind_off)
    if (!showError(error)) load()
  }

  // mở đơn / ghi chú từ danh sách báo thức
  async function openFromAlarm(item) {
    setShowAlarms(false)
    const { data, error } = await supabase.from(item.table).select('*').eq('id', item.id).single()
    if (showError(error)) return
    pick(item.date)
    if (item.table === 'orders') setEditOrder(data)
    else setEditNote(data)
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
        <button className="btn btn-ghost" onClick={() => setShowAlarms(true)}>
          <AlarmClock size={18} /> Báo thức
        </button>
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
          {(() => {
            const t = packTotals(dayOrders.filter((o) => o.status !== 'cancelled'))
            return t.text && <p className="day-packs">Tổng các đơn trong ngày: <strong>{t.text}</strong></p>
          })()}

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
                <span className="order-badges">
                  {o.status === 'pending' && <AlarmChip rec={o} onToggle={() => toggleAlarm('orders', o)} />}
                  <span className={`badge badge-${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                </span>
              </div>
              {orderItemsText(o) && <p className="order-items">{orderItemsText(o, '\n')}</p>}
              {o.lines?.length > 0 && <p className="order-packs">Tổng: {packTotals([o]).text}</p>}
              {o.lines?.length > 0 && o.items && <p className="muted small">{o.items}</p>}
              {o.note && <p className="muted small">Ghi chú: {o.note}</p>}
              {o.status === 'pending' && (
                <p className="preorder-hint small">
                  {showAt(o) <= Date.now() ? 'Đang hiện ở Bán hàng' : `Tự hiện ở Bán hàng lúc ${showAt(o).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`}
                </p>
              )}
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
              <div className="grow">
                <p>{n.content}</p>
                <AlarmChip rec={n} onToggle={() => toggleAlarm('notes', n)} />
              </div>
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

      {showAlarms && <ReminderList onOpen={openFromAlarm} onClose={() => setShowAlarms(false)} />}
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

// Chuông trên thẻ đơn / ghi chú: bấm để tắt / bật nhanh
function AlarmChip({ rec, onToggle }) {
  if (!rec.remind_at || rec.reminded_at) return null
  const at = new Date(rec.remind_at)
  const sameDay = toLocalInput(at).slice(0, 10) === (rec.order_date || rec.date)
  const label = at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + (sameDay ? '' : ` ${at.getDate()}/${at.getMonth() + 1}`)
  return (
    <button type="button" className={`alarm-chip ${rec.remind_off ? 'off' : ''}`} onClick={onToggle} title={rec.remind_off ? 'Bật báo thức' : 'Tắt báo thức'}>
      {rec.remind_off ? <BellOff size={13} /> : <AlarmClock size={13} />} {label}
    </button>
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
  const [remind, setRemind] = useState(() => reminderForm(order, `${order.order_date || todayStr()}T08:00`))
  const [busy, setBusy] = useState(false)
  const [chaiDef, setChaiDef] = useState(CHAI_DEFAULTS)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([loadCatalog(), getChaiDefaults()]).then(([c, def]) => {
      const data = [...c.products].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, 'vi'))
      setProducts(data)
      setChaiDef(def)
      if (!order.id && !order.lines?.length && data[0])
        set('lines', [{ product_id: data[0].id, name: data[0].name, pack: 'ly', qty: 1, price: data[0].price }])
    })
  }, [])

  const setLine = (i, patch) => set('lines', form.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  // đổi món / đổi Ly ↔ Chai → giá tự theo giá bán (Chai = Ly + phụ thu), vẫn sửa tay được
  const pickLine = (i, product, pack) =>
    setLine(i, product ? { product_id: product.id, name: product.name, pack, price: packPrice(product, pack, chaiDef) } : { pack })
  const lines = form.lines.filter((l) => l.product_id && Number(l.qty) > 0)
  const hasLines = lines.length > 0
  const packs = packTotals([{ lines }])
  const sub = linesTotal(lines)
  const total = hasLines ? Math.max(0, sub - Number(form.discount || 0)) : Number(form.total || 0)

  async function submit(e) {
    e.preventDefault()
    // chỉ gửi cột báo thức khi đã có (đã chạy nang-cap-v4.sql) hoặc có cài
    let alarm = {}
    if ('remind_at' in order || remind.mode !== 'off') {
      const r = reminderPayload(form.status === 'pending' ? remind : { mode: 'off' }, order, orderDue(form.order_date, form.order_time))
      if (r.error) return alert(r.error)
      alarm = r.payload
    }
    setBusy(true)
    const payload = {
      ...alarm,
      order_date: form.order_date,
      order_time: form.order_time || null,
      customer: form.customer.trim(),
      phone: form.phone.trim() || null,
      lines: lines.map((l) => ({
        product_id: Number(l.product_id),
        name: l.name,
        pack: linePack(l),
        qty: Math.floor(Number(l.qty)),
        price: Number(l.price || 0),
      })),
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
    remindersChanged()
    setBusy(false)
    onSaved(payload.order_date)
  }

  async function remove() {
    if (!confirm(`Xóa đơn của ${order.customer}?${order.status === 'done' ? '\nDoanh thu của đơn này cũng bị gỡ khỏi bán hàng.' : ''}`)) return
    const del = await deleteOrderSales(order.id)
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
                    if (p) pickLine(i, p, linePack(l))
                    else setLine(i, { product_id: '' })
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
                <div className="pack-toggle" role="group" aria-label="Ly hay Chai">
                  {Object.entries(PACKS).map(([pack, label]) => (
                    <button
                      key={pack}
                      type="button"
                      className={linePack(l) === pack ? 'active' : ''}
                      aria-pressed={linePack(l) === pack}
                      onClick={() => pickLine(i, products.find((x) => x.id === Number(l.product_id)), pack)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
              onClick={() => set('lines', [...form.lines, { product_id: '', name: '', pack: 'ly', qty: 1, price: '' }])}
            >
              <Plus size={16} /> Thêm món
            </button>
            {packs.text && (
              <p className="order-packs">
                Tổng: <strong>{packs.text}</strong>
              </p>
            )}
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
        {form.status === 'pending' && <ReminderField value={remind} onChange={setRemind} allowBefore hasTime={!!form.order_time} />}
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
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}

function NoteForm({ note, onClose, onSaved }) {
  const [date, setDate] = useState(note.date || todayStr())
  const [content, setContent] = useState(note.content || '')
  const [remind, setRemind] = useState(() => reminderForm(note, `${note.date || todayStr()}T08:00`))
  const [busy, onSubmit] = useSubmit(submit)

  async function submit() {
    let alarm = {}
    if ('remind_at' in note || remind.mode !== 'off') {
      const r = reminderPayload(remind, note, null)
      if (r.error) return alert(r.error)
      alarm = r.payload
    }
    const payload = { date, content: content.trim(), ...alarm }
    const { error } = note.id
      ? await supabase.from('notes').update(payload).eq('id', note.id)
      : await supabase.from('notes').insert(payload)
    if (showError(error)) return
    remindersChanged()
    onSaved(date)
  }

  return (
    <Modal title={note.id ? 'Sửa ghi chú' : 'Ghi chú mới'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <Field label="Ngày">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Nội dung">
          <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} required autoFocus />
        </Field>
        <ReminderField value={remind} onChange={setRemind} allowBefore={false} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}
