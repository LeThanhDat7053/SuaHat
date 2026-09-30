import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlarmClock, Bell, BellOff } from 'lucide-react'
import { showError } from '../lib/supabase'
import { useLive } from '../lib/live'
import {
  BEFORE_OPTIONS,
  askNotifyPermission,
  beep,
  canNotify,
  dismissReminder,
  fmtRemind,
  loadReminders,
  setReminderOff,
  snoozeReminder,
  systemNotify,
} from '../lib/reminders'
import { Empty, Modal } from './ui'

// Ô cài báo thức trong form đơn đặt / ghi chú. value = { mode: 'off'|'before'|'at', before, at }
export function ReminderField({ value, onChange, allowBefore, hasTime }) {
  const set = (patch) => {
    const next = { ...value, ...patch }
    if (next.mode !== 'off') askNotifyPermission()
    onChange(next)
  }
  const modes = [['off', 'Không báo'], ...(allowBefore ? [['before', 'Trước giờ giao']] : []), ['at', 'Chọn giờ']]
  return (
    <div className="field">
      <span className="field-label">
        <AlarmClock size={15} className="inline-icon" />
        Báo thức
      </span>
      <div className="tabs remind-tabs">
        {modes.map(([k, label]) => (
          <button type="button" key={k} className={value.mode === k ? 'active' : ''} onClick={() => set({ mode: k })}>
            {label}
          </button>
        ))}
      </div>
      {value.mode === 'before' && (
        <>
          <div className="chips remind-chips">
            {BEFORE_OPTIONS.map(([m, label]) => (
              <button type="button" key={m} className={`chip ${Number(value.before) === m ? 'active' : ''}`} onClick={() => set({ before: m })}>
                {label}
              </button>
            ))}
            <span className="remind-custom">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={value.before}
                onChange={(e) => set({ before: e.target.value })}
                aria-label="Số phút báo trước"
              />
              phút
            </span>
          </div>
          {!hasTime && <span className="field-hint danger-text">Chọn “Giờ giao” ở trên để báo trước được.</span>}
        </>
      )}
      {value.mode === 'at' && <input type="datetime-local" value={value.at} onChange={(e) => set({ at: e.target.value })} required />}
      {value.mode !== 'off' && canNotify() && Notification.permission === 'denied' && (
        <span className="field-hint">Máy đang chặn thông báo của app — vẫn báo trong app khi đang mở. Bật lại trong cài đặt trình duyệt.</span>
      )}
    </div>
  )
}

// Canh giờ báo thức khi app đang mở (kể cả đang chạy nền): hiện popup, kêu bíp, hiện thông báo trên máy
export function ReminderWatcher() {
  const [items, setItems] = useState([])
  const [ringing, setRinging] = useState([])
  const shown = useRef(new Set())
  const navigate = useNavigate()

  const load = useCallback(() => {
    loadReminders()
      .then(setItems)
      .catch(() => {}) // chưa nâng cấp database hoặc mất mạng: thử lại lần sau
  }, [])

  useLive(['orders', 'notes'], load)

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('reminders-changed', load)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('reminders-changed', load)
    }
  }, [load])

  useEffect(() => {
    function check() {
      const now = Date.now()
      const due = items.filter((r) => new Date(r.remind_at).getTime() <= now && !shown.current.has(`${r.table}:${r.id}:${r.remind_at}`))
      if (due.length === 0) return
      due.forEach((r) => {
        shown.current.add(`${r.table}:${r.id}:${r.remind_at}`)
        systemNotify(r)
      })
      beep()
      setRinging((prev) => [...prev.filter((p) => !due.some((d) => d.table === p.table && d.id === p.id)), ...due])
    }
    check()
    const t = setInterval(check, 10000)
    return () => clearInterval(t)
  }, [items])

  if (ringing.length === 0) return null

  const drop = (item) => setRinging((prev) => prev.filter((p) => !(p.table === item.table && p.id === item.id)))
  async function act(item, fn) {
    drop(item)
    showError(await fn(item))
  }

  return (
    <Modal title="⏰ Báo thức" onClose={() => setRinging([])}>
      <div className="alarm-list">
        {ringing.map((r) => (
          <div key={`${r.table}:${r.id}`} className="alarm-item">
            <strong>{r.title}</strong>
            {r.body && <p className="alarm-body">{r.body}</p>}
            <span className="muted small">Báo lúc {fmtRemind(r.remind_at)}</span>
            <div className="alarm-actions">
              <button className="btn btn-primary" onClick={() => act(r, dismissReminder)}>
                Đã biết
              </button>
              <button className="btn btn-ghost" onClick={() => act(r, (x) => snoozeReminder(x, 10))}>
                Báo lại 10 phút
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setRinging([])
                  navigate(`/lich?ngay=${r.date}`)
                }}
              >
                Xem lịch
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// Danh sách báo thức sắp tới: bật / tắt nhanh, bấm để mở đơn / ghi chú
export function ReminderList({ onOpen, onClose }) {
  const [items, setItems] = useState(null)
  const [perm, setPerm] = useState(canNotify() ? Notification.permission : 'unsupported')

  const load = useCallback(() => {
    loadReminders({ includeOff: true }).then(setItems, (e) => showError(e))
  }, [])
  useEffect(load, [load])

  async function toggle(item) {
    setItems((list) => list.map((x) => (x === item ? { ...x, remind_off: !x.remind_off } : x)))
    showError(await setReminderOff(item, !item.remind_off))
  }

  return (
    <Modal title="Báo thức sắp tới" onClose={onClose}>
      {perm === 'default' && (
        <button className="btn btn-ghost btn-block" style={{ marginBottom: 12 }} onClick={async () => setPerm(await askNotifyPermission())}>
          <Bell size={18} /> Cho phép hiện thông báo trên máy
        </button>
      )}
      {perm === 'denied' && (
        <p className="callout">Máy đang chặn thông báo của app. Báo thức vẫn hiện trong app khi đang mở; bật lại thông báo trong cài đặt trình duyệt.</p>
      )}
      {!items ? (
        <p className="muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <Empty icon={BellOff}>Chưa có báo thức nào. Cài trong form đơn đặt hoặc ghi chú.</Empty>
      ) : (
        <div className="card list-card">
          {items.map((r) => (
            <div key={`${r.table}:${r.id}`} className={`list-row ${r.remind_off ? 'is-paused' : ''}`}>
              <button className="grow recurring-main" onClick={() => onOpen(r)}>
                <div className="clamp">{r.title}</div>
                <div className="muted small">
                  {fmtRemind(r.remind_at)}
                  {r.remind_before != null && ` · trước ${BEFORE_OPTIONS.find(([m]) => m === r.remind_before)?.[1] || `${r.remind_before} phút`}`}
                  {new Date(r.remind_at) < new Date() && ' · đã qua giờ'}
                </div>
              </button>
              <label className="switch" title={r.remind_off ? 'Bật' : 'Tắt'}>
                <input type="checkbox" checked={!r.remind_off} onChange={() => toggle(r)} aria-label={`${r.remind_off ? 'Bật' : 'Tắt'} báo thức ${r.title}`} />
                <span />
              </label>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
