import { useEffect, useState } from 'react'
import { ClipboardCheck, Plus, Trash2, Wheat } from 'lucide-react'
import { fetchAll, showError, supabase } from '../lib/supabase'
import { loadStock } from '../lib/stock'
import { BIG_UNIT, fmtDate, fmtQty, money, todayStr, unitMoney, unitPrice } from '../lib/format'
import { Empty, Field, Loading, Modal, PageHeader, StatTile } from '../components/ui'

// Đơn vị dùng trong công thức. Hạt/bột dùng g, nước/sữa dùng ml — lúc mua vẫn nhập theo kg / lít được.
export const UNITS = ['g', 'ml', 'cái', 'hộp', 'gói', 'chai']

// Số nhập theo đơn vị lớn (kg / lít) → đơn vị lưu (g / ml)
const toBase = (v, unit) => Number(v) * (BIG_UNIT[unit] ? 1000 : 1)
const fromBase = (v, unit) => Number(v) / (BIG_UNIT[unit] ? 1000 : 1)
const bigOf = (unit) => BIG_UNIT[unit] || unit

export default function Ingredients() {
  const [tab, setTab] = useState('ton')
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)
  const [counting, setCounting] = useState(false)

  async function load() {
    try {
      setData(await loadStock())
    } catch (e) {
      showError(e)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const reload = () => {
    setEdit(null)
    setCounting(false)
    load()
  }

  return (
    <>
      <PageHeader title="Nguyên liệu & tồn kho" subtitle="Tồn kho tự trừ theo số bán × công thức. Kiểm kê định kỳ để biết hao hụt.">
        <button className="btn btn-ghost" onClick={() => setCounting(true)} disabled={!data?.ingredients.length}>
          <ClipboardCheck size={18} /> Kiểm kê
        </button>
        <button className="btn btn-primary" onClick={() => setEdit({})}>
          <Plus size={18} /> Nguyên liệu
        </button>
      </PageHeader>

      <div className="tabs">
        <button className={tab === 'ton' ? 'active' : ''} onClick={() => setTab('ton')}>
          Tồn kho
        </button>
        <button className={tab === 'kk' ? 'active' : ''} onClick={() => setTab('kk')}>
          Lịch sử kiểm kê
        </button>
      </div>

      {!data ? <Loading /> : tab === 'ton' ? <StockList data={data} onEdit={setEdit} /> : <CountHistory onChanged={load} />}

      {edit && <IngredientForm ingredient={edit} onClose={() => setEdit(null)} onSaved={reload} />}
      {counting && <StockCountForm ingredients={data.ingredients} onClose={() => setCounting(false)} onSaved={reload} />}
    </>
  )
}

function StockList({ data, onEdit }) {
  const { ingredients, stock, lastCount } = data
  if (ingredients.length === 0) return <Empty icon={Wheat}>Chưa có nguyên liệu. Bấm “+ Nguyên liệu” hoặc nhập hàng lần đầu.</Empty>

  const value = ingredients.reduce((s, g) => s + Math.max(0, stock[g.id]) * g.price_per_unit, 0)
  const low = ingredients.filter((g) => g.min_stock > 0 && stock[g.id] < g.min_stock)
  const neverCounted = ingredients.every((g) => !lastCount[g.id])

  return (
    <>
      {neverCounted && (
        <div className="callout">
          <strong>Lần đầu dùng?</strong> Bấm <b>Kiểm kê</b> và nhập số hàng đang có trong kho. Từ đó app tự cộng khi nhập hàng và
          tự trừ khi bán.
        </div>
      )}
      <div className="stats stats-3">
        <StatTile label="Giá trị tồn kho" value={money(value)} />
        <StatTile label="Nguyên liệu" value={ingredients.length} />
        <StatTile label="Sắp hết" value={low.length} tone={low.length ? 'bad' : undefined} />
      </div>
      <div className="card list-card">
        {ingredients.map((g) => {
          const s = stock[g.id]
          const isLow = g.min_stock > 0 && s < g.min_stock
          return (
            <button key={g.id} className="list-row list-link" onClick={() => onEdit(g)}>
              <div className="grow">
                <div>
                  {g.name} {isLow && <span className="badge badge-bad">Sắp hết</span>}
                </div>
                <div className="muted small">
                  {unitPrice(g.price_per_unit, g.unit)}
                  {lastCount[g.id] ? ` · kiểm kê ${fmtDate(lastCount[g.id].date)}` : ' · chưa kiểm kê'}
                </div>
              </div>
              <div className="align-right">
                <strong className={s < 0 ? 'danger-text' : ''}>{fmtQty(s, g.unit)}</strong>
                {s < 0 && <span className="muted small block">Chưa kiểm kê hoặc quên ghi nhập hàng</span>}
                {g.min_stock > 0 && s >= 0 && <span className="muted small block">báo khi dưới {fmtQty(g.min_stock, g.unit)}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function CountHistory({ onChanged }) {
  const [rows, setRows] = useState(null)

  async function load() {
    const { data, error } = await fetchAll(() =>
      supabase.from('stock_counts').select('*, ingredients(name, unit)').order('date', { ascending: false }).order('id'),
    )
    if (!showError(error)) setRows(data)
  }
  useEffect(() => {
    load()
  }, [])

  async function remove(r) {
    if (!confirm(`Xóa lần kiểm kê ${r.ingredients?.name} ngày ${fmtDate(r.date)}?`)) return
    const { error } = await supabase.from('stock_counts').delete().eq('id', r.id)
    if (!showError(error)) {
      load()
      onChanged()
    }
  }

  if (!rows) return <Loading />
  if (rows.length === 0) return <Empty icon={ClipboardCheck}>Chưa kiểm kê lần nào.</Empty>

  const byDate = {}
  rows.forEach((r) => (byDate[r.date] ||= []).push(r))

  return Object.entries(byDate).map(([date, list]) => {
    const loss = list.reduce((s, r) => s + (r.expected - r.counted) * r.unit_price, 0)
    return (
      <div key={date} className="card list-card">
        <div className="list-head">
          <span>{fmtDate(date)}</span>
          <span className={loss > 0 ? 'danger-text' : ''}>{loss > 0 ? `Hao hụt ${money(loss)}` : loss < 0 ? `Dư ${money(-loss)}` : 'Khớp'}</span>
        </div>
        {list.map((r) => {
          const unit = r.ingredients?.unit || ''
          const diff = r.counted - r.expected
          return (
            <div key={r.id} className="list-row">
              <div className="grow">
                <div>{r.ingredients?.name || '(đã xóa)'}</div>
                <div className="muted small">
                  Sổ sách {fmtQty(r.expected, unit)} · thực tế {fmtQty(r.counted, unit)}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
              </div>
              <div className="align-right">
                <strong className={diff < 0 ? 'danger-text' : ''}>
                  {diff > 0 ? '+' : ''}
                  {fmtQty(diff, unit)}
                </strong>
                <span className="muted small block">{money(diff * r.unit_price)}</span>
              </div>
              <button className="icon-btn" onClick={() => remove(r)} aria-label="Xóa">
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
      </div>
    )
  })
}

function StockCountForm({ ingredients, onClose, onSaved }) {
  const [date, setDate] = useState(todayStr())
  const [expected, setExpected] = useState(null)
  const [values, setValues] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setExpected(null)
    loadStock(date).then(
      (d) => setExpected(d.stock),
      (e) => showError(e),
    )
  }, [date])

  const filled = ingredients.filter((g) => values[g.id] !== undefined && values[g.id] !== '')
  const loss = expected
    ? filled.reduce((s, g) => s + (expected[g.id] - toBase(values[g.id], g.unit)) * g.price_per_unit, 0)
    : 0

  async function submit(e) {
    e.preventDefault()
    if (filled.length === 0) return alert('Chưa nhập số tồn thực tế nào')
    setBusy(true)
    const rows = filled.map((g) => ({
      date,
      ingredient_id: g.id,
      counted: toBase(values[g.id], g.unit),
      expected: expected[g.id],
      unit_price: g.price_per_unit,
      note: note.trim() || null,
    }))
    const { error } = await supabase.from('stock_counts').insert(rows)
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title="Kiểm kê kho" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Kiểm kê vào cuối ngày" hint="Nên làm sau khi đã nhập xong bán hàng. Kiểm kê buổi sáng trước khi bán thì chọn ngày hôm qua.">
          <input type="date" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} required />
        </Field>
        <p className="muted small">Cân / đếm hàng thực tế rồi nhập vào. Món nào không kiểm thì để trống.</p>
        {!expected ? (
          <Loading />
        ) : (
          <div className="count-list">
            {ingredients.map((g) => {
              const v = values[g.id]
              const diff = v === undefined || v === '' ? null : toBase(v, g.unit) - expected[g.id]
              return (
                <div key={g.id} className="count-row">
                  <div className="grow">
                    <div>{g.name}</div>
                    <div className="muted small">
                      Sổ sách: {fmtQty(expected[g.id], g.unit)}
                      {diff !== null && Math.abs(diff) > 1e-9 && (
                        <span className={diff < 0 ? 'danger-text' : 'good-text'}>
                          {' '}
                          · {diff > 0 ? '+' : ''}
                          {fmtQty(diff, g.unit)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="unit-input count-input">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      value={v ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [g.id]: e.target.value }))}
                      aria-label={`Tồn thực tế ${g.name}`}
                    />
                    <span>{bigOf(g.unit)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <Field label="Ghi chú">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: hạt điều bị ẩm 200g" />
        </Field>
        {filled.length > 0 && (
          <div className="summary-box">
            <div className="kv">
              <span>{loss >= 0 ? 'Hao hụt' : 'Dư so với sổ sách'}</span>
              <strong className={loss > 0 ? 'danger-text' : ''}>{money(Math.abs(loss))}</strong>
            </div>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy || !expected}>
            {busy ? 'Đang lưu…' : 'Lưu kiểm kê'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function UnitSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {[...new Set([...UNITS, value])].map((u) => (
        <option key={u}>{u}</option>
      ))}
    </select>
  )
}

export function IngredientForm({ ingredient, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: ingredient.name || '',
    unit: ingredient.unit || 'g',
    // hạt / sữa nhập giá và mức báo hết theo kg / lít cho dễ, lưu lại theo g / ml
    price: ingredient.price_per_unit == null ? '' : +(ingredient.price_per_unit * (BIG_UNIT[ingredient.unit] ? 1000 : 1)).toFixed(2),
    min_stock: ingredient.min_stock ? +fromBase(ingredient.min_stock, ingredient.unit).toFixed(3) : '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const big = BIG_UNIT[form.unit]

  async function submit(e) {
    e.preventDefault()
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      price_per_unit: Number(form.price || 0) / (big ? 1000 : 1),
      min_stock: toBase(form.min_stock || 0, form.unit),
    }
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
          <Field label="Đơn vị trong công thức" hint="Hạt, bột: g · Nước, sữa: ml">
            <UnitSelect value={form.unit} onChange={(v) => set('unit', v)} />
          </Field>
          <Field
            label={`Giá mỗi ${big || form.unit}`}
            hint={
              big && Number(form.price) > 0
                ? `= ${unitMoney(form.price / 1000)}/${form.unit} · tự tính lại khi nhập hàng`
                : 'Tự tính lại (bình quân) mỗi lần nhập hàng'
            }
          >
            <input type="number" step="any" min="0" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
        </div>
        <Field label={`Báo sắp hết khi còn dưới (${bigOf(form.unit)})`} hint="Để trống nếu không cần báo">
          <input
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={form.min_stock}
            onChange={(e) => set('min_stock', e.target.value)}
            placeholder={big ? 'VD: 1' : 'VD: 50'}
          />
        </Field>
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
