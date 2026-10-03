import { useState } from 'react'
import { fmtDate, money, moneyShort } from '../lib/format'

// Biểu đồ cột dùng chung. keys: các cột · values: key → số · xLabel / tip: chữ dưới cột / khi bấm vào cột
export default function BarChart({ days: keys, values, xLabel, tip, yFmt = moneyShort }) {
  const days = keys
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
          <span key={t}>{yFmt(t)}</span>
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
                  {tip ? (
                    tip(d)
                  ) : (
                    <>
                      <span className="muted">{fmtDate(d)}</span>
                      <strong>{money(values[d])}</strong>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="chart-x">
          {days.map((d, i) => (
            <span key={d}>{i % labelEvery === 0 ? (xLabel ? xLabel(d) : `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`) : ''}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
