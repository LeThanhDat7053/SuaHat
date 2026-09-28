import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, fmtDateLong, todayStr } from '../lib/format'

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

// Ô nhập tiền: tự thêm dấu chấm ngăn cách hàng nghìn
export function MoneyInput({ value, onChange, ...rest }) {
  const display = value === '' || value == null ? '' : Number(value).toLocaleString('vi-VN')
  return (
    <div className="money-input">
      <input
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          onChange(digits === '' ? '' : Number(digits))
        }}
        {...rest}
      />
      <span>đ</span>
    </div>
  )
}

export function DateNav({ date, onChange }) {
  const isToday = date === todayStr()
  return (
    <div className="date-nav">
      <button type="button" className="icon-btn" onClick={() => onChange(addDays(date, -1))} aria-label="Hôm trước">
        <ChevronLeft size={20} />
      </button>
      <label className="date-nav-label">
        <span>{isToday ? 'Hôm nay' : fmtDateLong(date)}</span>
        <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </label>
      <button type="button" className="icon-btn" onClick={() => onChange(addDays(date, 1))} aria-label="Hôm sau">
        <ChevronRight size={20} />
      </button>
      {!isToday && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(todayStr())}>
          Hôm nay
        </button>
      )}
    </div>
  )
}

export function Empty({ icon: Icon, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={28} strokeWidth={1.5} />}
      <p>{children}</p>
    </div>
  )
}

export function Loading() {
  return <div className="loading">Đang tải…</div>
}

export function StatTile({ label, value, note, tone }) {
  return (
    <div className={`stat ${tone ? 'stat-' + tone : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}
