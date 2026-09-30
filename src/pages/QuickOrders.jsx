import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { money, todayStr } from '../lib/format'
import { saleCost, saleRevenue } from '../lib/cost'
import { completeQuickOrder, linesProfit, missingTable, reopenQuickOrder } from '../lib/quick'
import { OrderCard, orderLabel } from '../components/QuickOrder'
import { DateNav, Empty, Loading, PageHeader, StatTile } from '../components/ui'

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0)

export default function QuickOrders() {
  const [date, setDate] = useState(todayStr())
  const [tab, setTab] = useState('pending')
  const [data, setData] = useState(null)
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async (date, cancelled = () => false) => {
    const [p, d, s] = await Promise.all([
      supabase.from('quick_orders').select('*').eq('status', 'pending').order('id'),
      supabase.from('quick_orders').select('*').eq('status', 'done').eq('date', date).order('done_at', { ascending: false }),
      supabase.from('sales').select('*').eq('date', date),
    ])
    if (cancelled()) return
    if (missingTable(p.error)) return setNeedsUpgrade(true)
    if (showError(p.error || d.error || s.error)) return
    setData({ pending: p.data, done: d.data, sales: s.data })
  }, [])

  useEffect(() => {
    let cancelled = false
    load(date, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [date, load])

  async function run(order, fn) {
    setBusy(order.id)
    const error = await fn(order)
    setBusy(null)
    showError(error)
    load(date)
  }

  if (needsUpgrade)
    return (
      <>
        <PageHeader title="Đơn bán" />
        <div className="callout">
          Cần chạy file <code>supabase/nang-cap-v3.sql</code> trong Supabase → SQL Editor 1 lần để dùng Lập đơn nhanh.
        </div>
      </>
    )
  if (!data) return <Loading />

  const { pending, done, sales } = data
  const revenue = sum(sales, saleRevenue)
  const profit = revenue - sum(sales, saleCost)
  const chai = sum(sales, (r) => (r.pack === 'chai' ? r.quantity : 0))
  const ly = sum(sales, (r) => r.quantity) - chai
  const list = tab === 'pending' ? pending : done

  return (
    <>
      <PageHeader title="Đơn bán" subtitle="Mọi đơn lập ở quầy: đang chờ giao và đã xong">
        <Link to="/ban-hang" className="btn btn-primary">
          Về Bán hàng
        </Link>
      </PageHeader>

      <DateNav date={date} onChange={setDate} />

      <div className="stats">
        <StatTile label="Doanh thu" value={money(revenue)} note={`${done.length} đơn quầy đã xong`} />
        <StatTile label="Lãi tạm tính" value={money(profit)} note="Doanh thu − giá vốn (chưa trừ hủy)" tone="good" />
        <StatTile label="Ly đã bán" value={ly} />
        <StatTile label="Chai đã bán" value={chai} />
      </div>
      <p className="muted small" style={{ margin: '8px 0 16px' }}>
        Số liệu gồm mọi nguồn bán trong ngày (đơn quầy, đơn đặt, bán lẻ). Bán lẻ kiểu cũ không ghi loại được tính là Ly.
      </p>

      <div className="tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Đang chờ ({pending.length})
        </button>
        <button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>
          Đã xong trong ngày ({done.length})
        </button>
      </div>

      {tab === 'pending' && pending.length > 0 && (
        <p className="muted small" style={{ marginBottom: 10 }}>
          Tổng đơn chờ {money(sum(pending, (o) => Number(o.total)))} · lãi dự kiến {money(sum(pending, (o) => linesProfit(o.lines)))}. Đơn chờ
          hiện ở mọi ngày cho tới khi bấm xong.
        </p>
      )}

      {list.length === 0 ? (
        <Empty icon={ClipboardList}>{tab === 'pending' ? 'Không có đơn nào đang chờ.' : 'Chưa có đơn quầy nào xong trong ngày này.'}</Empty>
      ) : (
        <div className="qorder-grid">
          {list.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              showProfit
              busy={busy === o.id}
              onDone={() => run(o, completeQuickOrder)}
              onReopen={() =>
                confirm(`Mở lại "${orderLabel(o)}"? Tiền của đơn sẽ bị trừ khỏi doanh thu cho tới khi bấm "Đã xong" lại.`) &&
                run(o, reopenQuickOrder)
              }
            />
          ))}
        </div>
      )}
    </>
  )
}
