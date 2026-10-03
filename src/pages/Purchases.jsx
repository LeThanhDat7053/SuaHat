import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackagePlus, Plus, Trash2 } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { loadStockCached } from '../lib/stock'
import { useLive } from '../lib/live'
import { avgPrice } from '../lib/cost'
import { BIG_UNIT, fmtDate, fmtQty, money, periodRange, todayStr, unitMoney, unitPrice } from '../lib/format'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader, PeriodPicker, SaveButton } from '../components/ui'
import { UNITS } from './Ingredients'
import { groupByCategory } from '../lib/categories'

export default function Purchases() {
  const [period, setPeriod] = useState({ mode: 'day', date: todayStr() })
  const [purchases, setPurchases] = useState(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    const { from, to } = periodRange(period.mode, period.date)
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
    load()
  }, [period])
  useLive(['purchases'], load)

  async function remove(p) {
    if (!confirm(`Xóa lần nhập "${p.item_name}" (${money(p.total)})?\nGiá nguyên liệu không tự đổi lại, sửa tay ở trang Nguyên liệu nếu cần.`)) return
    const { error } = await supabase.from('purchases').delete().eq('id', p.id)
    if (!showError(error)) load()
  }

  const total = (purchases || []).reduce((s, p) => s + Number(p.total), 0)
  const byDate = {}
  ;(purchases || []).forEach((p) => (byDate[p.date] ||= []).push(p))

  return (
    <>
      <PageHeader title="Nhập hàng" subtitle="Ghi lại tiền mua nguyên liệu. Giá nguyên liệu tự tính bình quân.">
        <Link to="/nguyen-lieu" className="btn btn-ghost">
          Nguyên liệu & tồn kho
        </Link>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} /> Nhập hàng
        </button>
      </PageHeader>

      <PeriodPicker period={period} onChange={setPeriod} />
      <div className="toolbar">
        <span>
          Tổng tiền nhập: <strong>{money(total)}</strong>
        </span>
      </div>

      {!purchases ? (
        <Loading />
      ) : purchases.length === 0 ? (
        <Empty icon={PackagePlus}>Chưa nhập hàng trong khoảng này.</Empty>
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
                    {fmtQty(p.quantity, p.unit)} · {unitPrice(p.total / p.quantity, p.unit)}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
                <strong>{money(p.total)}</strong>
                <button className="icon-btn" onClick={() => remove(p)} aria-label="Xóa">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      {adding && (
        <PurchaseForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            load()
          }}
        />
      )}
    </>
  )
}

const emptyLine = (ingredients) => ({
  ingredient_id: ingredients[0]?.id ?? 'new',
  new_name: '',
  new_unit: 'g',
  buy_unit: '',
  quantity: '',
  total: '',
})

// Tính số liệu của 1 dòng nhập: đơn vị, lượng đã đổi ra g / ml, giá mỗi đơn vị
function lineInfo(line, ingredients) {
  const isNew = line.ingredient_id === 'new'
  const ing = ingredients.find((g) => String(g.id) === String(line.ingredient_id))
  const unit = isNew ? line.new_unit : ing?.unit
  // mua theo đơn vị lớn (kg / lít) thì đổi ra đơn vị nhỏ (g / ml) để lưu
  const big = BIG_UNIT[unit]
  const buyUnits = big ? [big, unit] : [unit]
  const buyUnit = buyUnits.includes(line.buy_unit) ? line.buy_unit : buyUnits[0]
  const quantity = Number(line.quantity || 0) * (buyUnit === big ? 1000 : 1)
  const price = quantity > 0 ? Number(line.total || 0) / quantity : 0
  return { isNew, ing, unit, big, buyUnits, buyUnit, quantity, price }
}

function PurchaseForm({ onClose, onSaved }) {
  const [stock, setStock] = useState(null) // { stock, ingredients }
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadStockCached().then(
      (d) => {
        setStock(d)
        setLines([emptyLine(d.ingredients)])
      },
      (e) => showError(e),
    )
  }, [])

  const ingredients = stock?.ingredients || []
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const grand = lines.reduce((s, l) => s + Number(l.total || 0), 0)

  async function submit(e) {
    e.preventDefault()
    const infos = lines.map((l) => lineInfo(l, ingredients))
    if (infos.some((x) => !(x.quantity > 0))) return alert('Số lượng mỗi dòng phải lớn hơn 0')
    setBusy(true)
    // tồn & giá hiện tại, cập nhật dần nếu 1 nguyên liệu xuất hiện nhiều dòng
    const cur = {}
    ingredients.forEach((g) => (cur[g.id] = { stock: stock.stock[g.id], price: Number(g.price_per_unit) }))
    const rows = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const info = infos[i]
      const total = Number(line.total || 0)
      let ingredient = info.ing
      if (info.isNew) {
        const { data, error } = await supabase
          .from('ingredients')
          .insert({ name: line.new_name.trim(), unit: line.new_unit, price_per_unit: info.price })
          .select()
          .single()
        if (showError(error)) return setBusy(false)
        ingredient = data
        cur[data.id] = { stock: info.quantity, price: info.price }
      } else {
        const c = cur[ingredient.id]
        const price = avgPrice(c.stock, c.price, info.quantity, total)
        const { error } = await supabase.from('ingredients').update({ price_per_unit: price }).eq('id', ingredient.id)
        if (showError(error)) return setBusy(false)
        cur[ingredient.id] = { stock: Math.max(0, c.stock) + info.quantity, price }
      }
      rows.push({
        date,
        ingredient_id: ingredient.id,
        item_name: ingredient.name,
        quantity: info.quantity,
        unit: ingredient.unit,
        total,
        note: note.trim() || null,
      })
    }
    const { error } = await supabase.from('purchases').insert(rows)
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title="Nhập hàng" onClose={onClose}>
      {!stock ? (
        <Loading />
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="form-row">
            <Field label="Ngày mua">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Ghi chú">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mua ở đâu…" />
            </Field>
          </div>

          {lines.map((line, i) => {
            const info = lineInfo(line, ingredients)
            const c = info.ing && stock.stock[info.ing.id]
            const newAvg = info.ing && info.price > 0 ? avgPrice(c, info.ing.price_per_unit, info.quantity, line.total) : 0
            return (
              <div key={i} className="line-card">
                <div className="line-card-head">
                  <strong>Món {i + 1}</strong>
                  {lines.length > 1 && (
                    <button type="button" className="icon-btn" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} aria-label="Bỏ dòng này">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <Field label="Nguyên liệu">
                  <select value={line.ingredient_id} onChange={(e) => setLine(i, 'ingredient_id', e.target.value)}>
                    {groupByCategory(ingredients).map(([cat, list]) => (
                      <optgroup key={cat} label={cat}>
                        {list.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="new">+ Nguyên liệu mới…</option>
                  </select>
                </Field>
                {info.isNew && (
                  <div className="form-row">
                    <Field label="Tên nguyên liệu mới">
                      <input value={line.new_name} onChange={(e) => setLine(i, 'new_name', e.target.value)} required placeholder="VD: Hạt điều" />
                    </Field>
                    <Field label="Đơn vị trong công thức" hint="Hạt, bột: g · Nước, sữa: ml">
                      <select value={line.new_unit} onChange={(e) => setLine(i, 'new_unit', e.target.value)}>
                        {UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                <div className="form-row">
                  <Field
                    label="Số lượng mua"
                    hint={
                      info.buyUnit !== info.unit && info.quantity > 0
                        ? `= ${fmtQty(info.quantity, info.unit)}`
                        : info.big
                          ? `VD: 2,5 ${info.big} thì nhập 2.5`
                          : ''
                    }
                  >
                    <div className="qty-input">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => setLine(i, 'quantity', e.target.value)}
                        required
                      />
                      {info.buyUnits.length > 1 ? (
                        <select value={info.buyUnit} onChange={(e) => setLine(i, 'buy_unit', e.target.value)} aria-label="Đơn vị mua">
                          {info.buyUnits.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted">{info.unit}</span>
                      )}
                    </div>
                  </Field>
                  <Field label="Tổng tiền trả">
                    <MoneyInput value={line.total} onChange={(v) => setLine(i, 'total', v)} required />
                  </Field>
                </div>
                {info.ing?.no_stock && (
                  <p className="field-hint">
                    “{info.ing.name}” đang để <b>Nhà có / không tính kho</b> nên tiền mua không vào giá vốn. Muốn tính vào lãi thì ghi ở{' '}
                    <Link to="/chi-phi">Chi phí khác</Link> thay vì nhập hàng.
                  </p>
                )}
                {info.ing?.cost_on_buy && !info.ing.no_stock && (
                  <p className="field-hint">
                    “{info.ing.name}” <b>tính tiền 1 lần lúc mua</b>: số tiền này trừ thẳng vào lãi ngày {date.slice(8)}/{date.slice(5, 7)}, ly bán ra không
                    tính nữa. Kho vẫn cộng / trừ bình thường.
                  </p>
                )}
                {info.price > 0 && (
                  <div className="summary-box">
                    <div className="kv">
                      <span>Giá lần này</span>
                      <strong>
                        {info.big ? `${money(info.price * 1000)}/${info.big} · ` : ''}
                        {unitMoney(info.price)}/{info.unit}
                      </strong>
                    </div>
                    {info.ing && c > 0 && (
                      <div className="kv">
                        <span>Giá bình quân mới (còn tồn {fmtQty(c, info.unit)})</span>
                        <strong>{unitPrice(newAvg, info.unit)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" className="btn btn-ghost" onClick={() => setLines([...lines, emptyLine(ingredients)])}>
            <Plus size={16} /> Thêm món khác
          </button>

          <div className="form-actions">
            <span className="grow">
              Tổng: <strong>{money(grand)}</strong>
            </span>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Hủy
            </button>
            <SaveButton busy={busy} />
          </div>
        </form>
      )}
    </Modal>
  )
}
