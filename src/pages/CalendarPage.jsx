import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlarmClock, BellOff, ChevronLeft, ChevronRight, Phone, Plus, Search, Star, StickyNote, Check, Pencil, Trash2, X } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { addDays, fmtDateLong, fmtTime, money, parseDate, toDateStr, todayStr } from '../lib/format'
import { Field, Modal, MoneyInput, PageHeader, SaveButton, useSubmit } from '../components/ui'
import { deleteOrderSales, linePack, linesTotal, markOrderDone, orderItemsText, packTotals, showAt, syncOrderSales } from '../lib/orders'
import { CHAI_DEFAULTS, WHOLESALE_UPGRADE, addLines, getChaiDefaults, lineKey, missingColumn, variantText } from '../lib/quick'
import { orderDue, reminderForm, reminderPayload, remindersChanged, setReminderOff, toLocalInput } from '../lib/reminders'
import { ReminderField, ReminderList } from '../components/Reminders'
import { Stepper, VariantGrid, VariantTag, useVariantPick } from '../components/QuickOrder'
import { plain } from '../lib/categories'
import { cached, peek } from '../lib/cache'
import { loadCatalog } from '../lib/catalog'
import { loadFeatured } from '../lib/featured'
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
                  {o.wholesale && <span className="badge badge-ws">Bán sỉ</span>} <strong>{o.customer}</strong>
                  {o.order_time && <span className="muted"> · {fmtTime(o.order_time)}</span>}
                </div>
                <span className="order-badges">
                  {o.status === 'pending' && <AlarmChip rec={o} onToggle={() => toggleAlarm('orders', o)} />}
                  <span className={`badge badge-${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                </span>
              </div>
              {o.lines?.length > 0 ? (
                <div className="order-items-tags">
                  {o.lines.map((l, i) => (
                    <div key={i} className="order-item-row">
                      <span>{l.name}</span>
                      <VariantTag pack={linePack(l)} temp={l.temp} sugar={l.sugar} qty={l.qty} />
                    </div>
                  ))}
                </div>
              ) : (
                orderItemsText(o) && <p className="order-items">{orderItemsText(o, '\n')}</p>
              )}
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
                  // đơn cũ chưa chọn món: mở form chọn món trước, không thì giao xong mà không có doanh thu
                  <button className="btn btn-ghost btn-sm" onClick={() => (o.lines?.length ? setStatus(o, 'done') : setEditOrder(o))}>
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
    // đơn cũ chưa ghi Ly / Chai → tính là Ly
    lines: (order.lines || []).map((l) => ({ ...l, pack: linePack(l), qty: Math.floor(Number(l.qty) || 0) })),
    items: order.items || '',
    discount: order.discount || '',
    total: order.total ?? '',
    deposit: order.deposit ?? '',
    status: order.status || 'pending',
    note: order.note || '',
    wholesale: !!order.wholesale,
  })
  const [remind, setRemind] = useState(() => reminderForm(order, `${order.order_date || todayStr()}T08:00`))
  const [busy, setBusy] = useState(false)
  const [chaiDef, setChaiDef] = useState(CHAI_DEFAULTS)
  const [featuredIds, setFeaturedIds] = useState(new Set())
  const [picking, setPicking] = useState(null) // món đang chọn Ly / Chai, Đá / Nóng
  const [query, setQuery] = useState('')
  const [priceAt, setPriceAt] = useState(null) // lineKey của dòng đang sửa giá
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([loadCatalog(), getChaiDefaults(), loadFeatured()]).then(([c, def, feat]) => {
      const featSet = new Set(feat)
      const data = [...c.products].sort(
        (a, b) => b.active - a.active || (featSet.has(b.id) ? 1 : 0) - (featSet.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name, 'vi'),
      )
      setProducts(data)
      setFeaturedIds(featSet)
      setChaiDef(def)
    })
  }, [])

  // Món đã chọn: sửa số lượng (về 0 = bỏ) / giá từng dòng. Giá mặc định theo giá bán (Chai = Ly + phụ thu).
  const setLineBy = (key, patch) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (lineKey(l) === key ? { ...l, ...patch } : l)).filter((l) => Number(l.qty) > 0) }))
  function addPicked(chosen) {
    setForm((f) => ({ ...f, lines: addLines(f.lines, chosen.map(({ cost: _, ...l }) => l)) }))
    setPicking(null)
    setQuery('')
  }
  const inOrder = new Set(form.lines.map((l) => Number(l.product_id)))
  const q = plain(query.trim())
  // món đang bán (★ món hôm nay lên đầu) + món đã ẩn nhưng đang có trong đơn
  const choices = products.filter((p) => (p.active || inOrder.has(p.id)) && (!q || plain(p.name).includes(q)))
  const groups = []
  form.lines.forEach((l) => {
    let g = groups.find((x) => x.product_id === l.product_id)
    if (!g) groups.push((g = { product_id: l.product_id, name: l.name, lines: [] }))
    g.lines.push(l)
  })

  const lines = form.lines.filter((l) => l.product_id && Number(l.qty) > 0)
  const hasLines = lines.length > 0
  const packs = packTotals([{ lines }])
  const sub = linesTotal(lines)
  // luôn tính từ món đã chọn; giảm giá cả đơn → doanh thu = tạm tính − giảm (vẫn lưu đủ số ly / chai đã bán)
  const total = Math.max(0, sub - Number(form.discount || 0))

  async function submit(e) {
    e.preventDefault()
    // bắt buộc chọn món: không có món thì bấm "Đã giao" sẽ không ghi được doanh thu
    if (!hasLines) return alert('Chọn ít nhất 1 món ở mục "Món đặt" (có số lượng) để app tính tiền và ghi doanh thu khi giao.')
    if (Number(form.discount || 0) > sub) return alert('Giảm giá lớn hơn tiền món, kiểm tra lại ô "Giảm giá cả đơn".')
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
        ...(l.temp ? { temp: l.temp } : {}),
        ...(l.sugar ? { sugar: l.sugar } : {}),
        qty: Math.floor(Number(l.qty)),
        price: Number(l.price || 0),
      })),
      items: form.items.trim() || null,
      discount: Number(form.discount || 0),
      total,
      deposit: Number(form.deposit || 0),
      status: form.status,
      note: form.note.trim() || null,
      // chỉ gửi cột wholesale (nang-cap-v9.sql) khi có dùng / đơn đã có cột này
      ...(form.wholesale || 'wholesale' in order ? { wholesale: form.wholesale } : {}),
    }
    const { data, error } = order.id
      ? await supabase.from('orders').update(payload).eq('id', order.id).select().single()
      : await supabase.from('orders').insert(payload).select().single()
    if (missingColumn(error) && payload.wholesale) {
      setBusy(false)
      return alert(WHOLESALE_UPGRADE)
    }
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

        <label className={`ws-toggle ${form.wholesale ? 'on' : ''}`}>
          <input type="checkbox" checked={form.wholesale} onChange={(e) => set('wholesale', e.target.checked)} />
          Bán sỉ
        </label>
        {form.wholesale && (
          <p className="field-hint">
            Đơn sỉ vẫn cộng doanh thu và trừ nguyên liệu, nhưng <b>không</b> cộng vào số phần đã bán. Bấm vào giá từng món bên dưới để sửa thành giá sỉ.
          </p>
        )}
        <div className="field">
          <span className="field-label">Món đặt</span>
          {groups.length > 0 && (
            <div className="ord-lines">
              {groups.map((g) => (
                <div key={g.product_id} className="ord-group">
                  <div className="ord-name">{g.name}</div>
                  {g.lines.map((l) => {
                    const k = lineKey(l)
                    return (
                      <div key={k} className="ord-line">
                        <VariantTag pack={l.pack} temp={l.temp} sugar={l.sugar} />
                        {priceAt === k ? (
                          <MoneyInput value={l.price} onChange={(v) => setLineBy(k, { price: v })} onBlur={() => setPriceAt(null)} autoFocus aria-label="Đơn giá" />
                        ) : (
                          <button type="button" className="ord-price" onClick={() => setPriceAt(k)} title="Bấm để sửa giá">
                            {money(l.price)} <Pencil size={12} aria-hidden="true" />
                          </button>
                        )}
                        <Stepper value={Number(l.qty)} onChange={(v) => setLineBy(k, { qty: v })} label={`${l.name} ${variantText(l.pack, l.temp, l.sugar)}`} />
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="ord-sum">
                <span>{packs.text}</span>
                <strong>{money(sub)}</strong>
              </div>
            </div>
          )}

          {picking ? (
            <InlinePick key={picking.id} product={picking} def={chaiDef} onAdd={addPicked} onCancel={() => setPicking(null)} />
          ) : (
            <div className="ord-choose">
              <span className="field-hint">{groups.length ? 'Thêm món khác:' : 'Bấm vào món để chọn Ly / Chai, Đá / Nóng và độ ngọt.'}</span>
              {products.length > 8 && (
                <label className="search-box">
                  <Search size={17} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm món…" aria-label="Tìm món" />
                  {query && (
                    <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">
                      <X size={16} />
                    </button>
                  )}
                </label>
              )}
              <div className="ord-products">
                {choices.map((p) => (
                  <button key={p.id} type="button" className={`ord-product ${inOrder.has(p.id) ? 'in' : ''}`} onClick={() => setPicking(p)}>
                    <span className="ord-product-name">
                      {featuredIds.has(p.id) && <Star size={13} className="inline-icon featured-star" aria-label="Món hôm nay" />}
                      {p.name}
                    </span>
                    <span className="muted small">{money(p.price)}</span>
                  </button>
                ))}
                {choices.length === 0 && <span className="muted small">Không tìm thấy món nào.</span>}
              </div>
            </div>
          )}
        </div>
        <Field label="Ghi chú món" hint="Thêm trân châu, ít đá…">
          <textarea rows={2} value={form.items} onChange={(e) => set('items', e.target.value)} />
        </Field>

        <div className="form-row">
          <Field label="Giảm giá cả đơn" hint={`Tiền món ${money(sub)} → khách trả ${money(total)}`}>
            <MoneyInput value={form.discount} onChange={(v) => set('discount', v)} />
          </Field>
          <Field label="Đã cọc">
            <MoneyInput value={form.deposit} onChange={(v) => set('deposit', v)} />
          </Field>
        </div>
        {order.id && (
          <Field label="Trạng thái">
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
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

// Chọn Ly / Chai × Đá / Nóng + độ ngọt cho 1 món, hiện ngay trong form đơn đặt (giống popup ở Bán hàng)
function InlinePick({ product, def, onAdd, onCancel }) {
  const pick = useVariantPick(product, def)
  return (
    <div className="ord-pick">
      <div className="ord-pick-head">
        <strong>{product.name}</strong>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Đóng">
          <X size={18} />
        </button>
      </div>
      <VariantGrid product={product} def={def} pick={pick} />
      <div className="ord-pick-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Hủy
        </button>
        <button type="button" className="btn btn-primary" disabled={pick.count === 0} onClick={() => onAdd(pick.chosen)}>
          {pick.count > 0 ? `Thêm · ${pick.count} phần · ${money(pick.total)}` : 'Chưa chọn phần nào'}
        </button>
      </div>
    </div>
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
