import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleQuestionMark, Download, TriangleAlert } from 'lucide-react'
import { fetchAll, getSetting, showError, supabase } from '../lib/supabase'
import { loadStockCached } from '../lib/stock'
import { DEFAULT_MARGIN, productCost, saleCost, saleRevenue, soldQty, toMap } from '../lib/cost'
import { presetRange, prevRange, profitReport, sum, summarize } from '../lib/report'
import { loadChecks } from '../lib/checks'
import { orderItemsText } from '../lib/orders'
import { packText } from '../lib/quick'
import { downloadXlsx } from '../lib/xlsx'
import { applyRecurring } from '../lib/recurring'
import { cached, peek } from '../lib/cache'
import { useLive } from '../lib/live'
import { addDays, daysBetween, fmtDate, fmtQty, fmtTime, money, moneyShort, num, periodRange, todayStr } from '../lib/format'
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

// Tuần này (thứ 2 → hôm nay) so với cùng các ngày tuần trước — luôn hiện, không phụ thuộc kỳ đang xem
async function fetchWeek() {
  const t = todayStr()
  const now = { from: periodRange('week', t).from, to: t }
  const before = prevRange(now)
  const [a, b] = await Promise.all([loadRange(now, false), loadRange(before, false)])
  return { now: { ...summarize(a.sales, a.waste), range: now }, before: { ...summarize(b.sales, b.waste), range: before } }
}

const dm = (s) => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}`

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

// cảnh báo: nguyên liệu sắp hết, món lãi mỏng, đơn bị bỏ quên
async function fetchAlerts() {
  const t = todayStr()
  const pendingBefore = (table, col) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('status', 'pending').lt(col, t)
  const [st, margin, qo, po] = await Promise.all([
    loadStockCached(),
    getSetting('margin_min', DEFAULT_MARGIN),
    pendingBefore('quick_orders', 'date'),
    pendingBefore('orders', 'order_date'),
  ])
  // đơn chưa bấm "Đã xong" thì chưa có doanh thu và chưa trừ kho (lỗi = chưa có bảng → bỏ qua)
  const stale = { quick: qo.error ? 0 : qo.count || 0, pre: po.error ? 0 : po.count || 0 }
  const ingMap = toMap(st.ingredients)
  const recMap = toMap(st.recipes)
  const low = st.ingredients.filter((g) => !g.no_stock && g.min_stock > 0 && st.stock[g.id] < g.min_stock)
  const thin = st.products
    .filter((p) => p.active && p.price > 0)
    .map((p) => ({ ...p, pct: ((p.price - productCost(p, ingMap, recMap)) / p.price) * 100 }))
    .filter((p) => p.pct < Number(margin))
  return { low, thin, stale, stock: st.stock, margin }
}

export default function Dashboard() {
  // số của lần xem trước hiện ngay, tải mới ngầm phía sau
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(presetRange('month'))
  const [data, setData] = useState(() => peek(reportKey(presetRange('month'))) || null)
  const [upcoming, setUpcoming] = useState(() => peek('dash-upcoming') || [])
  const [alerts, setAlerts] = useState(() => peek('dash-alerts') || null)
  const [week, setWeek] = useState(() => peek('dash-week') || null)
  const [checks, setChecks] = useState(() => peek('checks') || null)
  const [tick, setTick] = useState(0) // tăng lên khi có dữ liệu mới → tải lại
  useLive(
    ['sales', 'waste', 'purchases', 'expenses', 'stock_counts', 'day_closings', 'orders', 'quick_orders', 'products', 'ingredients', 'recipes', 'settings'],
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
    cached('dash-week', fetchWeek).then(setWeek, (e) => console.error(e))
    // tồn kho tính khá nặng: dùng lại trong 2 phút
    cached('dash-alerts', fetchAlerts, 120000).then(setAlerts, (e) => console.error(e))
    // quét số liệu khá nặng: dùng lại trong 5 phút
    loadChecks(300000).then(setChecks, (e) => console.error(e))
  }, [tick])

  // chỉ nhắc ở Tổng quan những chỗ đang làm sai số (chi tiết + mục "nên xem" ở trang Kiểm tra số liệu)
  const wrong = (checks || []).filter((i) => i.level === 'error')

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

      {((alerts && (alerts.low.length > 0 || alerts.thin.length > 0 || alerts.stale?.quick > 0 || alerts.stale?.pre > 0)) || wrong.length > 0) && (
        <div className="card alert-card">
          <strong>
            <TriangleAlert size={18} className="inline-icon" /> Cần chú ý
          </strong>
          {wrong.length > 0 && (
            <Link to="/kiem-tra" className="alert-row">
              <span>
                <b>Kiểm tra số liệu: {wrong.length} việc cần sửa để số đúng</b>
              </span>
              <span className="muted">{wrong.map((i) => i.title).join(' · ')}</span>
            </Link>
          )}
          {alerts.stale?.quick > 0 && (
            <Link to="/ban-hang" className="alert-row">
              <span>{alerts.stale.quick} đơn nhanh từ hôm trước chưa bấm “Đã xong”</span>
              <span className="muted">chưa tính tiền, chưa trừ kho</span>
            </Link>
          )}
          {alerts.stale?.pre > 0 && (
            <Link to="/lich" className="alert-row">
              <span>{alerts.stale.pre} đơn đặt trước quá ngày giao vẫn đang chờ</span>
              <span className="muted">chưa tính tiền, chưa trừ kho</span>
            </Link>
          )}
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

      {week && preset !== 'week' && <WeekCompare week={week} />}

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

function WeekCompare({ week }) {
  const { now, before } = week
  const span = (r) => (r.from === r.to ? dm(r.from) : `${dm(r.from)}–${dm(r.to)}`)
  const rows = [
    { label: 'Doanh thu', now: now.revenue, before: before.revenue, fmt: money },
    { label: 'Số phần bán', now: now.cups, before: before.cups, fmt: (v) => num(v) },
    { label: 'Lãi gộp', now: now.gross, before: before.gross, fmt: money },
  ]
  return (
    <div className="card week-compare">
      <div className="week-compare-head">
        <strong>Tuần này so với tuần trước</strong>
        <span className="muted small">
          {span(now.range)} · {span(before.range)}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="week-row">
          <span className="muted">{r.label}</span>
          <span className="week-val">
            <strong>{r.fmt(r.now)}</strong>
            <span className="muted small"> / {r.fmt(r.before)}</span>
          </span>
          <span className="week-change">{r.before ? <Change now={r.now} before={r.before} /> : <span className="muted small">—</span>}</span>
        </div>
      ))}
      <span className="muted small">Lãi gộp = bán được − nguyên liệu − hàng hủy (chưa trừ chi phí khác)</span>
    </div>
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
  const { sales, waste, closings, prev } = data
  const days = daysBetween(range.from, range.to)
  const { cur, bought, other, shrink, direct, net, cash, perCup, needPerDay, soldPerDay } = profitReport(data, days.length)
  const old = summarize(prev.sales, prev.waste)
  const wasteQty = sum(waste, (r) => r.quantity)
  const made = cur.cups + cur.wsQty + sum(sales, (r) => r.gift_qty || 0) + wasteQty


  const vs = <span className="muted">so với {prev.range.from === prev.range.to ? dm(prev.range.from) : `${dm(prev.range.from)}–${dm(prev.range.to)}`}</span>

  // gộp theo món (Ly + Chai chung 1 dòng), tách số ly / chai để xem
  const byProduct = {}
  const addTo = (rows, key) =>
    rows.forEach((r) => {
      const name = r.product_name.replace(/\s\((Ly|Chai)\)$/, '')
      const p = (byProduct[r.product_id || name] ||= { name, qty: 0, ly: 0, chai: 0, ws: 0, revenue: 0, profit: 0, prevQty: 0 })
      if (key === 'prevQty') p.prevQty += soldQty(r)
      else {
        p.qty += soldQty(r)
        p[r.pack === 'chai' ? 'chai' : 'ly'] += soldQty(r)
        if (r.wholesale) p.ws += r.quantity
        p.revenue += saleRevenue(r)
        p.profit += saleRevenue(r) - saleCost(r)
      }
    })
  addTo(sales, 'cur')
  addTo(prev.sales, 'prevQty')
  const top = Object.values(byProduct)
    .filter((p) => p.qty > 0 || p.ws > 0)
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
              {cur.wsQty > 0 && ` + ${num(cur.wsQty)} sỉ`}
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
            <CalcRow label="Doanh thu" sub={<>{cur.cups} phần{cur.wsQty > 0 && ` + ${num(cur.wsQty)} sỉ`}<Change now={cur.revenue} before={old.revenue} prefix=" · " suffix={<> {vs}</>} /></>} value={cur.revenue} />
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
                      {[packText(p.ly, p.chai), p.ws > 0 && `sỉ ${num(p.ws)}`].filter(Boolean).join(' · ')}
                      {p.prevQty ? <Change now={p.qty} before={p.prevQty} prefix=" · " /> : p.qty > 0 && <span> · mới</span>}
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
  if (cur.cups === 0 && cur.wsQty === 0) return [{ text: 'Chưa có số bán trong khoảng thời gian này.' }]
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
  if (cur.wsQty > 0)
    out.push({ text: `Bán sỉ ${num(cur.wsQty)} phần, thu ${money(cur.wsRevenue)}, lãi ${money(cur.wsGross)} (không tính vào số phần bán).` })
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
  const { cur, bought, other, shrink, direct, net, cash } = profitReport(data, daysBetween(range.from, range.to).length)
  const r0 = Math.round
  const sheets = [
    {
      name: 'Tổng hợp',
      rows: [
        ['Chỉ số', 'Số tiền'],
        ['Từ ngày', dmy(range.from)],
        ['Đến ngày', dmy(range.to)],
        ['Số phần bán (lẻ)', cur.cups],
        ['Số phần bán sỉ', cur.wsQty],
        ['Doanh thu bán sỉ', r0(cur.wsRevenue)],
        ['Doanh thu', r0(cur.revenue)],
        ['Giá vốn hàng bán (gồm tặng)', r0(cur.cogs)],
        ['Hàng hủy', r0(cur.wasteCost)],
        ['Lãi gộp', r0(cur.gross)],
        ['Hao hụt kiểm kê', r0(shrink)],
        ['Chi phí khác', r0(other)],
        ['Nguyên liệu tính lúc mua', r0(direct)],
        ['Lãi ròng', r0(net)],
        ['Tiền nhập nguyên liệu', r0(bought)],
        ['Tiền còn lại', r0(cash)],
      ],
    },
    {
      name: 'Bán hàng',
      rows: [
        ['Ngày', 'Món', 'Nguồn', 'Số lượng', 'Tặng', 'Đơn giá', 'Giảm giá', 'Doanh thu', 'Giá vốn', 'Lãi gộp'],
        ...sales.map((r) => [
          dmy(r.date),
          r.product_name,
          (r.source.startsWith('quick:') ? `Đơn quầy #${r.source.split(':')[1]}` : r.source ? `Đơn đặt #${r.source.split(':')[1]}` : 'Tại quán') +
            (r.wholesale ? ' (sỉ)' : ''),
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

