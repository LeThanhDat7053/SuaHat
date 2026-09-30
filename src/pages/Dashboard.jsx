import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleQuestionMark, Download, TriangleAlert } from 'lucide-react'
import { fetchAll, getSetting, showError, supabase } from '../lib/supabase'
import { loadStock } from '../lib/stock'
import { productCost, saleCost, saleRevenue, toMap } from '../lib/cost'
import { orderItemsText } from '../lib/orders'
import { downloadXlsx } from '../lib/xlsx'
import { applyRecurring } from '../lib/recurring'
import { addDays, daysBetween, fmtDate, fmtQty, fmtTime, money, moneyShort, monthRange, num, periodRange, todayStr } from '../lib/format'
import { Loading, PageHeader, StatTile } from '../components/ui'
import { STATUS } from './CalendarPage'
import { DEFAULT_MARGIN } from './Products'

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
const dmy = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

async function loadRange({ from, to }, full) {
  const q = (table, cols) =>
    fetchAll(() => supabase.from(table).select(cols).gte('date', from).lte('date', to).order('date').order('id'))
  const tables = full
    ? [q('sales', '*'), q('purchases', '*'), q('expenses', '*'), q('waste', '*'), q('stock_counts', '*, ingredients(name, unit)'), q('day_closings', '*')]
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

export default function Dashboard() {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(presetRange('month'))
  const [data, setData] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [alerts, setAlerts] = useState(null)

  function choose(key) {
    setPreset(key)
    if (key !== 'custom') setRange(presetRange(key))
  }

  useEffect(() => {
    let cancelled = false
    setData(null)
    const prev = prevRange(range)
    // ghi các chi phí định kỳ còn thiếu trước, để số liệu có luôn khoản hôm nay
    applyRecurring()
      .catch((e) => console.error(e))
      .then(() => Promise.all([loadRange(range, true), loadRange(prev, false)]))
      .then(
      ([cur, before]) => !cancelled && setData({ ...cur, prev: { ...before, range: prev } }),
      (e) => showError(e),
    )
    return () => {
      cancelled = true
    }
  }, [range])

  useEffect(() => {
    const t = todayStr()
    supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .gte('order_date', t)
      .lte('order_date', addDays(t, 7))
      .order('order_date')
      .order('order_time', { nullsFirst: true })
      .then(({ data, error }) => !showError(error) && setUpcoming(data))

    // cảnh báo: nguyên liệu sắp hết, món lãi mỏng
    Promise.all([loadStock(), getSetting('margin_min', DEFAULT_MARGIN)]).then(
      ([st, margin]) => {
        const ingMap = toMap(st.ingredients)
        const recMap = toMap(st.recipes)
        const low = st.ingredients.filter((g) => g.min_stock > 0 && st.stock[g.id] < g.min_stock)
        const thin = st.products
          .filter((p) => p.active && p.price > 0)
          .map((p) => ({ ...p, pct: ((p.price - productCost(p, ingMap, recMap)) / p.price) * 100 }))
          .filter((p) => p.pct < Number(margin))
        setAlerts({ low, thin, stock: st.stock, margin })
      },
      (e) => console.error(e),
    )
  }, [])

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
  const shrink = sum(counts, (r) => (r.expected - r.counted) * r.unit_price)
  const net = cur.gross - shrink - other
  const cash = cur.revenue - bought - other
  const wasteQty = sum(waste, (r) => r.quantity)
  const made = cur.cups + sum(sales, (r) => r.gift_qty || 0) + wasteQty

  const days = daysBetween(range.from, range.to)
  const perCup = cur.cups ? cur.gross / cur.cups : 0
  const needPerDay = perCup > 0 ? other / perCup / days.length : 0
  const soldPerDay = cur.cups / days.length

  const vs = <span className="muted">so với {prev.range.from === prev.range.to ? dm(prev.range.from) : `${dm(prev.range.from)}–${dm(prev.range.to)}`}</span>

  const byProduct = {}
  const addTo = (rows, key) =>
    rows.forEach((r) => {
      const p = (byProduct[r.product_name] ||= { name: r.product_name, qty: 0, revenue: 0, profit: 0, prevQty: 0 })
      if (key === 'prevQty') p.prevQty += r.quantity
      else {
        p.qty += r.quantity
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

  const lines = insights({ cur, old, net, top, other, perCup, needPerDay, soldPerDay, wasteQty, made })

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
        <StatTile label="Lãi" value={money(net)} note="Đã trừ nguyên liệu và chi phí" tone={net >= 0 ? 'good' : 'bad'} />
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
        {detail ? 'Thu gọn ▴' : 'Xem chi tiết các con số ▾'}
      </button>

      {detail && (
        <div className="stats">
          <StatTile
            label="Doanh thu"
            value={money(cur.revenue)}
            note={
              <>
                {cur.cups} phần
                <Change now={cur.revenue} before={old.revenue} prefix=" · " suffix={<> {vs}</>} />
              </>
            }
          />
          <StatTile
            label="Lãi gộp"
            value={money(cur.gross)}
            note={
              <>
                Trừ giá vốn {moneyShort(cur.cogs)} và hàng hủy
                <Change now={cur.gross} before={old.gross} prefix=" · " />
              </>
            }
            tone={cur.gross >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            label="Hàng hủy"
            value={money(cur.wasteCost)}
            note={wasteQty ? `${wasteQty} phần · ${num((wasteQty / made) * 100, 1)}% số làm ra` : 'Không có'}
            tone={made && wasteQty / made > 0.05 ? 'bad' : undefined}
          />
          <StatTile label="Hao hụt kiểm kê" value={money(shrink)} note={counts.length ? `${counts.length} lần kiểm` : 'Chưa kiểm kê trong kỳ'} />
          <StatTile label="Chi phí khác" value={money(other)} />
          <StatTile label="Lãi ước tính" value={money(net)} note="Lãi gộp − hao hụt − chi phí khác" tone={net >= 0 ? 'good' : 'bad'} />
          <StatTile label="Tiền nhập nguyên liệu" value={money(bought)} />
          <StatTile label="Lãi dòng tiền" value={money(cash)} note="Doanh thu − nhập hàng − chi phí khác" tone={cash >= 0 ? 'good' : 'bad'} />
          {closings.length > 0 && (
            <StatTile
              label="Tiền mặt / chuyển khoản"
              value={`${moneyShort(sum(closings, (r) => Number(r.cash)))} / ${moneyShort(sum(closings, (r) => Number(r.transfer)))}`}
              note={`${closings.length} ngày đã chốt · chỉ để đối chiếu, không cộng vào doanh thu`}
            />
          )}
          {other > 0 && perCup > 0 && (
            <StatTile
              label="Điểm hòa vốn"
              value={`${num(Math.ceil(needPerDay))} phần/ngày`}
              note={`Đang bán ${num(soldPerDay, 1)} phần/ngày · lãi gộp TB ${moneyShort(perCup)}/phần`}
              tone={soldPerDay >= needPerDay ? 'good' : 'bad'}
            />
          )}
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

      <section className="section">
        <div className="section-head">
          <h2>Món bán chạy</h2>
        </div>
        {top.length === 0 ? (
          <p className="muted">Chưa có dữ liệu bán hàng trong khoảng này.</p>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Món</th>
                  <th className="num">SL</th>
                  <th className="num">So kỳ trước</th>
                  <th className="num">Doanh thu</th>
                  <th className="num">Lãi gộp</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{num(p.qty)}</td>
                    <td className="num">{p.prevQty ? <Change now={p.qty} before={p.prevQty} /> : <span className="muted">mới</span>}</td>
                    <td className="num">{money(p.revenue)}</td>
                    <td className="num">{money(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const shrink = sum(counts, (r) => (r.expected - r.counted) * r.unit_price)
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
        ['Lãi ước tính', r0(cur.gross - shrink - other)],
        ['Tiền nhập nguyên liệu', r0(bought)],
        ['Lãi dòng tiền', r0(cur.revenue - bought - other)],
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

function BarChart({ days, values }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...days.map((d) => values[d]), 0)
  // làm tròn trục lên số "đẹp"
  const step = max > 0 ? Math.pow(10, Math.floor(Math.log10(max))) : 1
  const top = max > 0 ? Math.ceil(max / step) * step : 1
  const ticks = [top, top / 2, 0]
  const labelEvery = Math.ceil(days.length / 8)

  return (
    <div className="chart" onPointerLeave={() => setHover(null)}>
      <div className="chart-y">
        {ticks.map((t) => (
          <span key={t}>{moneyShort(t)}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-bars" style={{ gap: days.length > 31 ? 1 : 2 }}>
          {ticks.map((t) => (
            <div key={t} className="chart-grid" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          {days.map((d, i) => (
            <div
              key={d}
              className={`chart-col ${hover === i ? 'hover' : ''}`}
              onPointerEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            >
              <div className="chart-bar" style={{ height: `${(values[d] / top) * 100}%` }} />
              {hover === i && (
                <div className={`chart-tip ${i > days.length / 2 ? 'left' : ''}`}>
                  <span className="muted">{fmtDate(d)}</span>
                  <strong>{money(values[d])}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="chart-x">
          {days.map((d, i) => (
            <span key={d}>{i % labelEvery === 0 ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}` : ''}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
