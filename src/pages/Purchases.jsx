import { useEffect, useState } from 'react'
import { PackagePlus, Plus, Wheat } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { fmtDate, money, monthRange, num, thisMonth, todayStr } from '../lib/format'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader } from '../components/ui'

const UNITS = ['g', 'ml', 'kg', 'lít', 'cái', 'hộp', 'gói', 'chai']

export default function Purchases() {
  const [tab, setTab] = useState('nhap')
  const [month, setMonth] = useState(thisMonth())
  const [purchases, setPurchases] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [addPurchase, setAddPurchase] = useState(false)
  const [editIng, setEditIng] = useState(null)

  async function loadIngredients() {
    const { data, error } = await supabase.from('ingredients').select('*').order('name')
    if (!showError(error)) setIngredients(data)
  }
  async function loadPurchases() {
    const { from, to } = monthRange(month)
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
    if (!showError(error)) setPurchases(data)
  }
  useEffect(() => {
    loadIngredients()
  }, [])
  useEffect(() => {
    loadPurchases()
  }, [month])

  async function removePurchase(p) {
    if (!confirm(`Xóa lần nhập "${p.item_name}" (${money(p.total)})?`)) return
    const { error } = await supabase.from('purchases').delete().eq('id', p.id)
    if (!showError(error)) loadPurchases()
  }

  const total = (purchases || []).reduce((s, p) => s + Number(p.total), 0)
  const byDate = {}
  ;(purchases || []).forEach((p) => (byDate[p.date] ||= []).push(p))

  return (
    <>
      <PageHeader title="Nhập hàng" subtitle="Ghi lại tiền mua nguyên liệu">
        {tab === 'nhap' ? (
          <button className="btn btn-primary" onClick={() => setAddPurchase(true)}>
            <Plus size={18} /> Nhập hàng
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setEditIng({})}>
            <Plus size={18} /> Nguyên liệu
          </button>
        )}
      </PageHeader>

      <div className="tabs">
        <button className={tab === 'nhap' ? 'active' : ''} onClick={() => setTab('nhap')}>
          Lịch sử nhập
        </button>
        <button className={tab === 'nl' ? 'active' : ''} onClick={() => setTab('nl')}>
          Nguyên liệu ({ingredients.length})
        </button>
      </div>

      {tab === 'nhap' ? (
        <>
          <div className="toolbar">
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            <span>
              Tổng tháng: <strong>{money(total)}</strong>
            </span>
          </div>
          {!purchases ? (
            <Loading />
          ) : purchases.length === 0 ? (
            <Empty icon={PackagePlus}>Tháng này chưa nhập hàng.</Empty>
          ) : (
            Object.entries(byDate).map(([date, list]) => (
              <div key={date} className="card list-card">
                <div className="list-head">
                  <span>{fmtDate(date)}</span>
                  <span>{money(list.reduce((s, p) => s + Number(p.total), 0))}</span>
                </div>
                {list.map((p) => (
                  <div key={p.id} className="list-row">
                    <div className="grow">
                      <div>{p.item_name}</div>
                      <div className="muted small">
                        {num(p.quantity)} {p.unit} · {money(p.total / p.quantity)}/{p.unit}
                        {p.note ? ` · ${p.note}` : ''}
                      </div>
                    </div>
                    <strong>{money(p.total)}</strong>
                    <button className="btn btn-ghost btn-sm" onClick={() => removePurchase(p)}>
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      ) : ingredients.length === 0 ? (
        <Empty icon={Wheat}>Chưa có nguyên liệu. Thêm nguyên liệu hoặc nhập hàng lần đầu.</Empty>
      ) : (
        <div className="card list-card">
          {ingredients.map((g) => (
            <button key={g.id} className="list-row list-link" onClick={() => setEditIng(g)}>
              <span className="grow">{g.name}</span>
              <span>
                {money(g.price_per_unit)} / {g.unit}
              </span>
            </button>
          ))}
        </div>
      )}

      {addPurchase && (
        <PurchaseForm
          ingredients={ingredients}
          onClose={() => setAddPurchase(false)}
          onSaved={() => {
            setAddPurchase(false)
            loadPurchases()
            loadIngredients()
          }}
        />
      )}
      {editIng && (
        <IngredientForm
          ingredient={editIng}
          onClose={() => setEditIng(null)}
          onSaved={() => {
            setEditIng(null)
            loadIngredients()
          }}
        />
      )}
    </>
  )
}

function PurchaseForm({ ingredients, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: todayStr(),
    ingredient_id: ingredients[0]?.id ?? 'new',
    new_name: '',
    new_unit: 'g',
    quantity: '',
    total: '',
    note: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isNew = form.ingredient_id === 'new'
  const ing = ingredients.find((g) => String(g.id) === String(form.ingredient_id))
  const unit = isNew ? form.new_unit : ing?.unit
  const unitPrice = Number(form.quantity) > 0 ? Number(form.total || 0) / Number(form.quantity) : 0

  async function submit(e) {
    e.preventDefault()
    const quantity = Number(form.quantity)
    if (!(quantity > 0)) return alert('Số lượng phải lớn hơn 0')
    setBusy(true)
    let ingredient = ing
    if (isNew) {
      const { data, error } = await supabase
        .from('ingredients')
        .insert({ name: form.new_name.trim(), unit: form.new_unit, price_per_unit: unitPrice })
        .select()
        .single()
      if (showError(error)) return setBusy(false)
      ingredient = data
    } else {
      // cập nhật giá nguyên liệu theo lần mua mới nhất
      const { error } = await supabase.from('ingredients').update({ price_per_unit: unitPrice }).eq('id', ingredient.id)
      if (showError(error)) return setBusy(false)
    }
    const { error } = await supabase.from('purchases').insert({
      date: form.date,
      ingredient_id: ingredient.id,
      item_name: ingredient.name,
      quantity,
      unit: ingredient.unit,
      total: Number(form.total || 0),
      note: form.note.trim() || null,
    })
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title="Nhập hàng" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Ngày mua">
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </Field>
        <Field label="Nguyên liệu">
          <select value={form.ingredient_id} onChange={(e) => set('ingredient_id', e.target.value)}>
            {ingredients.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.unit})
              </option>
            ))}
            <option value="new">+ Nguyên liệu mới…</option>
          </select>
        </Field>
        {isNew && (
          <div className="form-row">
            <Field label="Tên nguyên liệu mới">
              <input value={form.new_name} onChange={(e) => set('new_name', e.target.value)} required placeholder="VD: Hạt điều" />
            </Field>
            <Field label="Đơn vị tính" hint="Nên dùng g / ml để dễ ghi công thức">
              <UnitSelect value={form.new_unit} onChange={(v) => set('new_unit', v)} />
            </Field>
          </div>
        )}
        <div className="form-row">
          <Field label={`Số lượng mua${unit ? ` (${unit})` : ''}`} hint={unit === 'g' ? 'Mua 1kg thì nhập 1000' : unit === 'ml' ? 'Mua 1 lít thì nhập 1000' : ''}>
            <input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              required
            />
          </Field>
          <Field label="Tổng tiền trả">
            <MoneyInput value={form.total} onChange={(v) => set('total', v)} required />
          </Field>
        </div>
        {unitPrice > 0 && (
          <div className="summary-box">
            <div className="kv">
              <span>Giá mỗi {unit}</span>
              <strong>{money(unitPrice)}</strong>
            </div>
          </div>
        )}
        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Mua ở đâu, loại gì…" />
        </Field>
        <div className="form-actions">
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

function UnitSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {UNITS.map((u) => (
        <option key={u}>{u}</option>
      ))}
    </select>
  )
}

function IngredientForm({ ingredient, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: ingredient.name || '',
    unit: ingredient.unit || 'g',
    price_per_unit: ingredient.price_per_unit ?? '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    const payload = { name: form.name.trim(), unit: form.unit, price_per_unit: Number(form.price_per_unit || 0) }
    const { error } = ingredient.id
      ? await supabase.from('ingredients').update(payload).eq('id', ingredient.id)
      : await supabase.from('ingredients').insert(payload)
    if (!showError(error)) onSaved()
  }

  async function remove() {
    if (!confirm(`Xóa nguyên liệu "${ingredient.name}"? Công thức đang dùng nguyên liệu này sẽ không tính nữa.`)) return
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredient.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={ingredient.id ? 'Sửa nguyên liệu' : 'Thêm nguyên liệu'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Tên nguyên liệu">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="VD: Hạnh nhân" />
        </Field>
        <div className="form-row">
          <Field label="Đơn vị tính">
            <UnitSelect value={form.unit} onChange={(v) => set('unit', v)} />
          </Field>
          <Field label={`Giá mỗi ${form.unit}`} hint="Tự cập nhật mỗi lần nhập hàng">
            <input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={form.price_per_unit}
              onChange={(e) => set('price_per_unit', e.target.value)}
            />
          </Field>
        </div>
        <div className="form-actions">
          {ingredient.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              Xóa
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary">Lưu</button>
        </div>
      </form>
    </Modal>
  )
}
