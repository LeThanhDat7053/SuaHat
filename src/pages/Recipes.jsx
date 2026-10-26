import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Minus, Plus, Search, Star, X } from 'lucide-react'
import { showError } from '../lib/supabase'
import { num } from '../lib/format'
import { toMap } from '../lib/cost'
import { peek } from '../lib/cache'
import { loadCatalog, peekCatalog } from '../lib/catalog'
import { FEATURED_KEY, loadFeatured } from '../lib/featured'
import { plain } from '../lib/categories'
import { useLive } from '../lib/live'
import { useBarista } from '../lib/barista'
import { altOf, altText } from '../lib/units'
import { Empty, Loading, PageHeader } from '../components/ui'

// Luôn ghi g / ml (không đổi sang kg / lít) cho khớp với cân, ca đong
const qty = (q, unit) => `${num(q, 1)} ${unit}`

// Chia mẻ: ÷2 = nấu nửa mẻ → mọi nguyên liệu tự giảm một nửa, khỏi tính nhẩm
// Hoặc "Theo ly": pha đúng N ly × bao nhiêu ml (250, 270, 300, 350… hay gõ tay) → lượng từng nguyên liệu tính theo ml.
// Lưu mỗi công thức: số (÷2) hoặc { n, ml }
const DIVS = [1, 2, 3, 4, 5]
const SIZES = [250, 270, 300, 350, 500, 600]
const isCup = (v) => v != null && typeof v === 'object'
// Hệ số nhân lượng của mẻ gốc
const scaleOf = (v, yieldMl) => (isCup(v) ? (yieldMl > 0 ? (v.n * Number(v.ml || 0)) / yieldMl : 1) : 1 / (Number(v) || 1))
const DIV_KEY = 'recipe-view' // đổi tên từ 'recipe-div' để mọi công thức về mặc định "Ly"
function readDivs() {
  try {
    return JSON.parse(localStorage.getItem(DIV_KEY)) || {}
  } catch {
    return {}
  }
}

// Chữ gõ từ máy khác có thể bị tách dấu ("tô ́ c độ") → ghép lại cho đúng
const nfc = (t) => String(t || '').normalize('NFC')

const items = (list) => (Array.isArray(list) ? list : []).filter((r) => Number(r.amount) > 0)

// Dữ liệu công thức dùng chung cho trang Công thức và màn hình chia đôi (Pha chế)
export function useRecipes() {
  const [data, setData] = useState(peekCatalog)
  const [featured, setFeatured] = useState(() => peek(FEATURED_KEY) || [])
  const [divs, setDivs] = useState(readDivs)

  function load() {
    loadCatalog(0).then(setData, showError)
    loadFeatured().then((v) => setFeatured(Array.isArray(v) ? v : []), showError)
  }
  useEffect(load, [])
  useLive(['products', 'ingredients', 'recipes', 'settings'], load)

  function setDiv(id, d) {
    const next = { ...divs, [id]: d }
    setDivs(next)
    try {
      localStorage.setItem(DIV_KEY, JSON.stringify(next))
    } catch {
      /* bỏ qua */
    }
  }

  if (!data) return null
  const ingMap = toMap(data.ingredients)
  const products = data.products.filter((p) => p.active)
  const star = new Set(featured)

  // Công thức mẻ + món pha từng phần (không dùng mẻ nhưng có ghi nguyên liệu).
  // Món đánh sao (Món hôm nay) lên đầu, rồi theo tên.
  const cards = [
    ...data.recipes.map((r) => {
      const used = products.filter((p) => p.recipe_id === r.id)
      return { key: `r${r.id}`, name: nfc(r.name), names: [r.name, ...used.map((p) => p.name)], recipe: r, used, hot: used.some((p) => star.has(p.id)) }
    }),
    ...products
      .filter((p) => !data.recipes.some((r) => r.id === p.recipe_id) && items(p.recipe).length > 0)
      .map((p) => ({ key: `p${p.id}`, name: p.name, names: [p.name], product: p, hot: star.has(p.id) })),
  ].sort((a, b) => b.hot - a.hot || a.name.localeCompare(b.name, 'vi'))

  return { cards, ingMap, star, featured, divs, setDiv }
}

export const matchCard = (c, query) => {
  const q = plain(query.trim())
  return !q || c.names.some((n) => plain(n).includes(q))
}

function Row({ r, g, k = 1 }) {
  const amount = Number(r.amount) * k
  return (
    <div className="rx-row">
      <span className="rx-ing">{g ? nfc(g.name) : '(nguyên liệu đã xóa)'}</span>
      {altOf(g) ? (
        // có quy đổi (trà 44 g = 380 ml): hiện ml cho dễ đong, kèm số g để cân
        <span className="rx-amt">
          {altText(amount, g)} <span className="rx-alt">({qty(amount, g.unit)})</span>
        </span>
      ) : (
        <span className="rx-amt">{qty(amount, g?.unit || '')}</span>
      )}
    </div>
  )
}

// Thẻ 1 công thức. noteOpen: mở sẵn phần cách làm (màn hình chia đôi, đỡ phải bấm)
export function RecipeCard({ card, rx, noteOpen = false, className = '' }) {
  const { recipe: r, used, product: p, hot } = card
  const { ingMap, star, divs, setDiv } = rx
  const title = (
    <h2>
      {hot && <Star size={16} className="inline-icon featured-star" aria-label="Món hôm nay" />}
      {card.name}
    </h2>
  )
  if (p)
    return (
      <article className={`card rx-card ${hot ? 'hot' : ''} ${className}`}>
        <div className="rx-head">
          {title}
          <span className="muted small">1 phần</span>
        </div>
        <div className="rx-list">
          {items(p.recipe).map((it, i) => (
            <Row key={i} r={it} g={ingMap[it.ingredient_id]} />
          ))}
        </div>
      </article>
    )
  const yieldMl = Number(r.yield_ml || 0)
  const defCup = { n: 1, ml: used.find((p) => p.volume_ml > 0)?.volume_ml || SIZES[0] }
  // chưa chọn gì → mặc định "Ly" (mẻ chưa ghi ra được bao nhiêu ml thì xem cả mẻ)
  const view = divs[r.id] ?? (yieldMl > 0 ? defCup : 1)
  const cup = isCup(view) && yieldMl > 0 ? view : null
  const div = cup ? 1 : Number(view) || 1
  const k = scaleOf(cup || div, yieldMl)
  const list = items(r.items)
  const sizes = [...new Set([...SIZES, ...used.map((p) => Number(p.volume_ml)).filter((v) => v > 0)])].sort((a, b) => a - b)
  const setCup = (patch) => setDiv(r.id, { ...defCup, ...cup, ...patch })
  const total = cup ? cup.n * Number(cup.ml || 0) : 0
  return (
    <article className={`card rx-card ${hot ? 'hot' : ''} ${className}`}>
      <div className="rx-head">
        {title}
        <div className="rx-div" role="group" aria-label="Chia mẻ">
          {yieldMl > 0 && (
            <button type="button" className={cup ? 'active' : ''} onClick={() => setCup({})} aria-pressed={!!cup} title="Pha đúng số ly, dung tích tùy chọn">
              Ly
            </button>
          )}
          {DIVS.map((d) => (
            <button key={d} type="button" className={!cup && d === div ? 'active' : ''} onClick={() => setDiv(r.id, d)} aria-pressed={!cup && d === div}>
              ÷{d}
            </button>
          ))}
        </div>
      </div>
      {cup && (
        <div className="rx-cup">
          <div className="rx-cup-row">
            <div className="rx-step">
              <button type="button" onClick={() => setCup({ n: Math.max(1, cup.n - 1) })} disabled={cup.n <= 1} aria-label="Bớt 1 ly">
                <Minus size={16} />
              </button>
              <b aria-live="polite">{cup.n}</b>
              <button type="button" onClick={() => setCup({ n: cup.n + 1 })} aria-label="Thêm 1 ly">
                <Plus size={16} />
              </button>
            </div>
            <span>ly ×</span>
            <div className="unit-input rx-ml">
              <input
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                value={cup.ml}
                onChange={(e) => setCup({ ml: e.target.value })}
                aria-label="Dung tích mỗi ly"
              />
              <span>ml</span>
            </div>
          </div>
          <div className="rx-sizes" role="group" aria-label="Chọn nhanh dung tích">
            {sizes.map((v) => (
              <button key={v} type="button" className={`chip ${Number(cup.ml) === v ? 'active' : ''}`} onClick={() => setCup({ ml: v })}>
                {v} ml
              </button>
            ))}
          </div>
        </div>
      )}
      {cup ? (
        total > 0 && (
          <div className="rx-badge">
            {cup.n} ly × {num(Number(cup.ml))} ml = {qty(total, 'ml')} · {num(total / yieldMl, 2)} mẻ
          </div>
        )
      ) : (
        div > 1 && <div className="rx-badge">Đang xem 1/{div} mẻ</div>
      )}
      <div className="rx-list">
        {list.length === 0 ? <p className="muted small">Chưa ghi nguyên liệu.</p> : list.map((it, i) => <Row key={i} r={it} g={ingMap[it.ingredient_id]} k={k} />)}
      </div>
      <div className="rx-foot">
        {r.yield_ml > 0 && !cup && (
          <span>
            Ra được ≈ <b>{qty(r.yield_ml / div, 'ml')}</b>
            {used
              .filter((p) => p.volume_ml > 0)
              .slice(0, 2)
              .map((p) => ` · ${num(r.yield_ml / div / p.volume_ml, 1)} phần ${num(p.volume_ml)}ml`)
              .join('')}
          </span>
        )}
        {used.length > 0 && (
          <span className="muted small">
            Dùng cho: {used.map((p) => (star.has(p.id) ? `★ ${p.name}` : p.name)).join(', ')}
          </span>
        )}
        {r.note && (
          <details className="rx-note" open={noteOpen || undefined}>
            <summary>Cách làm / ghi chú</summary>
            <p>{nfc(r.note)}</p>
          </details>
        )}
      </div>
    </article>
  )
}

export default function Recipes() {
  const barista = useBarista()
  const rx = useRecipes()
  const [query, setQuery] = useState('')

  if (!rx) return <Loading />
  const { cards, featured } = rx
  const shown = cards.filter((c) => matchCard(c, query))

  return (
    <>
      <PageHeader title="Công thức pha chế" subtitle="Nguyên liệu của từng mẻ. Chọn “Ly” để pha đúng số ly 250, 270, 300, 350… 600 ml, hoặc ÷2, ÷3… để nấu nửa mẻ — số tự tính sẵn.">
        {!barista && (
          <Link to="/san-pham" className="btn btn-ghost">
            Sửa công thức
          </Link>
        )}
      </PageHeader>

      {cards.length === 0 ? (
        <Empty icon={FlaskConical}>
          Chưa có công thức.{' '}
          {barista ? 'Nhờ chủ quán thêm ở trang Sản phẩm & công thức.' : <>Vào <Link to="/san-pham">Sản phẩm & công thức</Link> → tab “Công thức mẻ” để thêm.</>}
        </Empty>
      ) : (
        <>
          <label className="search-box rx-search">
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm công thức / món…" aria-label="Tìm công thức" />
            {query && (
              <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">
                <X size={16} />
              </button>
            )}
          </label>
          {featured.length === 0 && (
            <p className="muted small rx-tip">
              Mẹo: đánh sao <b>Món hôm nay</b> ở trang Bán hàng, công thức của các món đó sẽ lên đầu ở đây.
            </p>
          )}

          <div className="rx-grid">
            {shown.map((c) => (
              <RecipeCard key={c.key} card={c} rx={rx} />
            ))}
          </div>
          {shown.length === 0 && <p className="muted" style={{ padding: '12px 4px' }}>Không tìm thấy công thức nào.</p>}
        </>
      )}
    </>
  )
}
