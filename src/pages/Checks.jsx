import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, ShieldCheck } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { CHECKS_KEY, DAYS, LEVELS, loadChecks } from '../lib/checks'
import { removeJob, retryFailed, useOutbox } from '../lib/outbox'
import { completeQuickOrder, reopenQuickOrder } from '../lib/quick'
import { syncOrderSales } from '../lib/orders'
import { useLive } from '../lib/live'
import { peek } from '../lib/cache'
import { toast } from '../lib/toast'
import { Loading, PageHeader } from '../components/ui'

export default function Checks() {
  const [issues, setIssues] = useState(() => peek(CHECKS_KEY) || null)
  const [busy, setBusy] = useState(null) // id mục đang sửa
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState({}) // id mục → true / false (mặc định: mở mục sai số / nên xem, đóng mục để biết)
  const [all, setAll] = useState({}) // id mục → đang xem hết danh sách
  const outbox = useOutbox()

  useLive(['sales', 'waste', 'purchases', 'stock_counts', 'orders', 'quick_orders', 'products', 'ingredients', 'recipes'], () => setTick((t) => t + 1))
  useEffect(() => {
    loadChecks(0).then(setIssues, showError)
  }, [tick, outbox.jobs.length])

  async function run(key, fn, done) {
    setBusy(key)
    try {
      const error = await fn()
      if (!showError(error) && done) toast(done, 'good')
    } catch (e) {
      showError(e)
    }
    setBusy(null)
    setTick((t) => t + 1)
  }

  // Ghi lại doanh thu cho đơn đã giao mà thiếu dòng bán
  const resync = (item) =>
    run(
      item.key,
      async () => {
        if (item.kind === 'pre') return syncOrderSales(item.order)
        // đơn nhanh: đưa về "đang chờ" rồi bấm xong lại (giá, giá vốn lấy theo đơn lúc lập)
        return (await reopenQuickOrder(item.order)) || completeQuickOrder({ ...item.order, status: 'pending' })
      },
      'Đã ghi lại doanh thu',
    )

  // Dòng bán giá vốn 0đ → giá vốn theo công thức hiện tại
  const fixCost = (item) => {
    if (!confirm(`Tính giá vốn ${item.text} = ${item.cost.toLocaleString('vi-VN')}đ/phần (theo công thức hiện tại)?`)) return
    run(item.key, async () => (await supabase.from('sales').update({ unit_cost: item.cost }).in('id', item.ids)).error, 'Đã sửa giá vốn')
  }

  const discard = (item) => {
    if (!confirm(`Bỏ "${item.text}"? Thao tác này sẽ không được ghi vào database.`)) return
    if (!removeJob(item.key)) toast('Đang gửi, thử lại sau giây lát.', 'warn')
  }

  const serious = issues?.filter((i) => i.level !== 'info') || []
  const byLevel = (lv) => issues?.filter((i) => i.level === lv).reduce((n, i) => n + i.items.length, 0) || 0
  const isOpen = (issue) => open[issue.id] ?? issue.level !== 'info'
  const SHOW = 5 // danh sách dài thì hiện 5 dòng đầu, bấm "Xem thêm"

  return (
    <>
      <PageHeader title="Kiểm tra số liệu" subtitle={`Tự quét những chỗ làm số tiền, tồn kho bị sai (đơn và dòng bán ${DAYS} ngày gần nhất)`}>
        <button type="button" className="btn btn-ghost" onClick={() => setTick((t) => t + 1)}>
          <RefreshCw size={18} /> Quét lại
        </button>
      </PageHeader>

      {!issues ? (
        <Loading />
      ) : (
        <>
          {serious.length === 0 && (
            <div className="card audit-ok">
              <ShieldCheck size={22} />
              <div>
                <strong>Số liệu ổn</strong>
                <p className="muted small">Không thấy chỗ nào làm sai doanh thu, giá vốn hay tồn kho.</p>
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div className="audit-sum">
              {['error', 'warn', 'info'].map((lv) =>
                byLevel(lv) > 0 ? (
                  <span key={lv} className={`audit-pill audit-pill-${lv}`}>
                    <b>{byLevel(lv)}</b> {LEVELS[lv].toLowerCase()}
                  </span>
                ) : null,
              )}
            </div>
          )}

          {issues.map((issue) => {
            const shown = isOpen(issue)
            const list = all[issue.id] ? issue.items : issue.items.slice(0, SHOW)
            return (
              <section key={issue.id} className={`card list-card audit audit-${issue.level}`}>
                <button type="button" className="audit-head" onClick={() => setOpen({ ...open, [issue.id]: !shown })} aria-expanded={shown}>
                  <span className="audit-title">
                    <strong>{issue.title}</strong>
                    <span className={`badge badge-${issue.level === 'error' ? 'bad' : issue.level === 'warn' ? 'warn' : 'neutral'}`}>
                      {issue.items.length}
                    </span>
                  </span>
                  <ChevronDown size={18} className={`muted audit-caret ${shown ? 'on' : ''}`} />
                </button>
                {shown && (
                  <>
                    <p className="audit-why muted small">{issue.why}</p>
                    {issue.fix === 'outbox' && (
                      <div className="audit-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => retryFailed()}>
                          <RefreshCw size={15} /> Gửi lại tất cả
                        </button>
                      </div>
                    )}
                    <div className="audit-list">
                      {list.map((item) => {
                        const body = (
                          <>
                            <span className="grow">
                              {item.text}
                              {item.note && <span className="muted small block">{item.note}</span>}
                            </span>
                            {item.link && <ChevronRight size={18} className="muted" />}
                          </>
                        )
                        if (item.link)
                          return (
                            <Link key={item.key} to={item.link} className="list-row list-link">
                              {body}
                            </Link>
                          )
                        return (
                          <div key={item.key} className="list-row">
                            {body}
                            {issue.fix === 'resync' && (
                              <button type="button" className="btn btn-primary btn-sm" disabled={busy != null} onClick={() => resync(item)}>
                                {busy === item.key && <span className="spinner" aria-hidden="true" />} Ghi lại doanh thu
                              </button>
                            )}
                            {issue.fix === 'cost' && (
                              <button type="button" className="btn btn-primary btn-sm" disabled={busy != null} onClick={() => fixCost(item)}>
                                {busy === item.key && <span className="spinner" aria-hidden="true" />} Sửa giá vốn
                              </button>
                            )}
                            {issue.fix === 'outbox' && (
                              <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => discard(item)}>
                                Bỏ
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {issue.items.length > SHOW && (
                        <button type="button" className="list-row audit-more" onClick={() => setAll({ ...all, [issue.id]: !all[issue.id] })}>
                          {all[issue.id] ? 'Thu gọn' : `Xem thêm ${issue.items.length - SHOW} mục`}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            )
          })}
        </>
      )}
    </>
  )
}
