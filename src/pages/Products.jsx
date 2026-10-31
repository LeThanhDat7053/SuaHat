import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, CupSoda, FlaskConical, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { getSetting, setSetting, showError, supabase } from '../lib/supabase'
import { BIG_UNIT, fmtQty, money, num } from '../lib/format'
import { DEFAULT_MARGIN, batchCost, suggestPrice, productCost, productSources, productUsage, toMap, unitCost } from '../lib/cost'
import { CHAI_DEFAULTS, getChaiDefaults } from '../lib/quick'
import { loadCatalog, peekCatalog } from '../lib/catalog'
import { peek } from '../lib/cache'
import { FEATURED_KEY, loadFeatured } from '../lib/featured'
import { useLive } from '../lib/live'
import { plain } from '../lib/categories'
import { altOf, altText, costModeOf, itemUnit, recipeUnits, showsAlt } from '../lib/units'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader, SaveButton } from '../components/ui'

export { DEFAULT_MARGIN }

// món đang bán lên trước, rồi theo tên
const sortProducts = (c) => ({ ...c, products: [...c.products].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, 'vi')) })

export default function Products() {
  const [tab, setTab] = useState('mon')
  const [data, setData] = useState(() => {
    const c = peekCatalog()
    return c ? sortProducts(c) : null
  })
  const [editing, setEditing] = useState(null)
  const [editRecipe, setEditRecipe] = useState(null)
  const [margin, setMargin] = useState(DEFAULT_MARGIN)
  const [featured, setFeatured] = useState(() => peek(FEATURED_KEY) || []) // "Món hôm nay" chọn ở trang Bán hàng
  const [query, setQuery] = useState('')
  // Lọc theo % lãi: 'all' | 'gte' (từ X% trở lên) | 'lte' (từ X% trở xuống)
  const [pctMode, setPctMode] = useState('all')
  const [pctAt, setPctAt] = useState(80)

  function load() {
    loadCatalog(0).then((c) => setData(sortProducts(c)), showError)
    loadFeatured().then((v) => setFeatured(Array.isArray(v) ? v : []), showError)
  }
  useEffect(() => {
    load()
    getSetting('margin_min', DEFAULT_MARGIN).then((v) => setMargin(Number(v)))
  }, [])

  useLive(['products', 'ingredients', 'recipes', 'settings'], load)

  const done = () => {
    setEditing(null)
    setEditRecipe(null)
    load()
  }

  if (!data) return <Loading />
  const { products, ingredients, recipes } = data
  const ingMap = toMap(ingredients)
  const recMap = toMap(recipes) 
  // Món hôm nay (tô vàng + sao) lên đầu, giống trang Bán hàng; mẻ dùng cho món hôm nay cũng vậy
  const star = new Set(featured)
  const hotRecipe = new Set(products.filter((p) => star.has(p.id)).map((p) => p.recipe_id))
  // Tìm không dấu theo tên món, tên công thức mẻ, tên nguyên liệu ("hat dieu" khớp "Hạt điều")
  const q = plain(query.trim())
  const hit = (...names) => !q || names.some((n) => plain(n).includes(q)) 
  const ingNames = (list) => (Array.isArray(list) ? list : []).map((r) => ingMap[r.ingredient_id]?.name)
  const pctOf = (p) => (p.price > 0 ? ((p.price - productCost(p, ingMap, recMap)) / p.price) * 100 : 0)
  const pctMap = Object.fromEntries(products.map((p) => [p.id, pctOf(p)]))
  const at = Number(pctAt) || 0
  const inRange = (p) => pctMode === 'all' || (pctMode === 'gte' ? pctMap[p.id] >= at : pctMap[p.id] <= at)
  const productList = [...products]
    .filter((p) => hit(p.name, recMap[p.recipe_id]?.name, ...Object.keys(productUsage(p, recMap)).map((id) => ingMap[id]?.name)))
    .filter(inRange)
    // đang lọc theo % lãi → xếp theo % lãi (lọc "trở lên": cao nhất trước; "trở xuống": thấp nhất trước)
    .sort((a, b) =>
      pctMode === 'all' ? star.has(b.id) - star.has(a.id) : pctMode === 'gte' ? pctMap[b.id] - pctMap[a.id] : pctMap[a.id] - pctMap[b.id],
    )
  const recipeList = [...recipes]
    .filter((r) => hit(r.name, ...ingNames(r.items), ...products.filter((p) => p.recipe_id === r.id).map((p) => p.name)))
    .sort((a, b) => hotRecipe.has(b.id) - hotRecipe.has(a.id))
  const searchBox = (
    <label className="search-box list-search">
      <Search size={17} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === 'mon' ? 'Tìm món, công thức, nguyên liệu…' : 'Tìm công thức mẻ, nguyên liệu, món…'}
        aria-label="Tìm kiếm"
      />
      {query && (
        <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">
          <X size={16} />
        </button>
      )}
    </label>
  )
  const noHit = <p className="muted" style={{ padding: '12px 4px' }}>Không tìm thấy “{query.trim()}”.</p>
  const Hot = () => <Star size={15} className="inline-icon featured-star" aria-label="Món hôm nay" />

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
          {products.length > 0 && searchBox}
          {products.length > 0 && (
            <div className="pct-filter">
              <span className="muted small">Lọc theo lãi</span>
              <div className="seg" role="group" aria-label="Lọc theo % lãi">
                <button type="button" className={pctMode === 'all' ? 'active' : ''} onClick={() => setPctMode('all')}>
                  Tất cả
                </button>
                <button type="button" className={pctMode === 'gte' ? 'active' : ''} onClick={() => setPctMode('gte')}>
                  Từ … trở lên
                </button>
                <button type="button" className={pctMode === 'lte' ? 'active' : ''} onClick={() => setPctMode('lte')}>
                  Từ … trở xuống
                </button>
              </div>
              {pctMode !== 'all' && (
                <label className="inline-field">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    inputMode="numeric"
                    value={pctAt}
                    onChange={(e) => setPctAt(e.target.value)}
                    aria-label="Mức % lãi"
                  />
                  % → <strong>{productList.length} món</strong>
                </label>
              )}
            </div>
          )}
          {products.length === 0 ? (
            <Empty icon={CupSoda}>Chưa có món nào. Nên tạo “Công thức mẻ” trước, rồi bấm “Thêm món”.</Empty>
          ) : productList.length === 0 ? (
            query.trim() ? noHit : <p className="muted" style={{ padding: '12px 4px' }}>Không có món nào trong khoảng lãi này.</p>
          ) : (
            <div className="card-grid">
              {productList.map((p) => {
                const cost = productCost(p, ingMap, recMap)
                const profit = p.price - cost
                const pct = pctMap[p.id]
                const low = pct < Number(margin)
                const better = low && p.active ? suggestPrice(cost, margin) : null
                const src = productSources(p, ingMap, recMap)
                return (
                  <button key={p.id} className={`card product-card ${p.active ? '' : 'inactive'} ${star.has(p.id) ? 'hot' : ''}`} onClick={() => setEditing(p)}>
                    <div className="product-card-head">
                      <strong>
                        {star.has(p.id) && <Hot />}
                        {p.name}
                      </strong>
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
                    <SourceLines src={src} />
                    <div className="kv kv-profit">
                      <span>Lãi / phần</span>
                      <strong className={profit < 0 || low ? 'danger-text' : 'good-text'}>
                        {money(profit)} ({num(pct, 0)}%)
                      </strong>
                    </div>
                    {better && (
                      <span className="price-hint">
                        Nên bán ≥ <strong>{money(better)}</strong> để lãi {num(margin, 0)}%
                      </span>
                    )}
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
        <>
        {searchBox}
        {recipeList.length === 0 && noHit}
        <div className="card-grid">
          {recipeList.map((r) => {
            const cost = batchCost(r, ingMap)
            const used = products.filter((p) => p.recipe_id === r.id)
            return (
              <button key={r.id} className={`card product-card ${hotRecipe.has(r.id) ? 'hot' : ''}`} onClick={() => setEditRecipe(r)}>
                <div className="product-card-head">
                  <strong>
                    {hotRecipe.has(r.id) && <Hot />}
                    {r.name}
                  </strong>
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
                {used.length > 0 && (
                  <span className="muted small">Dùng cho: {used.map((p) => (star.has(p.id) ? `★ ${p.name}` : p.name)).join(', ')}</span>
                )}
              </button>
            )
          })}
        </div>
        </>
      )}

      {editing && (
        <ProductForm product={editing} ingredients={ingredients} recipes={recipes} margin={margin} onClose={() => setEditing(null)} onSaved={done} />
      )}
      {editRecipe && (
        <RecipeForm
          key={editRecipe.id ?? `new-${editRecipe.name || ''}`}
          recipe={editRecipe}
          ingredients={ingredients}
          products={products}
          onClose={() => setEditRecipe(null)}
          onSaved={done}
          onDuplicate={(copy) => setEditRecipe(copy)}
        />
      )}
    </>
  )
}

// Nguyên liệu không nằm trong giá vốn mỗi ly: "Tính lúc mua" (đã trừ lãi ngày mua) và "Nhà có"
function SourceLines({ src }) {
  if (!src.buy.names.length && !src.free.names.length) return null
  return (
    <div className="src-lines">
      {src.buy.names.length > 0 && (
        <div className="src-line" title="Tiền đã trừ vào lãi ngày mua, không cộng vào giá vốn">
          <span className="badge badge-warn">Tính lúc mua</span>
          <span className="clamp">{src.buy.names.join(', ')}</span>
          {src.buy.value > 0 && <span className="src-val">≈ {money(src.buy.value)}</span>}
        </div>
      )}
      {src.free.names.length > 0 && (
        <div className="src-line" title="Nhà có, không tính tiền">
          <span className="badge badge-good">Nhà có</span>
          <span className="clamp">{src.free.names.join(', ')}</span>
          <span className="src-val">0đ</span>
        </div>
      )}
    </div>
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
            <span className="recipe-cost muted">{ing ? (ing.no_stock ? 'nhà có' : ing.cost_on_buy ? 'lúc mua' : money(Number(r.amount || 0) * unitCost(ing))) : ''}</span>
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
    .map((r) => ({ ingredient_id: Number(r.ingredient_id), amount: Number(r.amount), ...(r.unit ? { unit: r.unit } : {}) }))

// Size hay bán, bấm là điền dung tích; size khác vẫn gõ tay được
const SIZES = [250, 270, 300, 350, 500, 600]

// Lượng từng nguyên liệu lấy từ mẻ cho 1 phần, tự tính lại khi đổi dung tích (250 → 300 ml…)
function PortionList({ batch, volume, ingMap }) {
  const rows = (batch.items || []).filter((r) => Number(r.amount) > 0)
  if (rows.length === 0) return null
  const k = volume / batch.yield_ml
  return (
    <div className="portion-box">
      <div className="portion-head">
        Lượng cho 1 phần <b>{num(volume)} ml</b>
        <span className="muted small"> · 1 mẻ {num(batch.yield_ml)} ml ≈ {num(batch.yield_ml / volume, 1)} phần</span>
      </div>
      {rows.map((r, i) => {
        const g = ingMap[r.ingredient_id]
        const amount = Number(r.amount) * k
        const alt = showsAlt(r, g) && altText(amount, g)
        return (
          <div key={i} className="kv">
            <span>{g?.name || '(nguyên liệu đã xóa)'}</span>
            <span className="num">
              {alt ? `${alt} (${num(amount, 1)} ${g.unit})` : `${num(amount, 1)} ${g?.unit || ''}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ProductForm({ product, ingredients, recipes, margin, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || '',
    price: product.price ?? '',
    recipe_id: product.id ? (product.recipe_id ?? '') : (recipes[0]?.id ?? ''),
    volume_ml: product.volume_ml || (product.id ? '' : 500),
    extra_cost: product.extra_cost ?? '',
    active: product.active ?? true,
    chai_surcharge: product.chai_surcharge ?? '',
    chai_cost: product.chai_cost ?? '',
    recipe: product.recipe?.length ? product.recipe : [{ ingredient_id: '', amount: '' }],
  })
  const [busy, setBusy] = useState(false)
  const [chaiDef, setChaiDef] = useState(CHAI_DEFAULTS)
  useEffect(() => {
    getChaiDefaults().then(setChaiDef)
  }, [])
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
    // chỉ gửi cột Chai khi đã có (đã chạy nang-cap-v3.sql) hoặc có gõ giá trị
    for (const k of ['chai_surcharge', 'chai_cost']) if (k in product || form[k] !== '') payload[k] = form[k] === '' ? null : Number(form[k])
    const { error } = product.id
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)
    setBusy(false)
    if (!showError(error)) onSaved()
  }

  async function remove() {
    // Món đã bán / hủy: xóa đi thì các dòng đó mất món → kho không trừ được nữa, báo cáo lệch → chỉ cho ẩn
    const used = await Promise.all(
      ['sales', 'waste'].map((t) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('product_id', product.id)),
    )
    const err = used.find((r) => r.error)?.error
    if (showError(err)) return
    const n = used.reduce((s, r) => s + (r.count || 0), 0)
    if (n > 0) {
      if (!confirm(`"${product.name}" đã có ${n} dòng bán / hủy, xóa đi thì kho và báo cáo sẽ tính sai.\nẨn món này (thôi bán, giữ lịch sử) thay vì xóa?`)) return
      const { error } = await supabase.from('products').update({ active: false }).eq('id', product.id)
      if (!showError(error)) onSaved()
      return
    }
    if (!confirm(`Xóa "${product.name}"? Món này chưa bán lần nào.`)) return
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
        {batch && (
          <div className="chips size-chips" role="group" aria-label="Chọn nhanh dung tích">
            {SIZES.map((v) => (
              <button key={v} type="button" className={`chip ${draft.volume_ml === v ? 'active' : ''}`} onClick={() => set('volume_ml', v)}>
                {v} ml
              </button>
            ))}
          </div>
        )}
        {batch?.yield_ml > 0 && draft.volume_ml > 0 && <PortionList batch={batch} volume={draft.volume_ml} ingMap={ingMap} />}
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

        <div className="form-row">
          <Field label="Bán Chai đắt hơn Ly" hint={`Để trống = mức chung ${money(chaiDef.surcharge)}`}>
            <MoneyInput value={form.chai_surcharge} onChange={(v) => set('chai_surcharge', v)} placeholder={num(chaiDef.surcharge)} />
          </Field>
          <Field label="Vốn thêm khi bán Chai" hint={`Vỏ chai, nắp… Để trống = mức chung ${money(chaiDef.cost)}`}>
            <MoneyInput value={form.chai_cost} onChange={(v) => set('chai_cost', v)} placeholder={num(chaiDef.cost)} />
          </Field>
        </div>

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
            <span>Giá vốn / phần (Ly)</span>
            <strong>{money(cost)}</strong>
          </div>
          <SourceLines src={productSources(draft, ingMap, recMap)} />
          <div className="kv">
            <span>Lãi / phần</span>
            <strong className={profit < 0 || pct < margin ? 'danger-text' : 'good-text'}>
              {money(profit)} ({num(pct, 0)}%)
            </strong>
          </div>
          {pct < margin && suggestPrice(cost, margin) > Number(form.price || 0) && (
            <div className="price-hint price-hint-row">
              <span>
                Nên bán ≥ <strong>{money(suggestPrice(cost, margin))}</strong> để lãi {num(margin, 0)}%
              </span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('price', suggestPrice(cost, margin))}>
                Dùng giá này
              </button>
            </div>
          )}
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
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}

// Bảng nhập nhanh: mọi nguyên liệu hiện sẵn, gõ lượng vào món nào dùng, món không dùng để trống.
// Hạt / sữa gõ được theo kg / lít. Giá trị: { [ingredient_id]: { value, unit } }
// Nguyên liệu có quy đổi (trà: 44 g = 380 ml) thì mặc định gõ theo đơn vị quy đổi (ml), lưu theo đơn vị gốc (g).
// Còn lại mặc định g / ml cho dễ cân đong, vẫn đổi sang kg / lít được.
const factorOf = (g, unit) => recipeUnits(g).find((u) => u.unit === unit)?.factor || 1

function toGrid(items, ingMap) {
  const grid = {}
  items.forEach((r) => {
    const g = ingMap[r.ingredient_id]
    if (!g) return
    const unit = itemUnit(r, g)
    grid[g.id] = { value: +(Number(r.amount) / factorOf(g, unit)).toFixed(2), unit }
  })
  return grid
}

// Nguyên liệu có quy đổi thì nhớ đơn vị đã gõ của mẻ này (sữa bắp theo trái, mẻ khác theo g)
function fromGrid(grid, ingredients) {
  return ingredients
    .filter((g) => Number(grid[g.id]?.value) > 0)
    .map((g) => {
      const { value, unit } = grid[g.id]
      const amount = +(Number(value) * factorOf(g, unit)).toFixed(6)
      return altOf(g) ? { ingredient_id: g.id, amount, unit: unit === altOf(g).unit ? unit : g.unit } : { ingredient_id: g.id, amount }
    })
}

function IngredientGrid({ grid, onChange, ingredients, firstIds }) {
  const ingMap = toMap(ingredients)
  const [query, setQuery] = useState('')
  // món đang dùng lên đầu, rồi hạt / sữa (g, ml), cuối cùng chai / hộp…
  const rank = (g) => (firstIds.has(g.id) ? 0 : BIG_UNIT[g.unit] ? 1 : 2)
  const q = plain(query.trim())
  const list = [...ingredients].filter((g) => !q || plain(g.name).includes(q)).sort((a, b) => rank(a) - rank(b))
  const set = (id, patch) => {
    const g = ingMap[id]
    const cur = grid[id] || { value: '', unit: recipeUnits(g)[0].unit }
    onChange({ ...grid, [id]: { ...cur, ...patch } })
  }
  if (ingredients.length === 0) {
    return (
      <p className="field-hint">
        Chưa có nguyên liệu. Vào <Link to="/nguyen-lieu">Nguyên liệu & tồn kho</Link> để thêm trước.
      </p>
    )
  }
  return (
    <>
    {ingredients.length > 6 && (
      <div className="search-box">
        <Search size={17} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm nguyên liệu…"
          aria-label="Tìm nguyên liệu"
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} // Enter không lưu form
        />
        {query && (
          <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">
            <X size={16} />
          </button>
        )}
      </div>
    )}
    <div className="count-list">
      {list.length === 0 && <p className="muted small" style={{ padding: '10px 12px' }}>Không có nguyên liệu “{query.trim()}”.</p>}
      {list.map((g) => {
        const units = recipeUnits(g)
        const cell = grid[g.id] || { value: '', unit: units[0].unit }
        const base = Number(cell.value || 0) * factorOf(g, cell.unit)
        const mode = costModeOf(g)
        return (
          <div key={g.id} className={`count-row ${base > 0 ? 'is-used' : ''}`}>
            <div className="grow">
              <div>{g.name}</div>
              {base > 0 && (
                <div className="muted small">
                  {cell.unit !== g.unit && `= ${fmtQty(base, g.unit)} · `}
                  {mode === 'free' ? 'Nhà có · 0đ' : mode === 'buy' ? 'Tính lúc mua' : money(base * unitCost(g))}
                </div>
              )}
            </div>
            <div className="qty-input grid-qty">
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={cell.value}
                onChange={(e) => set(g.id, { value: e.target.value })}
                aria-label={`Lượng ${g.name}`}
              />
              {units.length > 1 ? (
                <select value={cell.unit} onChange={(e) => set(g.id, { unit: e.target.value })} aria-label="Đơn vị">
                  {units.map((u) => (
                    <option key={u.unit}>{u.unit}</option>
                  ))}
                </select>
              ) : (
                <span className="muted grid-unit">{g.unit}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}

function RecipeForm({ recipe, ingredients, products, onClose, onSaved, onDuplicate }) {
  // "Mẻ ra được" nhập theo lít, ml hoặc số chai của các size đang bán
  const sizes = [...new Set(products.map((p) => Number(p.volume_ml)).filter((v) => v > 0))].sort((a, b) => b - a)
  const yieldUnits = [['ml', 1], ['lít', 1000], ...sizes.map((v) => [`chai ${num(v)}ml`, v])]
  const [form, setForm] = useState({
    name: recipe.name || '',
    grid: toGrid(recipe.items || [], toMap(ingredients)),
    yield_value: recipe.yield_ml ? +Number(recipe.yield_ml).toFixed(1) : '',
    yield_unit: 'ml',
    note: recipe.note || '',
  })
  const [busy, setBusy] = useState(false)
  const [firstIds] = useState(() => new Set((recipe.items || []).map((r) => Number(r.ingredient_id))))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const ingMap = toMap(ingredients)

  const factor = yieldUnits.find(([u]) => u === form.yield_unit)?.[1] || 1
  const yieldMl = Number(form.yield_value || 0) * factor
  const items = fromGrid(form.grid, ingredients)
  const cost = batchCost({ items }, ingMap)
  const used = products.filter((p) => p.recipe_id === recipe.id)

  async function submit(e) {
    e.preventDefault()
    if (items.length === 0) return alert('Nhập lượng cho ít nhất 1 nguyên liệu')
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
    // Món đang gắn công thức này (kể cả món đã ẩn): xóa thì các ly đã bán không trừ kho được nữa
    if (used.length) {
      return alert(
        `Công thức "${recipe.name}" đang dùng cho: ${used.map((p) => p.name).join(', ')}.\nĐổi các món này sang công thức khác trước (Sản phẩm → sửa món), rồi mới xóa được.`,
      )
    }
    if (!confirm(`Xóa công thức "${recipe.name}"?`)) return
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
          <span className="field-hint">Gõ lượng của 1 lần nấu thực tế vào nguyên liệu có dùng, không dùng thì để trống. VD: 1000 g hạt điều, 9000 ml nước, 300 g đường</span>
          <IngredientGrid grid={form.grid} onChange={(v) => set('grid', v)} ingredients={ingredients} firstIds={firstIds} />
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
            <>
              <button type="button" className="btn btn-danger-ghost" onClick={remove}>
                Xóa
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onDuplicate({ name: `${form.name} (bản sao)`, items, yield_ml: yieldMl, note: form.note })}
                title="Tạo công thức mới giống công thức này"
              >
                <Copy size={16} /> Nhân bản
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}
