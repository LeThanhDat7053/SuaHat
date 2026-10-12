import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, FlaskConical, Search, ShoppingBag, Star, X } from 'lucide-react'
import { RecipeCard, matchCard, useRecipes } from './Recipes'
import Sales from './Sales'
import { Empty, Loading } from '../components/ui'

// Chế độ pha chế · chia màn hình: 2 khung công thức + 1 khung đơn hàng, mỗi khung cuộn riêng.
// Máy tính bảng xoay ngang / máy tính: 3 cột cạnh nhau. Màn hẹp (điện thoại, xoay dọc): bấm tab để đổi khung.

const PANE_KEY = (slot) => `split-rx-${slot}`
const TAB_KEY = 'split-tab'

function readKey(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function writeKey(k, v) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* bỏ qua */
  }
}

export default function BaristaSplit() {
  const rx = useRecipes()
  const [tab, setTab] = useState(() => Number(readKey(TAB_KEY)) || 0)
  const [names, setNames] = useState(['', ''])

  function pickTab(i) {
    setTab(i)
    writeKey(TAB_KEY, String(i))
  }
  const setName = (slot) => (name) => setNames((n) => (n[slot] === name ? n : slot ? [n[0], name] : [name, n[1]]))

  const tabs = [names[0] || 'Công thức 1', names[1] || 'Công thức 2', 'Đơn hàng']

  return (
    <div className="split">
      <header className="split-bar">
        <img src="/logo.png" alt="" width="28" height="28" />
        <strong className="split-title">Pha chế</strong>
        <div className="split-tabs" role="tablist" aria-label="Chọn khung">
          {tabs.map((t, i) => (
            <button key={i} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'active' : ''} onClick={() => pickTab(i)}>
              {i === 2 ? <ShoppingBag size={15} /> : <FlaskConical size={15} />}
              <span className="clamp">{t}</span>
            </button>
          ))}
        </div>
        <Link to="/ban-hang" className="btn btn-ghost btn-sm split-exit">
          <X size={16} /> Thoát chia màn hình
        </Link>
      </header>

      <div className="split-body">
        {[0, 1].map((slot) => (
          <section key={slot} className={`split-col split-rx ${tab === slot ? 'on' : ''}`} aria-label={`Công thức ${slot + 1}`}>
            {!rx ? <Loading /> : <RecipePane slot={slot} rx={rx} onName={setName(slot)} />}
          </section>
        ))}
        <section className={`split-col split-sales ${tab === 2 ? 'on' : ''}`} aria-label="Đơn hàng">
          <Sales split />
        </section>
      </div>
    </div>
  )
}

// 1 khung công thức: nhớ món đang xem riêng từng khung, bấm tên để đổi, ‹ › để lật nhanh
function RecipePane({ slot, rx, onName }) {
  const { cards } = rx
  const [key, setKey] = useState(() => readKey(PANE_KEY(slot)))
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')

  // chưa chọn (hoặc công thức đã bị xóa): khung 1 lấy món đầu, khung 2 lấy món thứ 2
  const idx = cards.findIndex((c) => c.key === key)
  const fallback = cards[Math.min(slot, cards.length - 1)]
  const card = idx >= 0 ? cards[idx] : fallback
  const at = idx >= 0 ? idx : cards.indexOf(fallback)

  useEffect(() => onName(card?.name || ''), [card?.name])

  function choose(c) {
    setKey(c.key)
    writeKey(PANE_KEY(slot), c.key)
    setPicking(false)
    setQuery('')
  }
  const step = (d) => cards.length > 0 && choose(cards[(at + d + cards.length) % cards.length])

  if (cards.length === 0)
    return (
      <Empty icon={FlaskConical}>
        Chưa có công thức. Nhờ chủ quán thêm ở trang Sản phẩm & công thức.
      </Empty>
    )

  const shown = cards.filter((c) => matchCard(c, query))

  return (
    <div className="pane">
      <div className="pane-head">
        <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Công thức trước">
          <ChevronLeft size={20} />
        </button>
        <button type="button" className={`pane-name ${picking ? 'open' : ''}`} onClick={() => setPicking(!picking)} aria-expanded={picking}>
          <span className="clamp">{picking ? 'Chọn công thức…' : card.name}</span>
          <ChevronDown size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Công thức sau">
          <ChevronRight size={20} />
        </button>
      </div>

      {picking ? (
        <div className="pane-pick">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm công thức / món…" aria-label="Tìm công thức" />
            {query && (
              <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">
                <X size={16} />
              </button>
            )}
          </label>
          <div className="pane-list">
            {shown.map((c) => (
              <button key={c.key} type="button" className={`pane-item ${c.key === card.key ? 'active' : ''} ${c.hot ? 'hot' : ''}`} onClick={() => choose(c)}>
                {c.hot && <Star size={14} className="featured-star" />}
                <span>{c.name}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="muted small">Không tìm thấy công thức nào.</p>}
          </div>
        </div>
      ) : (
        <RecipeCard card={card} rx={rx} noteOpen className="rx-big" />
      )}
    </div>
  )
}
