import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CupSoda, Plus, Trash2 } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { money, num } from '../lib/format'
import { productCost, toMap } from '../lib/cost'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader } from '../components/ui'

export default function Products() {
  const [products, setProducts] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [editing, setEditing] = useState(null)

  async function load() {
    const [p, i] = await Promise.all([
      supabase.from('products').select('*').order('active', { ascending: false }).order('name'),
      supabase.from('ingredients').select('*').order('name'),
    ])
    if (showError(p.error || i.error)) return
    setProducts(p.data)
    setIngredients(i.data)
  }
  useEffect(() => {
    load()
  }, [])

  if (!products) return <Loading />
  const ingMap = toMap(ingredients)

  return (
    <>
      <PageHeader title="Sản phẩm" subtitle="Giá vốn tự tính theo công thức và giá nguyên liệu mới nhất">
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Plus size={18} /> Thêm món
        </button>
      </PageHeader>

      {products.length === 0 ? (
        <Empty icon={CupSoda}>Chưa có món nào. Bấm “Thêm món” để bắt đầu.</Empty>
      ) : (
        <div className="card-grid">
          {products.map((p) => {
            const cost = productCost(p, ingMap)
            const profit = p.price - cost
            const pct = p.price > 0 ? (profit / p.price) * 100 : 0
            return (
              <button key={p.id} className={`card product-card ${p.active ? '' : 'inactive'}`} onClick={() => setEditing(p)}>
                <div className="product-card-head">
                  <strong>{p.name}</strong>
                  {!p.active && <span className="badge">Đang ẩn</span>}
                </div>
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
                  <strong className={profit >= 0 ? 'good-text' : 'danger-text'}>
                    {money(profit)} ({num(pct, 0)}%)
                  </strong>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <ProductForm
          product={editing}
          ingredients={ingredients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </>
  )
}

function ProductForm({ product, ingredients, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || '',
    price: product.price ?? '',
    extra_cost: product.extra_cost ?? '',
    active: product.active ?? true,
    recipe: product.recipe?.length ? product.recipe : [{ ingredient_id: '', amount: '' }],
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const ingMap = toMap(ingredients)

  const setRow = (i, k, v) => set('recipe', form.recipe.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  const cleanRecipe = form.recipe
    .filter((r) => r.ingredient_id && Number(r.amount) > 0)
    .map((r) => ({ ingredient_id: Number(r.ingredient_id), amount: Number(r.amount) }))
  const cost = productCost({ extra_cost: form.extra_cost, recipe: cleanRecipe }, ingMap)
  const profit = Number(form.price || 0) - cost

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      price: Number(form.price || 0),
      extra_cost: Number(form.extra_cost || 0),
      active: form.active,
      recipe: cleanRecipe,
    }
    const { error } = product.id
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  async function remove() {
    if (!confirm(`Xóa "${product.name}"? Lịch sử bán hàng vẫn được giữ lại.`)) return
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={product.id ? 'Sửa món' : 'Thêm món'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Tên món">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="VD: Sữa hạt điều 500ml" />
        </Field>
        <div className="form-row">
          <Field label="Giá bán">
            <MoneyInput value={form.price} onChange={(v) => set('price', v)} required />
          </Field>
          <Field label="Chi phí phụ / phần" hint="Ly, nắp, ống hút, tem, túi…">
            <MoneyInput value={form.extra_cost} onChange={(v) => set('extra_cost', v)} />
          </Field>
        </div>

        <div className="field">
          <span className="field-label">Công thức cho 1 phần</span>
          {ingredients.length === 0 ? (
            <p className="field-hint">
              Chưa có nguyên liệu. Vào <Link to="/nhap-hang">Nhập hàng → Nguyên liệu</Link> để thêm trước.
            </p>
          ) : (
            <div className="recipe">
              {form.recipe.map((r, i) => {
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
                        placeholder="Lượng"
                        value={r.amount}
                        onChange={(e) => setRow(i, 'amount', e.target.value)}
                      />
                      <span>{ing?.unit || ''}</span>
                    </div>
                    <span className="recipe-cost muted">
                      {ing ? money(Number(r.amount || 0) * ing.price_per_unit) : ''}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => set('recipe', form.recipe.filter((_, idx) => idx !== i))}
                      aria-label="Xóa dòng"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )
              })}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => set('recipe', [...form.recipe, { ingredient_id: '', amount: '' }])}
              >
                <Plus size={16} /> Thêm nguyên liệu
              </button>
            </div>
          )}
        </div>

        <div className="summary-box">
          <div className="kv">
            <span>Giá vốn / phần</span>
            <strong>{money(cost)}</strong>
          </div>
          <div className="kv">
            <span>Lãi / phần</span>
            <strong className={profit >= 0 ? 'good-text' : 'danger-text'}>{money(profit)}</strong>
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
