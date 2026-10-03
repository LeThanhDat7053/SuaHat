import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchAll, showError, supabase } from '../lib/supabase'
import { addDays, daysBetween, fmtDateLong, money, moneyShort, monthRange, num, parseDate, todayStr } from '../lib/format'
import { cached, peek } from '../lib/cache'
import { useLive } from '../lib/live'
import BarChart from './BarChart'

// Kỳ xem riêng của biểu đồ khách (không theo kỳ của Tổng quan)
const RANGES = [
  ['today', 'Hôm nay'],
  ['yesterday', 'Hôm qua'],
  ['7d', '7 ngày'],
  ['30d', '30 ngày'],
  ['month', 'Tháng này'],
  ['prevMonth', 'Tháng trước'],
]
function rangeOf(mode, day) {
  const t = todayStr()
  if (mode === 'today') return { from: t, to: t }
  if (mode === 'yesterday') return { from: addDays(t, -1), to: addDays(t, -1) }
  if (mode === '7d') return { from: addDays(t, -6), to: t }
  if (mode === '30d') return { from: addDays(t, -29), to: t }
  if (mode === 'month') return monthRange(t.slice(0, 7))
  if (mode === 'prevMonth') return monthRange(addDays(t.slice(0, 7) + '-01', -1).slice(0, 7))
  return { from: day, to: day } // 'day': ngày tự chọn
}

const VIEWS = [
  ['hour', 'Theo giờ'],
  ['weekday', 'Theo thứ'],
  ['heat', 'Giờ × thứ'],
]
const METRICS = [
  ['orders', 'Số đơn'],
  ['cups', 'Ly / chai'],
  ['money', 'Tiền'],
]
const UNIT = { orders: 'đơn', cups: 'ly/chai' }
// Thứ 2 → Chủ nhật (getDay: 0 = CN)
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const WD = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' }
const WD_LONG = { 0: 'Chủ nhật', 1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7' }

async function fetchQuick(from, to) {
  const { data, error } = await fetchAll(() =>
    supabase.from('quick_orders').select('id,date,created_at,lines,total').eq('status', 'done').gte('date', from).lte('date', to).order('id'),
  )
  if (error) throw error
  return data
}

const empty = () => ({ orders: 0, cups: 0, money: 0 })
function add(s, o) {
  s.orders += 1
  s.cups += (o.lines || []).reduce((n, l) => n + (Number(l.qty) || 0), 0)
  s.money += Number(o.total) || 0
}

// Khách đông lúc nào: đếm đơn lập ở quầy theo giờ lập đơn (giờ khách tới gọi món)
export default function Traffic() {
  const [mode, setMode] = useState('7d')
  const [day, setDay] = useState(todayStr())
  const [view, setView] = useState('hour')
  const [metric, setMetric] = useState('orders')
  const { from, to } = rangeOf(mode, day)
  const key = `traffic:${from}:${to}`
  const [rows, setRows] = useState(() => peek(key) || null)

  function load() {
    cached(key, () => fetchQuick(from, to), 30000).then(setRows, (e) => {
      // chưa có bảng đơn quầy (chưa chạy nang-cap-v3.sql) → coi như chưa có đơn
      if (e?.code === 'PGRST205' || e?.code === '42P01') setRows([])
      else showError(e)
    })
  }
  useEffect(() => {
    setRows(peek(key) || null)
    load()
  }, [key])
  useLive(['quick_orders'], load)

  const single = from === to
  const shownView = single ? 'hour' : view
  const today = todayStr()
  const days = daysBetween(from, to < today ? to : today) // ngày đã qua trong kỳ (để tính trung bình)
  const fmt = metric === 'money' ? moneyShort : (v) => num(v, 1)
  const fmtFull = (s) => `${s.orders} đơn · ${s.cups} ly/chai · ${money(s.money)}`

  // gom số liệu
  const byHour = {}
  const byWd = {}
  const byCell = {}
  ;(rows || []).forEach((o) => {
    const t = new Date(o.created_at)
    const h = t.getHours()
    const wd = parseDate(o.date).getDay()
    add((byHour[h] ||= empty()), o)
    add((byWd[wd] ||= empty()), o)
    add((byCell[`${wd}:${h}`] ||= empty()), o)
  })
  const hrs = Object.keys(byHour).map(Number)
  const hFrom = Math.min(6, ...hrs)
  const hTo = Math.max(21, ...hrs)
  const hours = Array.from({ length: hTo - hFrom + 1 }, (_, i) => hFrom + i)
  // mỗi thứ xuất hiện mấy lần trong kỳ → trung bình 1 ngày thứ đó
  const wdCount = {}
  days.forEach((d) => (wdCount[parseDate(d).getDay()] = (wdCount[parseDate(d).getDay()] || 0) + 1))
  const total = (rows || []).length
  const peakHours = [...hrs].sort((a, b) => byHour[b][metric] - byHour[a][metric]).slice(0, 3)
  const wdAvg = (wd) => (wdCount[wd] ? (byWd[wd]?.[metric] || 0) / wdCount[wd] : 0)
  const peakWd = WEEK.filter((wd) => byWd[wd]).sort((a, b) => wdAvg(b) - wdAvg(a))[0]

  return (
    <section className="section traffic">
      <div className="section-head">
        <h2>Khách đông lúc nào</h2>
      </div>

      <div className="chips traffic-ranges">
        {RANGES.map(([k, label]) => (
          <button key={k} type="button" className={`chip ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
        <label className={`chip chip-date ${mode === 'day' ? 'active' : ''}`}>
          Chọn ngày
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => {
              if (!e.target.value) return
              setDay(e.target.value)
              setMode('day')
            }}
            aria-label="Chọn ngày"
          />
        </label>
      </div>

      <div className="traffic-controls">
        {single ? (
          <div className="traffic-day">
            <button type="button" className="icon-btn" onClick={() => (setDay(addDays(from, -1)), setMode('day'))} aria-label="Ngày trước">
              <ChevronLeft size={18} />
            </button>
            <strong>{from === today ? 'Hôm nay' : fmtDateLong(from)}</strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => (setDay(addDays(from, 1)), setMode('day'))}
              disabled={from >= today}
              aria-label="Ngày sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <div className="seg" role="group" aria-label="Kiểu xem">
            {VIEWS.map(([k, label]) => (
              <button key={k} type="button" className={view === k ? 'active' : ''} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="seg" role="group" aria-label="Đếm theo">
          {METRICS.map(([k, label]) => (
            <button key={k} type="button" className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!rows ? (
          <p className="muted small">Đang tải…</p>
        ) : total === 0 ? (
          <p className="muted small">Chưa có đơn lập ở quầy trong khoảng này. Bán bằng “Lập đơn” thì app biết giờ khách tới.</p>
        ) : (
          <>
            <p className="hour-peak">
              {shownView === 'weekday' ? (
                peakWd !== undefined && (
                  <>
                    Đông nhất: <b>{WD_LONG[peakWd]}</b> (TB {metric === 'money' ? money(wdAvg(peakWd)) : `${num(wdAvg(peakWd), 1)} ${UNIT[metric]}`} / ngày)
                  </>
                )
              ) : (
                <>
                  Đông nhất:{' '}
                  {peakHours.map((h, i) => (
                    <span key={h}>
                      {i > 0 && ' · '}
                      <b>
                        {h}h–{h + 1}h
                      </b>{' '}
                      ({metric === 'money' ? moneyShort(byHour[h].money) : `${byHour[h][metric]} ${UNIT[metric]}`})
                    </span>
                  ))}
                </>
              )}
            </p>

            {shownView === 'hour' && (
              <BarChart
                days={hours}
                values={Object.fromEntries(hours.map((h) => [h, byHour[h]?.[metric] || 0]))}
                yFmt={fmt}
                xLabel={(h) => `${h}h`}
                tip={(h) => (
                  <>
                    <span className="muted">
                      {h}h–{h + 1}h
                    </span>
                    <strong>{fmtFull(byHour[h] || empty())}</strong>
                    {days.length > 1 && <span className="small">TB {num((byHour[h]?.orders || 0) / days.length, 1)} đơn/ngày</span>}
                  </>
                )}
              />
            )}

            {shownView === 'weekday' && (
              <BarChart
                days={WEEK}
                values={Object.fromEntries(WEEK.map((wd) => [wd, wdAvg(wd)]))}
                yFmt={fmt}
                xLabel={(wd) => WD[wd]}
                tip={(wd) => (
                  <>
                    <span className="muted">
                      {WD_LONG[wd]} · {wdCount[wd] || 0} ngày
                    </span>
                    <strong>TB {metric === 'money' ? money(wdAvg(wd)) : num(wdAvg(wd), 1)} / ngày</strong>
                    <span className="small">Cả kỳ: {fmtFull(byWd[wd] || empty())}</span>
                  </>
                )}
              />
            )}

            {shownView === 'heat' && <Heatmap hours={hours} byCell={byCell} metric={metric} fmt={fmt} />}

            <p className="muted small hour-note">
              {shownView === 'weekday' ? 'Trung bình 1 ngày của mỗi thứ. ' : ''}
              {shownView === 'heat' ? 'Ô càng đậm càng đông (cộng cả kỳ). ' : ''}
              Tính theo giờ lập đơn ở quầy ({total} đơn{days.length > 1 ? ` trong ${days.length} ngày` : ''}). Số gõ tay kiểu cũ và đơn đặt trước không
              có giờ nên không tính.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

// Bảng giờ × thứ: hàng = Thứ 2 → CN, cột = giờ. Màu càng đậm càng đông.
function Heatmap({ hours, byCell, metric, fmt }) {
  const [pick, setPick] = useState(null)
  const val = (wd, h) => byCell[`${wd}:${h}`]?.[metric] || 0
  const max = Math.max(1, ...WEEK.flatMap((wd) => hours.map((h) => val(wd, h))))
  const cell = pick && byCell[pick]
  const [pwd, ph] = pick ? pick.split(':').map(Number) : []
  return (
    <>
      <div className="heat-wrap">
        <table className="heat">
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h}>{h}h</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK.map((wd) => (
              <tr key={wd}>
                <th>{WD[wd]}</th>
                {hours.map((h) => {
                  const v = val(wd, h)
                  const k = `${wd}:${h}`
                  return (
                    <td key={h}>
                      <button
                        type="button"
                        className={`heat-cell ${pick === k ? 'on' : ''} ${v / max > 0.55 ? 'dark' : ''}`}
                        style={{ '--a': v ? 0.12 + (v / max) * 0.88 : 0 }}
                        onClick={() => setPick(pick === k ? null : k)}
                        aria-label={`${WD_LONG[wd]} ${h}h: ${v}`}
                      >
                        {v ? (metric === 'money' ? moneyShort(v) : fmt(v)) : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pick && (
        <p className="heat-pick small">
          <b>
            {WD_LONG[pwd]} {ph}h–{ph + 1}h
          </b>
          : {cell ? `${cell.orders} đơn · ${cell.cups} ly/chai · ${money(cell.money)} (cả kỳ)` : 'không có đơn'}
        </p>
      )}
    </>
  )
}
