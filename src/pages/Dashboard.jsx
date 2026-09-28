import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { showError, supabase } from '../lib/supabase'
import { addDays, daysBetween, fmtDate, fmtTime, money, moneyShort, monthRange, num, todayStr } from '../lib/format'
import { Loading, PageHeader, StatTile } from '../components/ui'
import { STATUS } from './CalendarPage'

const PRESETS = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: 'month', label: 'Tháng này' },
  { key: 'lastmonth', label: 'Tháng trước' },
  { key: 'custom', label: 'Tùy chọn' },
]

function presetRange(key) {
  const t = todayStr()
  if (key === 'today') return { from: t, to: t }
  if (key === '7d') return { from: addDays(t, -6), to: t }
  if (key === 'month') return { from: monthRange(t.slice(0, 7)).from, to: t }
  const firstThis = monthRange(t.slice(0, 7)).from
  return monthRange(addDays(firstThis, -1).slice(0, 7))
}

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0)

export default function Dashboard() {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(presetRange('month'))
  const [data, setData] = useState(null)
  const [upcoming, setUpcoming] = useState([])

  function choose(key) {
    setPreset(key)
    if (key !== 'custom') setRange(presetRange(key))
  }

  useEffect(() => {
    let cancelled = false
    setData(null)
    const { from, to } = range
    Promise.all([
      supabase.from('sales').select('date,product_name,quantity,unit_price,unit_cost').gte('date', from).lte('date', to),
      supabase.from('purchases').select('date,total').gte('date', from).lte('date', to),
      supabase.from('expenses').select('date,amount').gte('date', from).lte('date', to),
    ]).then(([s, p, e]) => {
      if (cancelled || showError(s.error || p.error || e.error)) return
      setData({ sales: s.data, purchases: p.data, expenses: e.data })
    })
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
  }, [])

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Doanh thu, chi phí và lãi của quán" />

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
                  {o.items && <div className="muted small clamp">{o.items.replace(/\n+/g, ', ')}</div>}
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

function Report({ data, range }) {
  const { sales, purchases, expenses } = data
  const revenue = sum(sales, (r) => r.quantity * r.unit_price)
  const cogs = sum(sales, (r) => r.quantity * r.unit_cost)
  const cups = sum(sales, (r) => r.quantity)
  const bought = sum(purchases, (r) => Number(r.total))
  const other = sum(expenses, (r) => Number(r.amount))
  const gross = revenue - cogs
  const net = revenue - bought - other

  const byProduct = {}
  sales.forEach((r) => {
    const p = (byProduct[r.product_name] ||= { name: r.product_name, qty: 0, revenue: 0, profit: 0 })
    p.qty += r.quantity
    p.revenue += r.quantity * r.unit_price
    p.profit += r.quantity * (r.unit_price - r.unit_cost)
  })
  const top = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue)

  const days = daysBetween(range.from, range.to)
  const perDay = Object.fromEntries(days.map((d) => [d, 0]))
  sales.forEach((r) => (perDay[r.date] = (perDay[r.date] || 0) + r.quantity * r.unit_price))

  return (
    <>
      <div className="stats">
        <StatTile label="Doanh thu" value={money(revenue)} note={`${cups} phần đã bán`} />
        <StatTile label="Lãi gộp" value={money(gross)} note={`Doanh thu − giá vốn ${money(cogs)}`} tone={gross >= 0 ? 'good' : 'bad'} />
        <StatTile label="Tiền nhập nguyên liệu" value={money(bought)} />
        <StatTile label="Chi phí khác" value={money(other)} />
        <StatTile
          label="Lãi thực (dòng tiền)"
          value={money(net)}
          note="Doanh thu − nhập hàng − chi phí khác"
          tone={net >= 0 ? 'good' : 'bad'}
        />
      </div>

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
                  <th className="num">Doanh thu</th>
                  <th className="num">Lãi gộp</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{num(p.qty)}</td>
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
