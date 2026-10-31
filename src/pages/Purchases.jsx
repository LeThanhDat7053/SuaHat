import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackagePlus, Plus, Trash2 } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { loadStockCached } from '../lib/stock'
import { useLive } from '../lib/live'
import { avgPrice } from '../lib/cost'
import { missingColumn } from '../lib/quick'
import { BIG_UNIT, fmtDate, fmtQty, money, periodRange, todayStr, unitMoney, unitPrice } from '../lib/format'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader, PeriodPicker, SaveButton } from '../components/ui'
import { UNITS } from './Ingredients'
import { altOf, buyUnitsOf } from '../lib/units'
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
                    {p.in_count ? ' · đã có trong kiểm kê, không cộng kho' : ''}
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
  in_count: null, // ngày mua ≤ ngày kiểm kê: true = hàng đã nằm trong số đếm, false = về sau lúc kiểm; null = chưa chọn
})

// Tính số liệu của 1 dòng nhập: đơn vị, lượng đã đổi ra g / ml, giá mỗi đơn vị
function lineInfo(line, ingredients) {
  const isNew = line.ingredient_id === 'new'
  const ing = ingredients.find((g) => String(g.id) === String(line.ingredient_id))
  const unit = isNew ? line.new_unit : ing?.unit
  // mua theo đơn vị lớn (kg / lít) hoặc đơn vị quy đổi (bắp: trái) thì đổi ra đơn vị gốc (g / ml) để lưu
  const big = BIG_UNIT[unit]
  const units = buyUnitsOf(isNew ? null : ing, unit)
  const buyUnits = units.map((u) => u.unit)
  const buy = units.find((u) => u.unit === line.buy_unit) || units[0]
  const buyUnit = buy.unit
  const quantity = Number(line.quantity || 0) * buy.factor
  const price = quantity > 0 ? Number(line.total || 0) / quantity : 0
  return { isNew, ing, unit, big, buyUnits, buyUnit, quantity, price }
}

function PurchaseForm({ onClose, onSaved }) {
  const [stock, setStock] = useState(null) // { stock, ingredients }
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([])
  const [busy, setBusy] = useState(false)
  const [lastBuy, setLastBuy] = useState({}) // ingredient_id → lần nhập gần nhất (để so giá)

  useEffect(() => {
    loadStockCached().then(
      (d) => {
        setStock(d)
        setLines([emptyLine(d.ingredients)])
      },
      (e) => showError(e),
    )
    supabase
      .from('purchases')
      .select('ingredient_id,date,quantity,total')
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const m = {}
        ;(data || []).forEach((p) => p.ingredient_id && Number(p.quantity) > 0 && !m[p.ingredient_id] && (m[p.ingredient_id] = p))
        setLastBuy(m)
      })
  }, [])

  const ingredients = stock?.ingredients || []
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const grand = lines.reduce((s, l) => s + Number(l.total || 0), 0)

  // Lần kiểm kê gần nhất có ngày ≥ ngày mua → hàng này có thể đã nằm trong số đếm, phải hỏi để không cộng kho 2 lần
  const countOf = (info) => {
    const lc = info.ing && !info.ing.no_stock && stock.lastCount[info.ing.id]
    return lc && date <= lc.date ? lc : null
  }
  const inCountOf = (line, info) => !info.isNew && line.in_count === true && !!countOf(info)

  async function submit(e) {
    e.preventDefault()
    const infos = lines.map((l) => lineInfo(l, ingredients))
    if (infos.some((x) => !(x.quantity > 0))) return alert('Số lượng mỗi dòng phải lớn hơn 0')
    const unanswered = infos.filter((x, i) => countOf(x) && lines[i].in_count == null)
    if (unanswered.length) {
      return alert(`Chọn giúp: ${unanswered.map((x) => x.ing.name).join(', ')} đã nằm trong số kiểm kê chưa? (ô hỏi ngay dưới dòng đó)`)
    }
    // cùng 1 nguyên liệu nhiều dòng trong phiếu → hay gặp khi bấm "Thêm nguyên liệu khác" rồi chọn trùng
    const seen = {}
    infos.forEach((x) => x.ing && (seen[x.ing.id] = (seen[x.ing.id] || 0) + 1))
    // giá lần này gấp đôi / còn một nửa giá đang dùng → hay là gõ nhầm tiền hoặc số lượng
    const odd = infos.filter((x) => x.ing && Number(x.ing.price_per_unit) > 0 && x.price > 0 && (x.price > x.ing.price_per_unit * 2 || x.price < x.ing.price_per_unit / 2))
    if (odd.length) {
      const list = odd.map((x) => `• ${x.ing.name}: lần này ${unitPrice(x.price, x.unit)}, đang dùng ${unitPrice(x.ing.price_per_unit, x.unit)}`).join('\n')
      if (!confirm(`Giá khác thường:\n${list}\n\nKiểm tra lại số lượng / tổng tiền. OK = vẫn lưu, Hủy = sửa lại.`)) return
    }
    const twice = ingredients.filter((g) => seen[g.id] > 1).map((g) => g.name)
    if (twice.length && !confirm(`${twice.join(', ')} có nhiều dòng trong phiếu này. Có phải nhập trùng không?\nOK = đúng là mua nhiều lần, vẫn lưu · Hủy = quay lại sửa`)) return
    setBusy(true)
    // đã có phiếu giống hệt (cùng ngày, cùng nguyên liệu, cùng số lượng) → có thể đã nhập rồi
    const ids = Object.keys(seen).map(Number)
    if (ids.length) {
      const { data: same, error } = await supabase.from('purchases').select('ingredient_id,quantity').eq('date', date).in('ingredient_id', ids)
      if (showError(error)) return setBusy(false)
      const hit = infos.filter((x) => x.ing && same.some((p) => p.ingredient_id === x.ing.id && Math.abs(Number(p.quantity) - x.quantity) < 1e-6))
      const list = hit.map((x) => `${x.ing.name} ${fmtQty(x.quantity, x.unit)}`).join(', ')
      if (hit.length && !confirm(`Ngày ${fmtDate(date)} đã có phiếu nhập giống hệt: ${list}.\nCó thể đã nhập rồi. Vẫn lưu thêm?`)) return setBusy(false)
    }

    // tồn & giá hiện tại, cập nhật dần nếu 1 nguyên liệu xuất hiện nhiều dòng
    const cur = {}
    ingredients.forEach((g) => (cur[g.id] = { stock: stock.stock[g.id], price: Number(g.price_per_unit) }))
    const rows = []
    const prices = {} // nguyên liệu có sẵn → giá bình quân mới, chỉ lưu sau khi phiếu nhập đã ghi xong
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const info = infos[i]
      const total = Number(line.total || 0)
      const inCount = inCountOf(line, info)
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
        // hàng đã nằm trong số kiểm kê → tồn hiện tại đã gồm lượng này, không cộng thêm
        const before = inCount ? Math.max(0, c.stock) - info.quantity : c.stock
        const price = avgPrice(before, c.price, info.quantity, total)
        prices[ingredient.id] = price
        cur[ingredient.id] = { stock: inCount ? c.stock : Math.max(0, c.stock) + info.quantity, price }
      }
      rows.push({
        date,
        ingredient_id: ingredient.id,
        item_name: ingredient.name,
        quantity: info.quantity,
        unit: ingredient.unit,
        total,
        note: note.trim() || null,
        in_count: inCount,
      })
    }
    // chỉ gửi cột in_count (nang-cap-v8.sql) khi có dùng
    const payload = rows.some((r) => r.in_count) ? rows : rows.map(({ in_count: _, ...r }) => r)
    const { error } = await supabase.from('purchases').insert(payload)
    if (missingColumn(error)) {
      setBusy(false)
      return alert('Cần chạy file supabase/nang-cap-v8.sql trong Supabase → SQL Editor để đánh dấu "hàng đã nằm trong số kiểm kê".')
    }
    if (showError(error)) return setBusy(false)
    for (const [id, price] of Object.entries(prices)) {
      const { error } = await supabase.from('ingredients').update({ price_per_unit: price }).eq('id', id)
      if (showError(error)) break
    }
    setBusy(false)
    onSaved()
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
            const lc = countOf(info)
            const inCount = inCountOf(line, info)
            const c = info.ing && stock.stock[info.ing.id]
            const newAvg = info.ing && info.price > 0 ? avgPrice(inCount ? Math.max(0, c) - info.quantity : c, info.ing.price_per_unit, info.quantity, line.total) : 0
            return (
              <div key={i} className="line-card">
                <div className="line-card-head">
                  <strong>Nguyên liệu {i + 1}</strong>
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
                {info.ing && !info.ing.no_stock && (
                  <p className="field-hint buy-ctx">
                    Đang còn <b>{fmtQty(c, info.unit)}</b>
                    {lastBuy[info.ing.id] && (
                      <>
                        {' '}
                        · lần trước {fmtDate(lastBuy[info.ing.id].date)}: {fmtQty(lastBuy[info.ing.id].quantity, info.unit)} ={' '}
                        {money(lastBuy[info.ing.id].total)} ({unitPrice(lastBuy[info.ing.id].total / lastBuy[info.ing.id].quantity, info.unit)})
                      </>
                    )}
                  </p>
                )}
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
                        ? `= ${fmtQty(info.quantity, info.unit)}${
                            altOf(info.ing)?.unit === info.buyUnit ? ` (1 ${info.buyUnit} ≈ ${fmtQty(altOf(info.ing).factor, info.unit)})` : ''
                          }`
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
                {lc && (
                  <div className="field">
                    <span className="field-label">Lúc kiểm kê ngày {fmtDate(lc.date)}, hàng này đã có trong kho chưa?</span>
                    <div className="mode-pick">
                      <label className={`mode-opt ${line.in_count === true ? 'on' : ''}`}>
                        <input type="radio" name={`in-count-${i}`} checked={line.in_count === true} onChange={() => setLine(i, 'in_count', true)} />
                        <span>
                          <b>Có rồi — lúc cân / đếm đã có hàng này</b>
                          <span className="muted small block">Chỉ ghi tiền, không cộng thêm vào kho (tránh cộng 2 lần).</span>
                        </span>
                      </label>
                      <label className={`mode-opt ${line.in_count === false ? 'on' : ''}`}>
                        <input type="radio" name={`in-count-${i}`} checked={line.in_count === false} onChange={() => setLine(i, 'in_count', false)} />
                        <span>
                          <b>Chưa — hàng về sau lúc kiểm kê</b>
                          <span className="muted small block">Cộng {info.quantity > 0 ? fmtQty(info.quantity, info.unit) : 'số này'} vào kho.</span>
                        </span>
                      </label>
                    </div>
                  </div>
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
            <Plus size={16} /> Thêm nguyên liệu khác
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
