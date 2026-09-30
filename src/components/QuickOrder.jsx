import { useState } from 'react'
import { Check, Minus, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { money } from '../lib/format'
import { PACKS, chaiExtraCost, chaiSurcharge, linesProfit, linesTotal, packCost, packPrice, packText } from '../lib/quick'
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

// Popup khi bấm vào món: chọn số Ly / Chai rồi bấm OK
export function PackPicker({ product, lyCost, def, onAdd, onEditPrice, onClose }) {
  const [qty, setQty] = useState({ ly: 1, chai: 0 })
  const price = { ly: packPrice(product, 'ly', def), chai: packPrice(product, 'chai', def) }
  const count = qty.ly + qty.chai
  const total = qty.ly * price.ly + qty.chai * price.chai

  function ok(e) {
    e.preventDefault()
    if (count === 0) return onClose()
    onAdd(
      Object.keys(PACKS).map((pack) => ({
        product_id: product.id,
        name: product.name,
        pack,
        qty: qty[pack],
        price: price[pack],
        cost: packCost(product, pack, lyCost, def),
      })),
    )
  }

  return (
    <Modal title={product.name} onClose={onClose}>
      <form className="form" onSubmit={ok}>
        {Object.entries(PACKS).map(([pack, label]) => (
          <div key={pack} className={`pack-row ${qty[pack] > 0 ? 'on' : ''}`}>
            <button type="button" className="pack-btn" onClick={() => setQty({ ...qty, [pack]: qty[pack] + 1 })}>
              <strong>{label}</strong>
              <span>{money(price[pack])}</span>
              {pack === 'chai' && <span className="muted small">Ly + {money(chaiSurcharge(product, def))}</span>}
            </button>
            <Stepper value={qty[pack]} onChange={(v) => setQty({ ...qty, [pack]: v })} label={label} />
          </div>
        ))}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-edit-price" onClick={onEditPrice}>
            <Pencil size={16} /> Chỉnh giá
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" autoFocus>
            OK{count > 0 && ` · ${money(total)}`}
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

// Gộp dòng theo món: [{ name, ly, chai }]
function groupLines(lines) {
  const out = []
  lines.forEach((l) => {
    let g = out.find((x) => x.product_id === l.product_id)
    if (!g) out.push((g = { product_id: l.product_id, name: l.name, ly: 0, chai: 0 }))
    g[l.pack] += l.qty
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
          <div key={g.product_id} className="kv">
            <span>{g.name}</span>
            <span>{packText(g.ly, g.chai)}</span>
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
              <div key={`${l.product_id}:${l.pack}`} className="draft-line">
                <span className="grow">
                  {l.name} <b>{PACKS[l.pack]}</b>
                  <span className="muted small"> · {money(l.price)}</span>
                </span>
                <Stepper value={l.qty} onChange={(v) => setQty(i, v)} label={`${l.name} ${PACKS[l.pack]}`} />
              </div>
            ))
          )}
          <input
            className="draft-note"
            value={draft.note}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
            placeholder="Tên khách / số thứ tự (không bắt buộc)"
          />
        </div>
      )}
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
