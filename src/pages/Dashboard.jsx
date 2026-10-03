import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleQuestionMark, Download, TriangleAlert } from 'lucide-react'
import { fetchAll, getSetting, showError, supabase } from '../lib/supabase'
import { loadStockCached } from '../lib/stock'
import { DEFAULT_MARGIN, productCost, saleCost, saleRevenue, toMap } from '../lib/cost'
import { orderItemsText } from '../lib/orders'
import { packText } from '../lib/quick'
import { downloadXlsx } from '../lib/xlsx'
import { applyRecurring } from '../lib/recurring'
import { cached, peek } from '../lib/cache'
import { useLive } from '../lib/live'
import { addDays, daysBetween, fmtDate, fmtQty, fmtTime, money, moneyShort, monthRange, num, periodRange, todayStr } from '../lib/format'
import { Loading, PageHeader, StatTile } from '../components/ui'
import BarChart from '../components/BarChart'
import Traffic from '../components/Traffic'
import { STATUS } from './CalendarPage'

const PRESETS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'yesterday', label: 'Hôm qua' },
  { key: 'week', label: 'Tuần này' },
  { key: 'lastweek', label: 'Tuần trước' },
  { key: 'month', label: 'Tháng này' },
  { key: 'lastmonth', label: 'Tháng trước' },
  { key: 'custom', label: 'Tùy chọn' },
]

function presetRange(key) {
  const t = todayStr()
  if (key === 'today') return { from: t, to: t }
  if (key === 'yesterday') return { from: addDays(t, -1), to: addDays(t, -1) }
  if (key === 'week') return { from: periodRange('week', t).from, to: t }
  if (key === 'lastweek') return periodRange('week', addDays(t, -7))
  if (key === 'month') return { from: monthRange(t.slice(0, 7)).from, to: t }
  const firstThis = monthRange(t.slice(0, 7)).from
  return monthRange(addDays(firstThis, -1).slice(0, 7))
}

// Kỳ liền trước, cùng số ngày
function prevRange({ from, to }) {
  const n = daysBetween(from, to).length
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0)
const dm = (s) => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}`
// Hao hụt kiểm kê: chỉ tính phần THIẾU. Đếm dư (thường do kiểm kê lần đầu, hoặc quên ghi nhập hàng)
// không được cộng thành tiền lời, kẻo lãi bị ảo.
const shrinkOf = (counts) => sum(counts, (r) => Math.max(0, r.expected - r.counted) * r.unit_price)

// Tiền mua nguyên liệu "Tính 1 lần lúc mua" (sữa đặc, đường…): trừ thẳng vào lãi kỳ mua
const directBuy = (purchases) => sum(purchases, (r) => (r.ingredients?.cost_on_buy && !r.ingredients?.no_stock ? Number(r.total) : 0))

const dmy = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

async function loadRange({ from, to }, full) {
  const q = (table, cols) =>
    fetchAll(() => supabase.from(table).select(cols).gte('date', from).lte('date', to).order('date').order('id'))
  const tables = full
    ? [q('sales', '*'), q('purchases', '*, ingredients(*)'), q('expenses', '*'), q('waste', '*'), q('stock_counts', '*, ingredients(name, unit)'), q('day_closings', '*')]
    : [q('sales', '*'), q('waste', '*')]
  const res = await Promise.all(tables)
  const error = res.find((r) => r.error)?.error
  if (error) throw error
  const [sales, a, b, c, d, e] = res.map((r) => r.data)
  return full ? { sales, purchases: a, expenses: b, waste: c, counts: d, closings: e } : { sales, waste: a }
}

function summarize(sales, waste) {
  const revenue = sum(sales, saleRevenue)
  const cogs = sum(sales, saleCost)
  const wasteCost = sum(waste, (r) => r.quantity * r.unit_cost)
  const cups = sum(sales, (r) => r.quantity)
  return { revenue, cogs, wasteCost, cups, gross: revenue - cogs - wasteCost }
}

const reportKey = (r) => `dash:${r.from}:${r.to}`

async function fetchReport(range) {
  // ghi các chi phí định kỳ còn thiếu trước (mỗi ngày 1 lần), để số liệu có luôn khoản hôm nay
  await applyRecurring().catch((e) => console.error(e))
  const prev = prevRange(range)
  const [cur, before] = await Promise.all([loadRange(range, true), loadRange(prev, false)])
  return { ...cur, prev: { ...before, range: prev } }
}

async function fetchUpcoming() {
  const t = todayStr()
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .gte('order_date', t)
    .lte('order_date', addDays(t, 7))
    .order('order_date')
    .order('order_time', { nullsFirst: true })
  if (error) throw error
  return data
}

// cảnh báo: nguyên liệu sắp hết, món lãi mỏng
async function fetchAlerts() {
  const [st, margin] = await Promise.all([loadStockCached(), getSetting('margin_min', DEFAULT_MARGIN)])
  const ingMap = toMap(st.ingredients)
  const recMap = toMap(st.recipes)
  const low = st.ingredients.filter((g) => !g.no_stock && g.min_stock > 0 && st.stock[g.id] < g.min_stock)
  const thin = st.products
    .filter((p) => p.active && p.price > 0)
    .map((p) => ({ ...p, pct: ((p.price - productCost(p, ingMap, recMap)) / p.price) * 100 }))
    .filter((p) => p.pct < Number(margin))
  return { low, thin, stock: st.stock, margin }
}

export default function Dashboard() {
  // số của lần xem trước hiện ngay, tải mới ngầm phía sau
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(presetRange('month'))
  const [data, setData] = useState(() => peek(reportKey(presetRange('month'))) || null)
  const [upcoming, setUpcoming] = useState(() => peek('dash-upcoming') || [])
  const [alerts, setAlerts] = useState(() => peek('dash-alerts') || null)
  const [tick, setTick] = useState(0) // tăng lên khi có dữ liệu mới → tải lại
  useLive(
    ['sales', 'waste', 'purchases', 'expenses', 'stock_counts', 'day_closings', 'orders', 'products', 'ingredients', 'recipes', 'settings'],
    () => setTick((t) => t + 1),
  )

  function choose(key) {
    setPreset(key)
    if (key !== 'custom') setRange(presetRange(key))
  }

  useEffect(() => {
    let cancelled = false
    setData(peek(reportKey(range)) || null)
    cached(reportKey(range), () => fetchReport(range)).then(
      (d) => !cancelled && setData(d),
      (e) => showError(e),
    )
    return () => {
      cancelled = true
    }
  }, [range, tick])

  useEffect(() => {
    cached('dash-upcoming', fetchUpcoming).then(setUpcoming, showError)
    // tồn kho tính khá nặng: dùng lại trong 2 phút
    cached('dash-alerts', fetchAlerts, 120000).then(setAlerts, (e) => console.error(e))
  }, [tick])

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Doanh thu, chi phí và lãi của quán">
        <Link to="/huong-dan" className="btn btn-ghost">
          <CircleQuestionMark size={18} /> Cách dùng
        </Link>
        <button className="btn btn-ghost" disabled={!data} onClick={() => exportExcel(range, data)}>
          <Download size={18} /> Xuất Excel
        </button>
      </PageHeader>

      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p.key} className={`chip ${preset === p.key ? 'active' : ''}`} onClick={() => choose(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="toolbar">
          <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          <span>đến</span>
          <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
        </div>
      )}

      {alerts && (alerts.low.length > 0 || alerts.thin.length > 0) && (
        <div className="card alert-card">
          <strong>
            <TriangleAlert size={18} className="inline-icon" /> Cần chú ý
          </strong>
          {alerts.low.map((g) => (
            <Link key={'i' + g.id} to="/nguyen-lieu" className="alert-row">
              <span>{g.name} sắp hết</span>
              <span className="muted">còn {fmtQty(alerts.stock[g.id], g.unit)}</span>
            </Link>
          ))}
          {alerts.thin.map((p) => (
            <Link key={'p' + p.id} to="/san-pham" className="alert-row">
              <span>{p.name} lãi mỏng</span>
              <span className="muted">
                {num(p.pct, 0)}% (mức báo {alerts.margin}%)
              </span>
            </Link>
          ))}
        </div>
      )}

      {!data ? <Loading /> : <Report data={data} range={range} />}

      <section className="section">
        <div className="section-head">
          <h2>Đơn đặt 7 ngày tới</h2>
          <Link to="/lich">Xem lịch →</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted">Không có đơn nào đang chờ.</p>
        ) : (
          <div className="card list-card">
            {upcoming.map((o) => (
              <Link key={o.id} to="/lich" className="list-row list-link">
                <div className="grow">
                  <div>
                    <strong>{o.customer}</strong> <span className="muted">· {fmtDate(o.order_date)} {fmtTime(o.order_time)}</span>
                  </div>
                  {orderItemsText(o) && <div className="muted small clamp">{orderItemsText(o)}</div>}
                </div>
                <span className={`badge badge-${STATUS[o.status].cls}`}>{money(o.total)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// % tăng / giảm so với kỳ trước; `prefix` hiện trước (vd " · "), `suffix` sau
// 1 dòng trong phép tính: "− Chi phí khác ........ 10.000đ"
function CalcRow({ label, sub, value, minus, total }) {
  return (
    <div className={`calc-row ${total ? 'total' : ''}`}>
      <span className="calc-sign">{total ? '=' : minus ? '−' : ''}</span>
      <span className="grow">
        {label}
        {sub && <span className="muted small block">{sub}</span>}
      </span>
      <strong className={total ? (value >= 0 ? 'good-text' : 'danger-text') : ''}>{money(value)}</strong>
    </div>
  )
}

function Change({ now, before, prefix = '', suffix = null }) {
  if (!before) return null
  const pct = ((now - before) / Math.abs(before)) * 100
  if (!Number.isFinite(pct)) return null
  return (
    <>
      {prefix}
      <span className={pct >= 0 ? 'good-text' : 'danger-text'}>
        {pct >= 0 ? '▲' : '▼'} {num(Math.abs(pct), 0)}%
      </span>
      {suffix}
    </>
  )
}

function Report({ data, range }) {
  const [detail, setDetail] = useState(() => {
    try {
      return localStorage.getItem('dash_detail') === '1'
    } catch {
      return false
    }
  })
  const { sales, purchases, expenses, waste, counts, closings, prev } = data
  const cur = summarize(sales, waste)
  const old = summarize(prev.sales, prev.waste)
  const bought = sum(purchases, (r) => Number(r.total))
  const other = sum(expenses, (r) => Number(r.amount))
  const shrink = shrinkOf(counts)
  const direct = directBuy(purchases)
  const net = cur.gross - shrink - other - direct
  const cash = cur.revenue - bought - other
  const wasteQty = sum(waste, (r) => r.quantity)
  const made = cur.cups + sum(sales, (r) => r.gift_qty || 0) + wasteQty

  const days = daysBetween(range.from, range.to)
  const perCup = cur.cups ? cur.gross / cur.cups : 0
  const needPerDay = perCup > 0 ? (other + direct) / perCup / days.length : 0
  const soldPerDay = cur.cups / days.length

  const vs = <span className="muted">so với {prev.range.from === prev.range.to ? dm(prev.range.from) : `${dm(prev.range.from)}–${dm(prev.range.to)}`}</span>

  // gộp theo món (Ly + Chai chung 1 dòng), tách số ly / chai để xem
  const byProduct = {}
  const addTo = (rows, key) =>
    rows.forEach((r) => {
      const name = r.product_name.replace(/\s\((Ly|Chai)\)$/, '')
      const p = (byProduct[r.product_id || name] ||= { name, qty: 0, ly: 0, chai: 0, revenue: 0, profit: 0, prevQty: 0 })
      if (key === 'prevQty') p.prevQty += r.quantity
      else {
        p.qty += r.quantity
        p[r.pack === 'chai' ? 'chai' : 'ly'] += r.quantity
        p.revenue += saleRevenue(r)
        p.profit += saleRevenue(r) - saleCost(r)
      }
    })
  addTo(sales, 'cur')
  addTo(prev.sales, 'prevQty')
  const top = Object.values(byProduct)
    .filter((p) => p.qty > 0)
    .sort((a, b) => b.revenue - a.revenue)

  const perDay = Object.fromEntries(days.map((d) => [d, 0]))
  sales.forEach((r) => (perDay[r.date] = (perDay[r.date] || 0) + saleRevenue(r)))

  const lines = insights({ cur, old, net, top, other: other + direct, perCup, needPerDay, soldPerDay, wasteQty, made })

  function toggle() {
    setDetail(!detail)
    try {
      localStorage.setItem('dash_detail', detail ? '0' : '1')
    } catch {
      // trình duyệt chặn lưu → chỉ không nhớ lựa chọn, không sao
    }
  }

  return (
    <>
      <div className="stats stats-3">
        <StatTile
          label="Bán được"
          value={money(cur.revenue)}
          note={
            <>
              {cur.cups} phần
              <Change now={cur.revenue} before={old.revenue} prefix=" · " />
            </>
          }
        />
        <StatTile label="Lãi ròng" value={money(net)} note="Đã trừ nguyên liệu và chi phí" tone={net >= 0 ? 'good' : 'bad'} />
        <StatTile label="Tiền còn lại" value={money(cash)} note="Bán − đi chợ − chi phí" tone={cash >= 0 ? 'good' : 'bad'} />
      </div>

      {lines.length > 0 && (
        <div className="card insight">
          {lines.map((l, i) => (
            <p key={i} className={l.tone ? `${l.tone}-text` : ''}>
              {l.text}
            </p>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm detail-toggle" onClick={toggle}>
        {detail ? 'Thu gọn ▴' : 'Xem lãi ròng được tính thế nào ▾'}
      </button>

      {detail && (
        <div className="calc-grid">
          <div className="card calc">
            <div className="calc-title">Lãi ròng tính thế nào</div>
            <CalcRow label="Doanh thu" sub={<>{cur.cups} phần<Change now={cur.revenue} before={old.revenue} prefix=" · " suffix={<> {vs}</>} /></>} value={cur.revenue} />
            <CalcRow minus label="Nguyên liệu của số ly đã bán" sub="Theo công thức × giá nguyên liệu" value={cur.cogs} />
            {cur.wasteCost > 0 && <CalcRow minus label="Hàng hủy" sub={`${wasteQty} phần`} value={cur.wasteCost} />}
            {shrink > 0 && <CalcRow minus label="Hao hụt kiểm kê" sub="Đếm thực tế thiếu so với sổ" value={shrink} />}
            {other > 0 && <CalcRow minus label="Chi phí khác" sub="Mặt bằng, điện, nước đá…" value={other} />}
            {direct > 0 && <CalcRow minus label="Nguyên liệu tính lúc mua" sub="Sữa đặc, đường… nhập trong kỳ" value={direct} />}
            <CalcRow total label="Lãi ròng" value={net} />
            <p className="calc-note">
              Tiền nhập hàng bình thường <b>không</b> trừ thẳng vào lãi: nó trừ dần theo từng ly bán ra (dòng “Nguyên liệu của số ly đã bán”). Riêng
              nguyên liệu đặt “Tính 1 lần lúc mua” thì trừ ngay khi nhập.
            </p>
          </div>
          <div className="card calc">
            <div className="calc-title">Tiền còn lại (tiền thực tế)</div>
            <CalcRow label="Doanh thu" value={cur.revenue} />
            <CalcRow minus label="Tiền nhập hàng (đi chợ)" value={bought} />
            {other > 0 && <CalcRow minus label="Chi phí khác" value={other} />}
            <CalcRow total label="Tiền còn lại" value={cash} />
            {closings.length > 0 && (
              <p className="calc-note">
                Đã chốt {closings.length} ngày: tiền mặt {money(sum(closings, (r) => Number(r.cash)))} · chuyển khoản{' '}
                {money(sum(closings, (r) => Number(r.transfer)))} (chỉ để đối chiếu).
              </p>
            )}
          </div>
        </div>
      )}

      {days.length > 1 && days.length <= 62 && (
        <section className="section">
          <div className="section-head">
            <h2>Doanh thu theo ngày</h2>
          </div>
          <div className="card">
            <BarChart days={days} values={perDay} />
          </div>
        </section>
      )}

      <Traffic />

      <section className="section">
        <div className="section-head">
          <h2>Món bán chạy</h2>
        </div>
        {top.length === 0 ? (
          <p className="muted">Chưa có dữ liệu bán hàng trong khoảng này.</p>
        ) : (
          <ol className="card top-list">
            {top.map((p, i) => (
              <li key={p.name} className="top-item">
                <span className={`top-rank ${i < 3 ? 'gold' : ''}`}>{i + 1}</span>
                <div className="top-main">
                  <div className="top-row">
                    <strong className="top-name">{p.name}</strong>
                    <strong className="top-money">{money(p.revenue)}</strong>
                  </div>
                  <div className="top-row muted small">
                    <span>
                      {packText(p.ly, p.chai)}
                      {p.prevQty ? <Change now={p.qty} before={p.prevQty} prefix=" · " /> : <span> · mới</span>}
                    </span>
                    <span className={p.profit < 0 ? 'danger-text' : 'good-text'}>lãi {moneyShort(p.profit)}</span>
                  </div>
                  <div className="top-bar" aria-hidden="true">
                    <span style={{ width: `${(p.revenue / Math.max(1, top[0].revenue)) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

// Vài câu nhận xét dễ hiểu cho người không rành số liệu
function insights({ cur, old, net, top, other, perCup, needPerDay, soldPerDay, wasteQty, made }) {
  if (cur.cups === 0) return [{ text: 'Chưa có số bán trong khoảng thời gian này.' }]
  const out = []
  if (old.revenue > 0) {
    const pct = ((cur.revenue - old.revenue) / old.revenue) * 100
    if (Math.abs(pct) >= 1)
      out.push({
        text: `Bán được ${pct > 0 ? 'nhiều hơn' : 'ít hơn'} kỳ trước ${num(Math.abs(pct), 0)}%.`,
        tone: pct > 0 ? 'good' : 'danger',
      })
    else out.push({ text: 'Bán được gần bằng kỳ trước.' })
  }
  if (perCup > 0) out.push({ text: `Mỗi phần bán ra lãi trung bình ${money(perCup)} (chưa trừ chi phí khác).` })
  if (net < 0) {
    out.push({ text: `Đang lỗ ${money(-net)}: chi phí khác (${money(other)}) nhiều hơn tiền lãi từ bán hàng.`, tone: 'danger' })
    if (needPerDay > 0)
      out.push({ text: `Cần bán khoảng ${num(Math.ceil(needPerDay))} phần/ngày để hòa vốn (đang bán ${num(soldPerDay, 1)} phần/ngày).` })
  }
  if (top[0]) out.push({ text: `Bán chạy nhất: ${top[0].name} (${num(top[0].qty)} phần).` })
  if (made > 0 && wasteQty / made > 0.05)
    out.push({ text: `Hàng hủy hơi nhiều (${num((wasteQty / made) * 100, 0)}% số làm ra), nên nấu ít lại một chút.`, tone: 'danger' })
  return out
}

function exportExcel(range, data) {
  const { sales, purchases, expenses, waste, counts, closings } = data
  const cur = summarize(sales, waste)
  const bought = sum(purchases, (r) => Number(r.total))
  const other = sum(expenses, (r) => Number(r.amount))
  const shrink = shrinkOf(counts)
  const direct = directBuy(purchases)
  const r0 = Math.round
  const sheets = [
    {
      name: 'Tổng hợp',
      rows: [
        ['Chỉ số', 'Số tiền'],
        ['Từ ngày', dmy(range.from)],
        ['Đến ngày', dmy(range.to)],
        ['Số phần bán', cur.cups],
        ['Doanh thu', r0(cur.revenue)],
        ['Giá vốn hàng bán (gồm tặng)', r0(cur.cogs)],
        ['Hàng hủy', r0(cur.wasteCost)],
        ['Lãi gộp', r0(cur.gross)],
        ['Hao hụt kiểm kê', r0(shrink)],
        ['Chi phí khác', r0(other)],
        ['Nguyên liệu tính lúc mua', r0(direct)],
        ['Lãi ròng', r0(cur.gross - shrink - other - direct)],
        ['Tiền nhập nguyên liệu', r0(bought)],
        ['Tiền còn lại', r0(cur.revenue - bought - other)],
      ],
    },
    {
      name: 'Bán hàng',
      rows: [
        ['Ngày', 'Món', 'Nguồn', 'Số lượng', 'Tặng', 'Đơn giá', 'Giảm giá', 'Doanh thu', 'Giá vốn', 'Lãi gộp'],
        ...sales.map((r) => [
          dmy(r.date),
          r.product_name,
          r.source.startsWith('quick:') ? `Đơn quầy #${r.source.split(':')[1]}` : r.source ? `Đơn đặt #${r.source.split(':')[1]}` : 'Tại quán',
          r.quantity,
          r.gift_qty || 0,
          r0(r.unit_price),
          r0(r.discount || 0),
          r0(saleRevenue(r)),
          r0(saleCost(r)),
          r0(saleRevenue(r) - saleCost(r)),
        ]),
      ],
    },
    {
      name: 'Nhập hàng',
      rows: [
        ['Ngày', 'Nguyên liệu', 'Số lượng', 'Đơn vị', 'Tổng tiền', 'Ghi chú'],
        ...purchases.map((r) => [dmy(r.date), r.item_name, Number(r.quantity), r.unit, r0(r.total), r.note || '']),
      ],
    },
    {
      name: 'Chi phí khác',
      rows: [['Ngày', 'Loại', 'Số tiền', 'Ghi chú'], ...expenses.map((r) => [dmy(r.date), r.category, r0(r.amount), r.note || ''])],
    },
    {
      name: 'Hàng hủy',
      rows: [
        ['Ngày', 'Món', 'Số lượng', 'Giá vốn / phần', 'Thành tiền', 'Lý do'],
        ...waste.map((r) => [dmy(r.date), r.product_name, r.quantity, r0(r.unit_cost), r0(r.quantity * r.unit_cost), r.reason || '']),
      ],
    },
    {
      name: 'Kiểm kê',
      rows: [
        ['Ngày', 'Nguyên liệu', 'Đơn vị', 'Sổ sách', 'Thực tế', 'Chênh lệch', 'Tiền chênh lệch'],
        ...counts.map((r) => [
          dmy(r.date),
          r.ingredients?.name || '',
          r.ingredients?.unit || '',
          Number(r.expected),
          Number(r.counted),
          Number(r.counted) - Number(r.expected),
          r0((r.counted - r.expected) * r.unit_price),
        ]),
      ],
    },
    {
      name: 'Chốt tiền',
      rows: [
        ['Ngày', 'Tiền mặt', 'Chuyển khoản', 'Tổng', 'Ghi chú'],
        ...closings.map((r) => [dmy(r.date), r0(r.cash), r0(r.transfer), r0(Number(r.cash) + Number(r.transfer)), r.note || '']),
      ],
    },
  ]
  downloadXlsx(`sua-hat_${range.from}_${range.to}.xlsx`, sheets)
}

