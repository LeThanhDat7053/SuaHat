import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CupSoda, Ellipsis, Trash2, ClipboardList, ClipboardPlus, Star, ChevronDown } from 'lucide-react'
import { getSetting, setSetting, showError, supabase } from '../lib/supabase'
import { money, moneyShort, todayStr } from '../lib/format'
import { productCost, saleCost, saleRevenue, toMap } from '../lib/cost'
import { cached, peek } from '../lib/cache'
import { loadCatalog, peekCatalog } from '../lib/catalog'
import { useLive } from '../lib/live'
import { CHAI_DEFAULTS, addLines, completeQuickOrder, getChaiDefaults, linesTotal, missingTable, packText } from '../lib/quick'
import { DraftPanel, OrderCard, PackPicker, PriceForm, orderLabel } from '../components/QuickOrder'
import { DateNav, Empty, Field, Loading, Modal, MoneyInput, PageHeader, SaveButton, StatTile, useSubmit } from '../components/ui'

const isEmptyRow = (r) => !(r.quantity > 0) && !(r.gift_qty > 0) && !(Number(r.discount) > 0)

// Đơn đang lập được giữ trong máy, tải lại trang không bị mất
const DRAFT_KEY = 'quick-draft'
const emptyDraft = () => ({ lines: [], note: '', editingId: null, date: null })
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY))
    return d && Array.isArray(d.lines) ? { ...emptyDraft(), ...d } : null
  } catch {
    return null
  }
}

const activeProducts = (c) => c.products.filter((p) => p.active)
const costOf = (c) => ({ ing: toMap(c.ingredients), rec: toMap(c.recipes) })

// Dữ liệu bán hàng của 1 ngày
async function fetchDay(date) {
  const [s, w] = await Promise.all([
    supabase.from('sales').select('*').eq('date', date),
    supabase.from('waste').select('*').eq('date', date),
  ])
  const error = s.error || w.error
  if (error) throw error
  const rows = {}
  s.data.forEach((r) => r.product_id && r.source === '' && (rows[r.product_id] = r))
  return {
    rows,
    dayRows: s.data,
    waste: Object.fromEntries(w.data.map((r) => [r.product_id, r])),
  }
}
const dayKey = (date) => `sales-day:${date}`

// Món đang bán mấy hôm nay: chọn 1 lần, giữ tới khi đổi, mọi máy dùng chung
const FEATURED_KEY = 'featured_products'
const loadFeatured = () => cached(FEATURED_KEY, () => getSetting(FEATURED_KEY, []), 0)

const OTHERS_KEY = 'sales-show-others'
function readShowOthers() {
  try {
    return localStorage.getItem(OTHERS_KEY) === '1'
  } catch {
    return false
  }
}

export default function Sales() {
  // có dữ liệu từ lần mở trước thì hiện ngay, tải mới ngầm phía sau
  const [date, setDate] = useState(todayStr())
  const [cat0] = useState(peekCatalog)
  const [day0] = useState(() => peek(dayKey(todayStr())))
  const [products, setProducts] = useState(() => (cat0 ? activeProducts(cat0) : null))
  const [costCtx, setCostCtx] = useState(() => (cat0 ? costOf(cat0) : { ing: {}, rec: {} }))
  const [rows, setRows] = useState(day0?.rows || {}) // product_id → dòng bán tại quán của ngày đang xem
  const [dayRows, setDayRows] = useState(day0?.dayRows || []) // mọi dòng bán trong ngày (cả đơn đặt, món đã ẩn)
  const [waste, setWaste] = useState(day0?.waste || {}) // product_id → dòng hủy
  const [extra, setExtra] = useState(null) // món đang mở "Tặng / giảm / hủy"
  const [status, setStatus] = useState('')

  const [chaiDef, setChaiDef] = useState(CHAI_DEFAULTS)
  const [featured, setFeatured] = useState(() => peek(FEATURED_KEY) || [])
  const [pickFeatured, setPickFeatured] = useState(false)
  const [showOthers, setShowOthers] = useState(readShowOthers)
  const [draft, setDraft] = useState(loadDraft) // null = không ở chế độ lập đơn
  const [pending, setPending] = useState(null) // đơn đã chốt, đang chờ giao
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [picker, setPicker] = useState(null) // món đang chọn Ly / Chai
  const [priceEdit, setPriceEdit] = useState(null)
  const [busyOrder, setBusyOrder] = useState(null) // id đơn đang bấm "Đã xong"
  const [draftBusy, setDraftBusy] = useState(false)

  const timers = useRef({})
  const unsaved = useRef({})

  function loadCat() {
    loadCatalog(0).then((c) => {
      setProducts(activeProducts(c))
      setCostCtx(costOf(c))
    }, showError)
    getChaiDefaults().then(setChaiDef)
    loadFeatured().then((v) => setFeatured(Array.isArray(v) ? v : []), showError)
  }
  useEffect(loadCat, [])
  useLive(['products', 'ingredients', 'recipes', 'settings'], loadCat)

  useEffect(() => {
    try {
      if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* máy chặn lưu trữ: bỏ qua */
    }
  }, [draft])

  const loadPending = useCallback(async () => {
    const { data, error } = await supabase.from('quick_orders').select('*').eq('status', 'pending').order('id')
    if (missingTable(error)) return setNeedsUpgrade(true)
    if (!showError(error)) setPending(data)
  }, [])

  // nhiều máy cùng bán: tự tải lại đơn chờ mỗi 20 giây và khi quay lại app
  useEffect(() => {
    loadPending()
    const tick = () => document.visibilityState === 'visible' && loadPending()
    const t = setInterval(tick, 20000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [loadPending])

  const save = useCallback(async (date, product, row) => {
    setStatus('saving')
    const { error } = isEmptyRow(row)
      ? await supabase.from('sales').delete().eq('date', date).eq('product_id', product.id).eq('source', '')
      : await supabase.from('sales').upsert(
          {
            date,
            product_id: product.id,
            product_name: product.name,
            source: '',
            quantity: row.quantity || 0,
            gift_qty: row.gift_qty || 0,
            discount: Number(row.discount || 0),
            unit_price: row.unit_price,
            unit_cost: row.unit_cost,
          },
          { onConflict: 'date,product_id,source' },
        )
    setStatus(error ? 'error' : 'saved')
    showError(error)
  }, [])

  const flush = useCallback(() => {
    Object.entries(unsaved.current).forEach(([id, job]) => {
      clearTimeout(timers.current[id])
      save(job.date, job.product, job.row)
    })
    unsaved.current = {}
  }, [save])

  // lưu ngay những thay đổi chưa kịp lưu khi rời trang
  useEffect(() => flush, [flush])

  function applyDay(d) {
    setRows(d.rows)
    setDayRows(d.dayRows)
    setWaste(d.waste)
  }

  async function loadDay(date, cancelled = () => false) {
    try {
      const d = await cached(dayKey(date), () => fetchDay(date))
      if (!cancelled()) applyDay(d)
    } catch (e) {
      showError(e)
    }
  }

  useEffect(() => {
    flush()
    let cancelled = false
    applyDay(peek(dayKey(date)) || { rows: {}, dayRows: [], waste: {} })
    loadDay(date, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [date, flush])

  // máy khác bán / chốt đơn / giao đơn → cập nhật ngay. Đang có số gõ dở chưa lưu thì đợi lưu xong.
  useLive(['sales', 'waste', 'orders', 'quick_orders'], () => {
    loadPending()
    if (Object.keys(unsaved.current).length === 0) loadDay(date)
  })

  const lyCost = (product) => productCost(product, costCtx.ing, costCtx.rec)

  const newRow = (product) => ({
    quantity: 0,
    gift_qty: 0,
    discount: 0,
    unit_price: product.price,
    unit_cost: lyCost(product),
  })

  // patch: { quantity } hoặc { gift_qty, discount }
  function change(product, patch) {
    if ('quantity' in patch) patch.quantity = Math.max(0, Math.floor(patch.quantity || 0))
    // giữ giá của lần nhập đầu tiên trong ngày để lịch sử không bị thay đổi
    const row = { ...(rows[product.id] || newRow(product)), product_id: product.id, product_name: product.name, source: '', ...patch }
    setRows((prev) => ({ ...prev, [product.id]: row }))
    unsaved.current[product.id] = { date, product, row }
    clearTimeout(timers.current[product.id])
    timers.current[product.id] = setTimeout(() => {
      const job = unsaved.current[product.id]
      delete unsaved.current[product.id]
      if (job) save(job.date, job.product, job.row)
    }, 500)
  }

  async function saveWaste(product, quantity, reason) {
    setStatus('saving')
    const { data, error } =
      quantity > 0
        ? await supabase
            .from('waste')
            .upsert(
              {
                date,
                product_id: product.id,
                product_name: product.name,
                quantity,
                unit_cost: waste[product.id]?.unit_cost ?? lyCost(product),
                reason: reason || null,
              },
              { onConflict: 'date,product_id' },
            )
            .select()
            .single()
        : await supabase.from('waste').delete().eq('date', date).eq('product_id', product.id)
    setStatus(error ? 'error' : 'saved')
    if (showError(error)) return
    setWaste((prev) => {
      const next = { ...prev }
      if (data) next[product.id] = data
      else delete next[product.id]
      return next
    })
  }

  async function removeRow(r) {
    if (!confirm(`Xóa ${r.quantity} phần "${r.product_name}" khỏi doanh thu ngày này?`)) return
    const { error } = await supabase.from('sales').delete().eq('id', r.id)
    if (!showError(error)) setDayRows((prev) => prev.filter((x) => x.id !== r.id))
  }

  // ---------- Lập đơn nhanh ----------
  function toggleDraft() {
    if (!draft) return setDraft(emptyDraft())
    if (draft.lines.length > 0 && !confirm(draft.editingId ? 'Bỏ các thay đổi của đơn đang sửa?' : 'Bỏ đơn đang lập?')) return
    setDraft(null)
  }

  function addToDraft(lines) {
    setDraft((d) => ({ ...(d || emptyDraft()), lines: addLines(d?.lines || [], lines) }))
    setPicker(null)
  }

  // now = true: khách lấy liền → chốt và tính tiền luôn
  async function submitDraft(now) {
    const lines = draft.lines.filter((l) => l.qty > 0)
    if (lines.length === 0) return
    setDraftBusy(true)
    const payload = { note: draft.note.trim() || null, lines, total: linesTotal(lines) }
    const { data, error } = draft.editingId
      ? await supabase.from('quick_orders').update(payload).eq('id', draft.editingId).eq('status', 'pending').select().maybeSingle()
      : await supabase
          .from('quick_orders')
          .insert({ ...payload, date })
          .select()
          .single()
    if (showError(error)) return setDraftBusy(false)
    if (!data) {
      setDraftBusy(false)
      alert('Đơn này đã được bấm xong hoặc đã bị xóa ở máy khác.')
      setDraft(null)
      return loadPending()
    }
    if (now) {
      const err = await completeQuickOrder(data)
      if (showError(err)) {
        setPending((p) => [...(p || []), data])
      } else if (data.date === date) loadDay(date)
    } else {
      setPending((p) => (draft.editingId ? p.map((o) => (o.id === data.id ? data : o)) : [...(p || []), data]))
    }
    setDraftBusy(false)
    setDraft(null)
  }

  async function markDone(order) {
    setBusyOrder(order.id)
    const error = await completeQuickOrder(order)
    setBusyOrder(null)
    if (showError(error)) return loadPending()
    setPending((p) => p.filter((o) => o.id !== order.id))
    if (order.date === date) loadDay(date)
  }

  function editOrder(order) {
    if (draft?.lines.length > 0 && !confirm('Đang lập dở 1 đơn khác. Bỏ đơn đó để sửa đơn này?')) return
    setDraft({ lines: order.lines, note: order.note || '', editingId: order.id, date: order.date })
  }

  async function deleteOrder(order) {
    if (!confirm(`Xóa "${orderLabel(order)}" (${money(order.total)})? Đơn chưa giao nên không ảnh hưởng doanh thu.`)) return
    const { error } = await supabase.from('quick_orders').delete().eq('id', order.id).eq('status', 'pending')
    if (!showError(error)) setPending((p) => p.filter((o) => o.id !== order.id))
  }

  function toggleOthers() {
    const next = !showOthers
    setShowOthers(next)
    try {
      localStorage.setItem(OTHERS_KEY, next ? '1' : '0')
    } catch {
      /* bỏ qua */
    }
  }

  async function saveFeatured(ids) {
    const prev = featured
    setFeatured(ids)
    setPickFeatured(false)
    if (!(await setSetting(FEATURED_KEY, ids))) setFeatured(prev)
  }

  if (!products) return <Loading />

  const activeIds = new Set(products.map((p) => p.id))
  const shopRows = Object.values(rows).filter((r) => activeIds.has(r.product_id))
  const otherRows = dayRows.filter((r) => !(r.source === '' && activeIds.has(r.product_id)))
  const orderRows = otherRows.filter((r) => r.source.startsWith('order:'))
  const hiddenRows = otherRows.filter((r) => r.source === '')
  const all = [...shopRows, ...otherRows]
  const totalQty = all.reduce((s, r) => s + r.quantity, 0)
  const chaiQty = all.reduce((s, r) => s + (r.pack === 'chai' ? r.quantity : 0), 0)
  const revenue = all.reduce((s, r) => s + saleRevenue(r), 0)
  const cost = all.reduce((s, r) => s + saleCost(r), 0)
  const wasteList = Object.values(waste)
  const wasteQty = wasteList.reduce((s, r) => s + r.quantity, 0)
  const wasteCost = wasteList.reduce((s, r) => s + r.quantity * r.unit_cost, 0)

  // số Ly / Chai đã bán của từng món trong ngày (bán cũ không ghi loại → tính là Ly)
  const sold = {}
  all.forEach((r) => {
    if (!r.product_id) return
    const s = (sold[r.product_id] ||= { ly: 0, chai: 0 })
    s[r.pack === 'chai' ? 'chai' : 'ly'] += r.quantity
  })
  const inDraft = {}
  draft?.lines.forEach((l) => {
    const s = (inDraft[l.product_id] ||= { ly: 0, chai: 0 })
    s[l.pack] += l.qty
  })

  const renderCard = (p, isFeatured) => {
    const r = rows[p.id]
    const s = sold[p.id]?.ly + sold[p.id]?.chai > 0 ? sold[p.id] : null
    const d = inDraft[p.id]
    const tags = [
      r?.gift_qty > 0 && `Tặng ${r.gift_qty}`,
      r?.discount > 0 && `Giảm ${moneyShort(r.discount)}`,
      waste[p.id] && `Hủy ${waste[p.id].quantity}`,
    ].filter(Boolean)
    return (
      <div key={p.id} className={`sell-card ${isFeatured ? 'featured' : ''} ${d ? 'in-draft' : s ? 'has-qty' : ''}`}>
        <div className="sell-top">
          <button
            type="button"
            className="sell-main"
            onClick={() => (needsUpgrade ? change(p, { quantity: (r?.quantity || 0) + 1 }) : setPicker(p))}
          >
            <span className="sell-name">{p.name}</span>
            <span className="muted">{money(p.price)}</span>
            {tags.length > 0 && <span className="sell-tags">{tags.join(' · ')}</span>}
          </button>
          <button type="button" className="icon-btn sell-more" onClick={() => setExtra(p)} aria-label={`Tặng, giảm giá, hủy ${p.name}`}>
            <Ellipsis size={18} />
          </button>
        </div>
        <div className="sell-foot">
          {d ? (
            <span className="sell-draft">Trong đơn: {packText(d.ly, d.chai)}</span>
          ) : (
            <span className="muted small">{s ? `Đã bán ${packText(s.ly, s.chai)}` : 'Chưa bán'}</span>
          )}
        </div>
      </div>
    )
  }

  const featuredSet = new Set(featured)
  const featuredList = products.filter((p) => featuredSet.has(p.id))
  const otherList = products.filter((p) => !featuredSet.has(p.id))

  return (
    <>
      <PageHeader title="Bán hàng" subtitle="Bấm vào món → chọn Ly / Chai. Dữ liệu tự lưu.">
        <span className={`save-status ${status}`}>
          {status === 'saving' ? (
            <>
              <span className="spinner" aria-hidden="true" /> Đang lưu…
            </>
          ) : status === 'saved' ? (
            '✓ Đã lưu'
          ) : status === 'error' ? (
            'Lỗi lưu'
          ) : (
            ''
          )}
        </span>
        <Link to="/don" className="btn btn-ghost">
          <ClipboardList size={18} /> Xem mọi đơn
        </Link>
        {!needsUpgrade && (
          <button type="button" className={`btn ${draft ? 'btn-drafting' : 'btn-primary'}`} onClick={toggleDraft} aria-pressed={!!draft}>
            <ClipboardPlus size={18} /> {draft ? 'Đang lập đơn' : 'Lập đơn'}
          </button>
        )}
      </PageHeader>

      {needsUpgrade && (
        <div className="callout">
          Để dùng <b>Lập đơn nhanh</b> và bán Ly / Chai, cần nâng cấp database 1 lần: Supabase → SQL Editor → dán file{' '}
          <code>supabase/nang-cap-v3.sql</code> → RUN, rồi tải lại trang.
        </div>
      )}

      <DateNav date={date} onChange={setDate} />

      <div className="stats stats-3">
        <StatTile
          label="Đã bán"
          value={`${totalQty} phần`}
          note={[chaiQty > 0 && `${totalQty - chaiQty} ly · ${chaiQty} chai`, wasteQty > 0 && `hủy ${wasteQty}`].filter(Boolean).join(' · ') || undefined}
        />
        <StatTile label="Doanh thu" value={money(revenue)} />
        <StatTile
          label="Lãi gộp"
          value={money(revenue - cost - wasteCost)}
          note={`Giá vốn ${moneyShort(cost)}${wasteCost ? ` · hủy ${moneyShort(wasteCost)}` : ''}`}
          tone="good"
        />
      </div>

      {pending?.length > 0 && (
        <section className="pending">
          <div className="section-head">
            <h2>Đơn đang chờ ({pending.length})</h2>
            <span className="muted small">{money(pending.reduce((s, o) => s + Number(o.total), 0))}</span>
          </div>
          <div className="pending-strip">
            {pending.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                busy={busyOrder === o.id}
                editing={draft?.editingId === o.id}
                onDone={() => markDone(o)}
                onEdit={() => editOrder(o)}
                onDelete={() => deleteOrder(o)}
              />
            ))}
          </div>
        </section>
      )}

      {products.length === 0 ? (
        <Empty icon={CupSoda}>
          Chưa có sản phẩm nào. <Link to="/san-pham">Thêm sản phẩm</Link> trước nhé.
        </Empty>
      ) : (
        <>
          <div className="featured-head">
            <h2>
              <Star size={17} className="inline-icon featured-star" />
              Món hôm nay{featuredList.length > 0 && ` (${featuredList.length})`}
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickFeatured(true)}>
              Chọn món
            </button>
          </div>
          {featuredList.length === 0 ? (
            <button type="button" className="featured-empty" onClick={() => setPickFeatured(true)}>
              Bấm <b>Chọn món</b> để đưa vài món đang bán lên đầu và tô màu, khỏi phải lướt tìm.
            </button>
          ) : (
            <div className="product-grid">{featuredList.map((p) => renderCard(p, true))}</div>
          )}
          {otherList.length > 0 &&
            (featuredList.length === 0 ? (
              <div className="product-grid others-grid">{otherList.map((p) => renderCard(p, false))}</div>
            ) : (
              <>
                <button type="button" className="others-toggle" onClick={toggleOthers} aria-expanded={showOthers}>
                  Món khác ({otherList.length})
                  <ChevronDown size={18} className={showOthers ? 'rotated' : ''} />
                </button>
                {showOthers && <div className="product-grid others-grid">{otherList.map((p) => renderCard(p, false))}</div>}
              </>
            ))}
        </>
      )}

      {orderRows.length > 0 && (
        <div className="card list-card" style={{ marginTop: 16 }}>
          <div className="list-head">
            <span>Từ đơn đặt đã giao</span>
            <Link to="/lich">Lịch đơn →</Link>
          </div>
          {orderRows.map((r) => (
            <div key={r.id} className="list-row">
              <span className="grow">{r.product_name}</span>
              <span>
                {r.quantity} × {money(r.unit_price)}
                {r.discount > 0 && <span className="muted small"> − {money(r.discount)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {hiddenRows.length > 0 && (
        <div className="card list-card" style={{ marginTop: 16 }}>
          <div className="list-head">Món đã ẩn / đã xóa (vẫn tính vào doanh thu)</div>
          {hiddenRows.map((r) => (
            <div key={r.id} className="list-row">
              <span className="grow">{r.product_name}</span>
              <span>
                {r.quantity} × {money(r.unit_price)}
              </span>
              <button className="icon-btn" onClick={() => removeRow(r)} aria-label={`Xóa ${r.product_name}`}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {draft && !needsUpgrade && (
        <>
          <div className="draft-spacer" />
          <DraftPanel draft={draft} onChange={setDraft} onSubmit={submitDraft} onCancel={toggleDraft} busy={draftBusy} />
        </>
      )}

      {picker && (
        <PackPicker
          product={picker}
          lyCost={lyCost(picker)}
          def={chaiDef}
          onAdd={addToDraft}
          onEditPrice={() => {
            setPriceEdit(picker)
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {priceEdit && (
        <PriceForm
          product={priceEdit}
          lyCost={lyCost(priceEdit)}
          def={chaiDef}
          onClose={() => {
            setPicker(priceEdit)
            setPriceEdit(null)
          }}
          onSaved={(product, def) => {
            setProducts((list) => list.map((p) => (p.id === product.id ? product : p)))
            setChaiDef(def)
            setPriceEdit(null)
            setPicker(product)
          }}
        />
      )}

      {pickFeatured && (
        <FeaturedPicker products={products} selected={featured} sold={sold} onClose={() => setPickFeatured(false)} onSave={saveFeatured} />
      )}

      {extra && (
        <ExtraForm
          product={extra}
          row={rows[extra.id]}
          waste={waste[extra.id]}
          onClose={() => setExtra(null)}
          onSave={async (quantity, gift_qty, discount, wasteQty, reason) => {
            const r = rows[extra.id]
            if (quantity !== (r?.quantity || 0) || gift_qty !== (r?.gift_qty || 0) || discount !== Number(r?.discount || 0))
              change(extra, { quantity, gift_qty, discount })
            if (wasteQty !== (waste[extra.id]?.quantity || 0) || (reason || null) !== (waste[extra.id]?.reason || null))
              await saveWaste(extra, wasteQty, reason)
            setExtra(null)
          }}
        />
      )}
    </>
  )
}

function ExtraForm({ product, row, waste, onClose, onSave }) {
  const [qty, setQty] = useState(row?.quantity || '')
  const [gift, setGift] = useState(row?.gift_qty || '')
  const [discount, setDiscount] = useState(row?.discount || '')
  const [wasteQty, setWasteQty] = useState(waste?.quantity || '')
  const [reason, setReason] = useState(waste?.reason || '')
  const int = (v) => Math.max(0, Math.floor(Number(v) || 0))
  const [busy, onSubmit] = useSubmit(() => onSave(int(qty), int(gift), Number(discount || 0), int(wasteQty), reason.trim()))

  return (
    <Modal title={product.name} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <Field label="Bán lẻ không qua đơn (phần)" hint="Số đếm kiểu cũ, giá Ly. Bán bằng “Lập đơn” thì không cần gõ ở đây.">
          <input type="number" min="0" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Tặng khách (phần)" hint="Tính giá vốn, không tính doanh thu">
            <input type="number" min="0" inputMode="numeric" value={gift} onChange={(e) => setGift(e.target.value)} />
          </Field>
          <Field label="Tổng tiền giảm giá hôm nay" hint="VD: khách quen giảm 5.000đ × 3 phần = 15.000đ">
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Hủy / đổ bỏ (phần)" hint="Quá hạn, hỏng, đổ vỡ">
            <input type="number" min="0" inputMode="numeric" value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} />
          </Field>
          <Field label="Lý do hủy">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Quá hạn 3 ngày…" />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Đóng
          </button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}

// Chọn các món đang bán mấy hôm nay → lên đầu trang Bán hàng
function FeaturedPicker({ products, selected, sold, onClose, onSave }) {
  const [ids, setIds] = useState(() => new Set(selected))
  const toggle = (id) =>
    setIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <Modal title="Món hôm nay" onClose={onClose}>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Chọn các món đang bán. Giữ nguyên cho các ngày sau tới khi bạn đổi, mọi máy đều thấy giống nhau.
      </p>
      <div className="featured-list">
        {products.map((p) => {
          const s = sold[p.id]
          const n = s ? s.ly + s.chai : 0
          return (
            <label key={p.id} className={`featured-row ${ids.has(p.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={ids.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="grow">{p.name}</span>
              {n > 0 && <span className="muted small">đã bán {n}</span>}
            </label>
          )
        })}
      </div>
      <div className="form-actions featured-actions">
        <button type="button" className="btn btn-danger-ghost" onClick={() => setIds(new Set())} disabled={ids.size === 0}>
          Bỏ chọn hết
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onSave(products.filter((p) => ids.has(p.id)).map((p) => p.id))}>
          Lưu ({ids.size})
        </button>
      </div>
    </Modal>
  )
}
