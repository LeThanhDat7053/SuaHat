import { Fragment, useState } from 'react'
import { CalendarClock, Check, CupSoda, Flame, Minus, Pencil, Phone, Plus, RotateCcw, Snowflake, Trash2, X } from 'lucide-react'
import { fmtDate, fmtTime, money, todayStr } from '../lib/format'
import { linePack } from '../lib/orders'
import { PACKS, SUGARS, TEMPS, chaiExtraCost, chaiSurcharge, lineKey, linesProfit, linesTotal, packCost, packPrice, sugarText, variantText } from '../lib/quick'
import { setSetting, showError, supabase } from '../lib/supabase'
import { Field, Modal, MoneyInput, SaveButton, useSubmit } from './ui'

function Stepper({ value, onChange, label }) {
  const set = (v) => onChange(Math.max(0, Math.floor(Number(v) || 0)))
  return (
    <div className="stepper stepper-inline">
      <button type="button" onClick={() => set(value - 1)} disabled={value === 0} aria-label={`Bớt ${label}`}>
        <Minus size={18} />
      </button>
      <input
        inputMode="numeric"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
        aria-label={`Số lượng ${label}`}
      />
      <button type="button" onClick={() => set(value + 1)} aria-label={`Thêm ${label}`}>
        <Plus size={18} />
      </button>
    </div>
  )
}

export const TEMP_ICON = { da: Snowflake, nong: Flame }
// Chai tự vẽ (lucide không có chai nước rõ ràng): thân to, nắp tô đặc, có nhãn → nhìn khác hẳn ly có ống hút
function BottleIcon({ size = 24, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="8.5" y="1.5" width="7" height="3.5" rx="1" fill="currentColor" />
      <path d="M10 5v1.5c0 1.2-3.5 2.3-3.5 5V20a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-8.5c0-2.7-3.5-3.8-3.5-5V5" />
      <path d="M6.5 13h11v5h-11z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  )
}
export const PACK_ICON = { ly: CupSoda, chai: BottleIcon }

// Nhãn "2 Ly đá" có màu: xanh = đá, cam = nóng. Ít / không ngọt ghi thêm phía sau.
export function VariantTag({ pack, temp, sugar, qty }) {
  const Icon = TEMP_ICON[temp]
  const PackIcon = PACK_ICON[pack]
  return (
    <span className={`vtag ${temp ? `vtag-${temp}` : ''}`}>
      {qty != null && <b>{qty}</b>}
      {PackIcon && <PackIcon size={16} aria-hidden="true" />}
      {PACKS[pack]}
      {Icon && <Icon size={13} aria-hidden="true" className="vtag-temp" />}
      {temp && TEMPS[temp].toLowerCase()}
      {sugar && <em className="vtag-sugar">{sugarText(sugar)}</em>}
    </span>
  )
}

// Popup khi bấm vào món: chọn độ ngọt, rồi bấm ô Đá / Nóng của Ly / Chai để thêm (bấm nhiều lần = nhiều phần), OK.
// Bắt đầu từ 0 nên không lo dư 1 ly. Kết hợp tùy ý, VD 3 ly = 2 đá + 1 nóng ít ngọt.
export function PackPicker({ product, lyCost, def, onAdd, onEditPrice, onClose }) {
  const [qty, setQty] = useState({}) // 'pack:temp:sugar' → số phần
  const [sugar, setSugar] = useState('')
  const price = { ly: packPrice(product, 'ly', def), chai: packPrice(product, 'chai', def) }
  const get = (k) => qty[k] || 0
  const bump = (k, d) => setQty((q) => ({ ...q, [k]: Math.max(0, (q[k] || 0) + d) }))
  const chosen = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => {
      const [pack, temp, sg] = k.split(':')
      return {
        product_id: product.id,
        name: product.name,
        pack,
        temp,
        ...(sg ? { sugar: sg } : {}),
        qty: n,
        price: price[pack],
        cost: packCost(product, pack, lyCost, def),
      }
    })
  const count = chosen.reduce((s, l) => s + l.qty, 0)
  const total = linesTotal(chosen)
  // số đã chọn ở độ ngọt khác (hiện nhỏ trên ô để không quên)
  const otherSugar = (pack, temp) => chosen.filter((l) => l.pack === pack && l.temp === temp && (l.sugar || '') !== sugar).reduce((s, l) => s + l.qty, 0)

  function ok(e) {
    e.preventDefault()
    if (count === 0) return onClose()
    onAdd(chosen)
  }

  return (
    <Modal title={product.name} onClose={onClose}>
      <form className="form" onSubmit={ok}>
        <div className="sugar-pick" role="group" aria-label="Độ ngọt">
          {Object.entries(SUGARS).map(([k, label]) => (
            <button key={k} type="button" className={`sugar-${k || 'normal'} ${sugar === k ? 'active' : ''}`} aria-pressed={sugar === k} onClick={() => setSugar(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="vgrid">
          <span />
          {Object.entries(TEMPS).map(([temp, label]) => {
            const Icon = TEMP_ICON[temp]
            return (
              <span key={temp} className={`vgrid-col vtemp-${temp}`}>
                <Icon size={16} aria-hidden="true" /> {label}
              </span>
            )
          })}
          {Object.entries(PACKS).map(([pack, label]) => (
            <Fragment key={pack}>
              <div className="vgrid-pack">
                <strong>
                  {(() => {
                    const PackIcon = PACK_ICON[pack]
                    return <PackIcon size={24} aria-hidden="true" />
                  })()}{' '}
                  {label}
                </strong>
                <span>{money(price[pack])}</span>
                {pack === 'chai' && <span className="muted small">+{money(chaiSurcharge(product, def))}</span>}
              </div>
              {Object.entries(TEMPS).map(([temp, tLabel]) => {
                const k = `${pack}:${temp}:${sugar}`
                const n = get(k)
                const other = otherSugar(pack, temp)
                const name = variantText(pack, temp, sugar)
                return (
                  <div key={k} className={`vtile vtemp-${temp} ${n > 0 ? 'on' : ''}`}>
                    <button type="button" className="vtile-add" onClick={() => bump(k, 1)} aria-label={`Thêm 1 ${name}`}>
                      {n > 0 ? <span className="vtile-n">{n}</span> : <Plus size={22} />}
                    </button>
                    {n > 0 && (
                      <button type="button" className="vtile-minus" onClick={() => bump(k, -1)} aria-label={`Bớt 1 ${name}`}>
                        <Minus size={14} />
                      </button>
                    )}
                    {other > 0 && <span className="vtile-other">+{other} khác</span>}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
        <div className="vsum">
          {count === 0 ? (
            <span className="muted small">Bấm ô Đá / Nóng để thêm (bắt đầu từ 0). Ít / không ngọt: chọn ở trên trước rồi bấm ô.</span>
          ) : (
            <>
              {chosen.map((l) => (
                <VariantTag key={lineKey(l)} pack={l.pack} temp={l.temp} sugar={l.sugar} qty={l.qty} />
              ))}
              <button type="button" className="link-btn vsum-clear" onClick={() => setQty({})}>
                Chọn lại
              </button>
            </>
          )}
        </div>
        <div className="form-actions vactions">
          {onEditPrice && (
            <button type="button" className="btn btn-ghost btn-edit-price" onClick={onEditPrice}>
              <Pencil size={16} /> Chỉnh giá
            </button>
          )}
          <button type="button" className="btn btn-ghost vbtn-cancel" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={count === 0}>
            {count > 0 ? `Thêm · ${count} phần · ${money(total)}` : 'Chưa chọn phần nào'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Chỉnh giá Ly, phụ thu Chai và giá vốn thêm khi bán Chai (riêng món này + mức chung)
export function PriceForm({ product, lyCost, def, onClose, onSaved }) {
  const [form, setForm] = useState({
    price: product.price ?? '',
    chai_surcharge: product.chai_surcharge ?? '',
    chai_cost: product.chai_cost ?? '',
    def_surcharge: def.surcharge,
    def_cost: def.cost,
  })
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const num = (v) => (v === '' ? null : Number(v))
  const newDef = { surcharge: Number(form.def_surcharge || 0), cost: Number(form.def_cost || 0) }
  const draft = { ...product, price: Number(form.price || 0), chai_surcharge: num(form.chai_surcharge), chai_cost: num(form.chai_cost) }

  const [busy, onSubmit] = useSubmit(async () => {
    const { data, error } = await supabase
      .from('products')
      .update({ price: draft.price, chai_surcharge: draft.chai_surcharge, chai_cost: draft.chai_cost })
      .eq('id', product.id)
      .select()
      .single()
    if (showError(error)) return
    if (newDef.surcharge !== def.surcharge || newDef.cost !== def.cost) {
      if (!(await setSetting('chai', newDef))) return
    }
    onSaved(data, newDef)
  })

  return (
    <Modal title={`Chỉnh giá · ${product.name}`} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <Field label="Giá bán Ly">
          <MoneyInput value={form.price} onChange={set('price')} required />
        </Field>
        <div className="form-row">
          <Field label="Chai đắt hơn Ly" hint={`Để trống = mức chung ${money(newDef.surcharge)}. Thường 3.000–5.000đ`}>
            <MoneyInput value={form.chai_surcharge} onChange={set('chai_surcharge')} placeholder={newDef.surcharge.toLocaleString('vi-VN')} />
          </Field>
          <Field label="Vốn thêm khi bán Chai" hint={`Vỏ chai, nắp… Để trống = mức chung ${money(newDef.cost)}`}>
            <MoneyInput value={form.chai_cost} onChange={set('chai_cost')} placeholder={newDef.cost.toLocaleString('vi-VN')} />
          </Field>
        </div>

        <div className="summary-box">
          {Object.entries(PACKS).map(([pack, label]) => {
            const p = packPrice(draft, pack, newDef)
            const c = packCost(draft, pack, lyCost, newDef)
            return (
              <div key={pack} className="kv">
                <span>
                  {label}: bán {money(p)} − vốn {money(c)}
                </span>
                <strong className={p - c < 0 ? 'danger-text' : 'good-text'}>lãi {money(p - c)}</strong>
              </div>
            )
          })}
          <span className="muted small">
            Giá vốn Ly tự tính từ công thức (trang Sản phẩm). Chai lời thêm {money(chaiSurcharge(draft, newDef) - chaiExtraCost(draft, newDef))} so với Ly.
          </span>
        </div>

        <details className="more-settings">
          <summary>Mức chung cho mọi món</summary>
          <div className="form-row">
            <Field label="Chai đắt hơn Ly (chung)">
              <MoneyInput value={form.def_surcharge} onChange={set('def_surcharge')} />
            </Field>
            <Field label="Vốn thêm khi bán Chai (chung)">
              <MoneyInput value={form.def_cost} onChange={set('def_cost')} />
            </Field>
          </div>
        </details>

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

// Gộp dòng theo món: [{ product_id, name, lines }]
function groupLines(lines) {
  const out = []
  lines.forEach((l) => {
    if (!(l.qty > 0)) return
    let g = out.find((x) => x.product_id === l.product_id)
    if (!g) out.push((g = { product_id: l.product_id, name: l.name, lines: [] }))
    g.lines.push(l)
  })
  return out
}

const hm = (ts) => (ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')

export const orderLabel = (o) => o.note || `Đơn #${o.id}`

// Thẻ đơn: vàng = đang chờ giao, xanh nhạt = đã xong (ở trang xem đơn)
export function OrderCard({ order, busy, editing, showProfit, onDone, onEdit, onDelete, onReopen }) {
  const done = order.status === 'done'
  return (
    <div className={`qorder ${done ? 'done' : ''} ${editing ? 'editing' : ''}`}>
      <div className="qorder-head">
        <strong className="clamp">{orderLabel(order)}</strong>
        <span className="muted small">{done ? `xong ${hm(order.done_at)}` : hm(order.created_at)}</span>
      </div>
      <div className="qorder-lines">
        {groupLines(order.lines).map((g) => (
          <div key={g.product_id} className="qorder-line">
            <span className="qorder-name">{g.name}</span>
            <span className="vtags">
              {g.lines.map((l) => (
                <VariantTag key={lineKey(l)} pack={l.pack} temp={l.temp} sugar={l.sugar} qty={l.qty} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="qorder-total">
        <strong>{money(order.total)}</strong>
        {showProfit && <span className="good-text small">lãi {money(linesProfit(order.lines))}</span>}
        {editing && <span className="badge badge-good">Đang sửa</span>}
      </div>
      <div className="qorder-actions">
        {done ? (
          onReopen && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onReopen} disabled={busy}>
              <RotateCcw size={15} /> Mở lại
            </button>
          )
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-done" onClick={onDone} disabled={busy || editing} aria-busy={busy || undefined}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Check size={18} />} Đã xong
            </button>
            {onEdit && (
              <button type="button" className="icon-btn" onClick={onEdit} disabled={busy} aria-label="Sửa đơn">
                <Pencil size={17} />
              </button>
            )}
            {onDelete && (
              <button type="button" className="icon-btn" onClick={onDelete} disabled={busy} aria-label="Xóa đơn">
                <Trash2 size={17} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Thẻ đơn ĐẶT TRƯỚC (từ Lịch đơn) hiện ở Bán hàng: màu tím, có giờ giao, SĐT, tiền còn thu.
// Bấm "Đã giao" ở đây = bấm ở Lịch đơn (cùng 1 đơn, doanh thu chỉ ghi 1 lần).
export function PreOrderCard({ order, busy, onDone, onEdit }) {
  const lines = (order.lines || []).filter((l) => l.qty > 0)
  const due = Number(order.total || 0) - Number(order.deposit || 0)
  const today = todayStr()
  const late = order.order_date < today
  return (
    <div className="qorder preorder">
      <div className="qorder-head">
        <strong className="clamp">{order.customer}</strong>
        <span className="preorder-badge">
          <CalendarClock size={13} /> Đặt trước
        </span>
      </div>
      <div className="preorder-when">
        Giao {order.order_date === today ? 'hôm nay' : fmtDate(order.order_date)}
        {order.order_time && <b> {fmtTime(order.order_time)}</b>}
        {late && <span className="danger-text"> · trễ</span>}
      </div>
      <div className="qorder-lines">
        {groupLines(lines.map((l) => ({ ...l, pack: linePack(l) }))).map((g) => (
          <div key={g.product_id} className="qorder-line">
            <span className="qorder-name">{g.name}</span>
            <span className="vtags">
              {g.lines.map((l, i) => (
                <VariantTag key={i} pack={l.pack} temp={l.temp} sugar={l.sugar} qty={l.qty} />
              ))}
            </span>
          </div>
        ))}
        {lines.length === 0 && order.items && <div className="qorder-line">{order.items}</div>}
      </div>
      {lines.length === 0 && <div className="preorder-warn">Đơn chưa chọn món → bấm ✎ chọn món để tính được tiền</div>}
      {lines.length > 0 && order.items && <div className="preorder-note">Món: {order.items}</div>}
      {order.note && <div className="preorder-note">{order.note}</div>}
      <div className="qorder-total">
        <strong>{money(order.total)}</strong>
        {order.deposit > 0 && <span className="small muted">cọc {money(order.deposit)}</span>}
        {order.deposit > 0 && due > 0 && <span className="small preorder-due">còn thu {money(due)}</span>}
      </div>
      <div className="qorder-actions">
        <button
          type="button"
          className="btn btn-primary btn-done"
          onClick={lines.length ? onDone : onEdit}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : lines.length ? <Check size={18} /> : <Pencil size={18} />}{' '}
          {lines.length ? 'Đã giao' : 'Chọn món'}
        </button>
        {order.phone && (
          <a className="icon-btn" href={`tel:${order.phone}`} aria-label={`Gọi ${order.phone}`}>
            <Phone size={17} />
          </a>
        )}
        {onEdit && (
          <button type="button" className="icon-btn" onClick={onEdit} disabled={busy} aria-label="Sửa đơn đặt">
            <Pencil size={17} />
          </button>
        )}
      </div>
    </div>
  )
}

// Thanh đơn đang lập (xanh lá) ghim ở cuối màn hình
export function DraftPanel({ draft, onChange, onSubmit, onCancel, busy }) {
  const [open, setOpen] = useState(false)
  const { lines } = draft
  const total = linesTotal(lines)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const setQty = (i, qty) => onChange({ ...draft, lines: lines.map((l, idx) => (idx === i ? { ...l, qty } : l)).filter((l) => l.qty > 0) })

  return (
    <div className="draft-panel" role="region" aria-label="Đơn đang lập">
      {open && (
        <div className="draft-body">
          {lines.length === 0 ? (
            <p className="muted small">Bấm vào món để thêm vào đơn.</p>
          ) : (
            lines.map((l, i) => (
              <div key={lineKey(l)} className="draft-line">
                <span className="grow">
                  {l.name} <VariantTag pack={l.pack} temp={l.temp} sugar={l.sugar} />
                  <span className="muted small"> · {money(l.price)}</span>
                </span>
                <Stepper value={l.qty} onChange={(v) => setQty(i, v)} label={`${l.name} ${variantText(l.pack, l.temp, l.sugar)}`} />
              </div>
            ))
          )}
        </div>
      )}
      <div className="draft-name">
        <input
          className="draft-note"
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          placeholder="Tên khách (không bắt buộc)"
          aria-label="Tên khách"
          enterKeyHint="done"
        />
      </div>
      <div className="draft-bar">
        <button type="button" className="draft-sum" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="small">{draft.editingId ? `Sửa đơn #${draft.editingId}` : 'Đang lập đơn'} · {count} phần {open ? '▾' : '▴'}</span>
          <strong>{money(total)}</strong>
        </button>
        <button type="button" className="icon-btn draft-cancel" onClick={onCancel} disabled={busy} aria-label="Bỏ đơn đang lập">
          <X size={20} />
        </button>
        {!draft.editingId && (
          <button type="button" className="btn btn-ghost btn-sm draft-now" onClick={() => onSubmit(true)} disabled={busy || count === 0} title="Khách lấy liền: chốt và tính tiền luôn">
            Xong luôn
          </button>
        )}
        <button type="button" className="btn btn-chot" onClick={() => onSubmit(false)} disabled={busy || count === 0} aria-busy={busy || undefined}>
          {busy && <span className="spinner" aria-hidden="true" />} {draft.editingId ? 'Lưu đơn' : 'Chốt đơn'}
        </button>
      </div>
    </div>
  )
}
