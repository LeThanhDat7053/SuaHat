import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Search, Star, X } from 'lucide-react'
import { showError } from '../lib/supabase'
import { num } from '../lib/format'
import { toMap } from '../lib/cost'
import { peek } from '../lib/cache'
import { loadCatalog, peekCatalog } from '../lib/catalog'
import { FEATURED_KEY, loadFeatured } from '../lib/featured'
import { plain } from '../lib/categories'
import { useLive } from '../lib/live'
import { useBarista } from '../lib/barista'
import { Empty, Loading, PageHeader } from '../components/ui'

// Luôn ghi g / ml (không đổi sang kg / lít) cho khớp với cân, ca đong
const qty = (q, unit) => `${num(q, 1)} ${unit}`

// Chia mẻ: ÷2 = nấu nửa mẻ → mọi nguyên liệu tự giảm một nửa, khỏi tính nhẩm
const DIVS = [1, 2, 3, 4, 5]
const DIV_KEY = 'recipe-div'
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

export default function Recipes() {
  const barista = useBarista()
  const [data, setData] = useState(peekCatalog)
  const [featured, setFeatured] = useState(() => peek(FEATURED_KEY) || [])
  const [divs, setDivs] = useState(readDivs)
  const [query, setQuery] = useState('')

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

  if (!data) return <Loading />
  const ingMap = toMap(data.ingredients)
  const products = data.products.filter((p) => p.active)
  const star = new Set(featured)

  // Công thức mẻ + món pha từng phần (không dùng mẻ nhưng có ghi nguyên liệu).
  // Món đánh sao (Món hôm nay) lên đầu, rồi theo tên.
  const cards = [
    ...data.recipes.map((r) => {
      const used = products.filter((p) => p.recipe_id === r.id)
      return { key: `r${r.id}`, name: r.name, names: [r.name, ...used.map((p) => p.name)], recipe: r, used, hot: used.some((p) => star.has(p.id)) }
    }),
    ...products
      .filter((p) => !data.recipes.some((r) => r.id === p.recipe_id) && items(p.recipe).length > 0)
      .map((p) => ({ key: `p${p.id}`, name: p.name, names: [p.name], product: p, hot: star.has(p.id) })),
  ].sort((a, b) => b.hot - a.hot || a.name.localeCompare(b.name, 'vi'))

  const q = plain(query.trim())
  const shown = cards.filter((c) => !q || c.names.some((n) => plain(n).includes(q)))

  const Row = ({ r, div = 1 }) => {
    const g = ingMap[r.ingredient_id]
    return (
      <div className="rx-row">
        <span className="rx-ing">{g ? nfc(g.name) : '(nguyên liệu đã xóa)'}</span>
        <span className="rx-amt">{qty(Number(r.amount) / div, g?.unit || '')}</span>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Công thức pha chế" subtitle="Nguyên liệu của từng mẻ. Chọn ÷2, ÷3… để nấu nửa mẻ, 1/3 mẻ — số tự chia sẵn.">
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
            {shown.map(({ key, recipe: r, used, product: p, hot }) => {
              if (p)
                return (
                  <article key={key} className={`card rx-card ${hot ? 'hot' : ''}`}>
                    <div className="rx-head">
                      <h2>
                        {hot && <Star size={16} className="inline-icon featured-star" aria-label="Món hôm nay" />}
                        {p.name}
                      </h2>
                      <span className="muted small">1 phần</span>
                    </div>
                    <div className="rx-list">
                      {items(p.recipe).map((it, i) => (
                        <Row key={i} r={it} />
                      ))}
                    </div>
                  </article>
                )
              const div = divs[r.id] || 1
              const list = items(r.items)
              return (
                <article key={key} className={`card rx-card ${hot ? 'hot' : ''}`}>
                  <div className="rx-head">
                    <h2>
                      {hot && <Star size={16} className="inline-icon featured-star" aria-label="Món hôm nay" />}
                      {nfc(r.name)}
                    </h2>
                    <div className="rx-div" role="group" aria-label="Chia mẻ">
                      {DIVS.map((d) => (
                        <button key={d} type="button" className={d === div ? 'active' : ''} onClick={() => setDiv(r.id, d)} aria-pressed={d === div}>
                          ÷{d}
                        </button>
                      ))}
                    </div>
                  </div>
                  {div > 1 && <div className="rx-badge">Đang xem 1/{div} mẻ</div>}
                  <div className="rx-list">
                    {list.length === 0 ? <p className="muted small">Chưa ghi nguyên liệu.</p> : list.map((it, i) => <Row key={i} r={it} div={div} />)}
                  </div>
                  <div className="rx-foot">
                    {r.yield_ml > 0 && (
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
                      <details className="rx-note">
                        <summary>Cách làm / ghi chú</summary>
                        <p>{nfc(r.note)}</p>
                      </details>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
          {shown.length === 0 && <p className="muted" style={{ padding: '12px 4px' }}>Không tìm thấy công thức nào.</p>}
        </>
      )}
    </>
  )
}
