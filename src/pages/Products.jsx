import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CupSoda, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { getSetting, setSetting, showError, supabase } from '../lib/supabase'
import { fmtQty, money, num } from '../lib/format'
import { batchCost, productCost, toMap } from '../lib/cost'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader } from '../components/ui'

export const DEFAULT_MARGIN = 40

export default function Products() {
  const [tab, setTab] = useState('mon')
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editRecipe, setEditRecipe] = useState(null)
  const [margin, setMargin] = useState(DEFAULT_MARGIN)

  async function load() {
    const [p, i, r] = await Promise.all([
      supabase.from('products').select('*').order('active', { ascending: false }).order('name'),
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('recipes').select('*').order('name'),
    ])
    if (showError(p.error || i.error || r.error)) return
    setData({ products: p.data, ingredients: i.data, recipes: r.data })
  }
  useEffect(() => {
    load()
    getSetting('margin_min', DEFAULT_MARGIN).then((v) => setMargin(Number(v)))
  }, [])

  const done = () => {
    setEditing(null)
    setEditRecipe(null)
    load()
  }

  if (!data) return <Loading />
  const { products, ingredients, recipes } = data
  const ingMap = toMap(ingredients)
  const recMap = toMap(recipes)

  return (
    <>
      <PageHeader title="Sản phẩm & công thức" subtitle="Giá vốn tự tính theo công thức mẻ và giá nguyên liệu bình quân">
        {tab === 'mon' ? (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={18} /> Thêm món
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setEditRecipe({})}>
            <Plus size={18} /> Công thức mẻ
          </button>
        )}
      </PageHeader>

      <div className="tabs">
        <button className={tab === 'mon' ? 'active' : ''} onClick={() => setTab('mon')}>
          Món bán ({products.length})
        </button>
        <button className={tab === 'me' ? 'active' : ''} onClick={() => setTab('me')}>
          Công thức mẻ ({recipes.length})
        </button>
      </div>

      {tab === 'mon' ? (
        <>
          <div className="toolbar">
            <label className="inline-field">
              Cảnh báo khi lãi dưới
              <input
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                onBlur={() => setSetting('margin_min', Number(margin) || 0)}
              />
              % giá bán
            </label>
          </div>
          {products.length === 0 ? (
            <Empty icon={CupSoda}>Chưa có món nào. Nên tạo “Công thức mẻ” trước, rồi bấm “Thêm món”.</Empty>
          ) : (
            <div className="card-grid">
              {products.map((p) => {
                const cost = productCost(p, ingMap, recMap)
                const profit = p.price - cost
                const pct = p.price > 0 ? (profit / p.price) * 100 : 0
                const low = pct < Number(margin)
                return (
                  <button key={p.id} className={`card product-card ${p.active ? '' : 'inactive'}`} onClick={() => setEditing(p)}>
                    <div className="product-card-head">
                      <strong>{p.name}</strong>
                      {!p.active ? <span className="badge">Đang ẩn</span> : low && <span className="badge badge-bad">Lãi mỏng</span>}
                    </div>
                    {recMap[p.recipe_id] && (
                      <span className="muted small">
                        {recMap[p.recipe_id].name} · {num(p.volume_ml)} ml
                      </span>
                    )}
                    <div className="kv">
                      <span>Giá bán</span>
                      <strong>{money(p.price)}</strong>
                    </div>
                    <div className="kv">
                      <span>Giá vốn</span>
                      <span>{money(cost)}</span>
                    </div>
                    <div className="kv">
                      <span>Lãi / phần</span>
                      <strong className={profit < 0 || low ? 'danger-text' : 'good-text'}>
                        {money(profit)} ({num(pct, 0)}%)
                      </strong>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : recipes.length === 0 ? (
        <Empty icon={FlaskConical}>
          Chưa có công thức. Ghi lại 1 mẻ nấu thực tế: bao nhiêu hạt, nước, đường… và ra được bao nhiêu ml.
        </Empty>
      ) : (
        <div className="card-grid">
          {recipes.map((r) => {
            const cost = batchCost(r, ingMap)
            const used = products.filter((p) => p.recipe_id === r.id)
            return (
              <button key={r.id} className="card product-card" onClick={() => setEditRecipe(r)}>
                <div className="product-card-head">
                  <strong>{r.name}</strong>
                </div>
                <div className="kv">
                  <span>Tiền nguyên liệu 1 mẻ</span>
                  <strong>{money(cost)}</strong>
                </div>
                <div className="kv">
                  <span>Mẻ ra được</span>
                  <span>{fmtQty(r.yield_ml, 'ml')}</span>
                </div>
                <div className="kv">
                  <span>Giá mỗi 100 ml</span>
                  <span>{r.yield_ml > 0 ? money((cost / r.yield_ml) * 100) : '—'}</span>
                </div>
                {used.length > 0 && <span className="muted small">Dùng cho: {used.map((p) => p.name).join(', ')}</span>}
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <ProductForm product={editing} ingredients={ingredients} recipes={recipes} margin={margin} onClose={() => setEditing(null)} onSaved={done} />
      )}
      {editRecipe && (
        <RecipeForm recipe={editRecipe} ingredients={ingredients} products={products} onClose={() => setEditRecipe(null)} onSaved={done} />
      )}
    </>
  )
}

// Danh sách dòng nguyên liệu + lượng (dùng cho công thức mẻ và nguyên liệu thêm mỗi phần)
function ItemRows({ rows, onChange, ingredients, placeholder = 'Lượng' }) {
  const ingMap = toMap(ingredients)
  const setRow = (i, k, v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  if (ingredients.length === 0) {
    return (
      <p className="field-hint">
        Chưa có nguyên liệu. Vào <Link to="/nguyen-lieu">Nguyên liệu & tồn kho</Link> để thêm trước.
      </p>
    )
  }
  return (
    <div className="recipe">
      {rows.map((r, i) => {
        const ing = ingMap[r.ingredient_id]
        return (
          <div key={i} className="recipe-row">
            <select value={r.ingredient_id} onChange={(e) => setRow(i, 'ingredient_id', e.target.value)}>
              <option value="">— Chọn nguyên liệu —</option>
              {ingredients.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="unit-input">
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                placeholder={placeholder}
                value={r.amount}
                onChange={(e) => setRow(i, 'amount', e.target.value)}
              />
              <span>{ing?.unit || ''}</span>
            </div>
            <span className="recipe-cost muted">{ing ? money(Number(r.amount || 0) * ing.price_per_unit) : ''}</span>
            <button type="button" className="icon-btn" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Xóa dòng">
              <Trash2 size={18} />
            </button>
          </div>
        )
      })}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, { ingredient_id: '', amount: '' }])}>
        <Plus size={16} /> Thêm nguyên liệu
      </button>
    </div>
  )
}

const cleanItems = (rows) =>
  rows
    .filter((r) => r.ingredient_id && Number(r.amount) > 0)
    .map((r) => ({ ingredient_id: Number(r.ingredient_id), amount: Number(r.amount) }))

function ProductForm({ product, ingredients, recipes, margin, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || '',
    price: product.price ?? '',
    recipe_id: product.id ? (product.recipe_id ?? '') : (recipes[0]?.id ?? ''),
    volume_ml: product.volume_ml || (product.id ? '' : 500),
    extra_cost: product.extra_cost ?? '',
    active: product.active ?? true,
    recipe: product.recipe?.length ? product.recipe : [{ ingredient_id: '', amount: '' }],
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const ingMap = toMap(ingredients)
  const recMap = toMap(recipes)

  const draft = {
    recipe_id: form.recipe_id ? Number(form.recipe_id) : null,
    volume_ml: Number(form.volume_ml || 0),
    extra_cost: Number(form.extra_cost || 0),
    recipe: cleanItems(form.recipe),
  }
  const batch = recMap[draft.recipe_id]
  const fromBatch = batch?.yield_ml > 0 ? (batchCost(batch, ingMap) / batch.yield_ml) * draft.volume_ml : 0
  const fromItems = productCost({ recipe: draft.recipe }, ingMap)
  const cost = fromBatch + fromItems + draft.extra_cost
  const profit = Number(form.price || 0) - cost
  const pct = Number(form.price) > 0 ? (profit / Number(form.price)) * 100 : 0

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const payload = { name: form.name.trim(), price: Number(form.price || 0), active: form.active, ...draft }
    const { error } = product.id
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  async function remove() {
    if (!confirm(`Xóa "${product.name}"? Lịch sử bán hàng vẫn được giữ lại.\nNếu chỉ tạm ngừng bán, bỏ chọn "Đang bán" sẽ tốt hơn.`)) return
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={product.id ? 'Sửa món' : 'Thêm món'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Tên món">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="VD: Sữa hạt điều 500ml" />
        </Field>
        <Field label="Giá bán">
          <MoneyInput value={form.price} onChange={(v) => set('price', v)} required />
        </Field>

        <div className="form-row">
          <Field label="Công thức mẻ">
            <select value={form.recipe_id} onChange={(e) => set('recipe_id', e.target.value)}>
              <option value="">— Không dùng —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dung tích mỗi phần" hint={batch?.yield_ml > 0 && draft.volume_ml > 0 ? `1 mẻ ≈ ${num(batch.yield_ml / draft.volume_ml, 1)} phần` : ''}>
            <div className="unit-input">
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={form.volume_ml}
                onChange={(e) => set('volume_ml', e.target.value)}
                disabled={!form.recipe_id}
              />
              <span>ml</span>
            </div>
          </Field>
        </div>
        {recipes.length === 0 && (
          <p className="field-hint">Chưa có công thức mẻ. Tạo ở tab “Công thức mẻ”, hoặc ghi nguyên liệu cho 1 phần ở dưới.</p>
        )}

        <div className="field">
          <span className="field-label">Nguyên liệu thêm cho mỗi phần</span>
          <span className="field-hint">Chai, nắp, ống hút, topping… (hoặc cả công thức 1 phần nếu không dùng mẻ)</span>
          <ItemRows rows={form.recipe} onChange={(v) => set('recipe', v)} ingredients={ingredients} />
        </div>

        <Field label="Chi phí phụ khác / phần" hint="Những thứ không theo dõi tồn kho: tem, túi…">
          <MoneyInput value={form.extra_cost} onChange={(v) => set('extra_cost', v)} />
        </Field>

        <div className="summary-box">
          {fromBatch > 0 && (
            <div className="kv">
              <span>Phần từ mẻ nấu</span>
              <span>{money(fromBatch)}</span>
            </div>
          )}
          {fromItems > 0 && (
            <div className="kv">
              <span>Nguyên liệu thêm</span>
              <span>{money(fromItems)}</span>
            </div>
          )}
          <div className="kv">
            <span>Giá vốn / phần</span>
            <strong>{money(cost)}</strong>
          </div>
          <div className="kv">
            <span>Lãi / phần</span>
            <strong className={profit < 0 || pct < margin ? 'danger-text' : 'good-text'}>
              {money(profit)} ({num(pct, 0)}%)
            </strong>
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          Đang bán (bỏ chọn để ẩn khỏi trang Bán hàng)
        </label>

        <div className="form-actions">
          {product.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              Xóa
            </button>
          )}
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

function RecipeForm({ recipe, ingredients, products, onClose, onSaved }) {
  // "Mẻ ra được" nhập theo lít, ml hoặc số chai của các size đang bán
  const sizes = [...new Set(products.map((p) => Number(p.volume_ml)).filter((v) => v > 0))].sort((a, b) => b - a)
  const yieldUnits = [['lít', 1000], ['ml', 1], ...sizes.map((v) => [`chai ${num(v)}ml`, v])]
  const [form, setForm] = useState({
    name: recipe.name || '',
    items: recipe.items?.length ? recipe.items : [{ ingredient_id: '', amount: '' }],
    yield_value: recipe.yield_ml ? +(recipe.yield_ml / 1000).toFixed(3) : '',
    yield_unit: 'lít',
    note: recipe.note || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const ingMap = toMap(ingredients)

  const factor = yieldUnits.find(([u]) => u === form.yield_unit)?.[1] || 1
  const yieldMl = Number(form.yield_value || 0) * factor
  const items = cleanItems(form.items)
  const cost = batchCost({ items }, ingMap)
  const used = products.filter((p) => p.recipe_id === recipe.id)

  async function submit(e) {
    e.preventDefault()
    if (!(yieldMl > 0)) return alert('Nhập mẻ ra được bao nhiêu')
    setBusy(true)
    const payload = { name: form.name.trim(), items, yield_ml: yieldMl, note: form.note.trim() || null }
    const { error } = recipe.id
      ? await supabase.from('recipes').update(payload).eq('id', recipe.id)
      : await supabase.from('recipes').insert(payload)
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  async function remove() {
    if (!confirm(`Xóa công thức "${recipe.name}"?${used.length ? `\n${used.length} món đang dùng sẽ không còn tính phần giá vốn từ mẻ.` : ''}`)) return
    const { error } = await supabase.from('recipes').delete().eq('id', recipe.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={recipe.id ? 'Sửa công thức mẻ' : 'Công thức mẻ mới'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Tên công thức">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="VD: Sữa hạt điều" />
        </Field>
        <div className="field">
          <span className="field-label">Nguyên liệu cho 1 mẻ</span>
          <span className="field-hint">Ghi đúng lượng của 1 lần nấu thực tế. VD: 1000 g hạt điều, 9000 ml nước, 300 g đường</span>
          <ItemRows rows={form.items} onChange={(v) => set('items', v)} ingredients={ingredients} />
        </div>
        <Field label="Mẻ ra được" hint="Lượng thành phẩm thực tế sau khi lọc bã. Mẻ nào ra ít hơn thì sửa lại số này.">
          <div className="qty-input">
            <input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={form.yield_value}
              onChange={(e) => set('yield_value', e.target.value)}
              required
            />
            <select
              value={form.yield_unit}
              onChange={(e) => {
                const nf = yieldUnits.find(([u]) => u === e.target.value)[1]
                setForm((f) => ({ ...f, yield_unit: e.target.value, yield_value: yieldMl ? +(yieldMl / nf).toFixed(3) : f.yield_value }))
              }}
              aria-label="Đơn vị"
            >
              {yieldUnits.map(([u]) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Ngâm hạt 6 tiếng, xay 2 lần…" />
        </Field>

        <div className="summary-box">
          <div className="kv">
            <span>Tiền nguyên liệu 1 mẻ</span>
            <strong>{money(cost)}</strong>
          </div>
          {yieldMl > 0 && (
            <>
              <div className="kv">
                <span>Giá mỗi 100 ml</span>
                <span>{money((cost / yieldMl) * 100)}</span>
              </div>
              {sizes.map((v) => (
                <div key={v} className="kv">
                  <span>
                    Chai {num(v)}ml: ≈ {num(yieldMl / v, 1)} chai
                  </span>
                  <span>{money((cost / yieldMl) * v)}/chai</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="form-actions">
          {recipe.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              Xóa
            </button>
          )}
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
