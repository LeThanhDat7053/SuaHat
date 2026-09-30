import { useEffect, useState } from 'react'
import { Plus, Receipt, Repeat, SkipForward } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { addDays, fmtDate, fmtDateLong, money, periodRange, todayStr } from '../lib/format'
import { missingTable } from '../lib/quick'
import { ALL_DAYS, WEEKDAYS, applyRecurring, scheduleText } from '../lib/recurring'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader, PeriodPicker, SaveButton, useSubmit } from '../components/ui'

const CATEGORIES = ['Mặt bằng', 'Điện', 'Nước', 'Nước đá', 'Gas', 'Lương nhân viên', 'Bao bì', 'Quảng cáo', 'Sửa chữa', 'Khác']

export default function Expenses() {
  const [period, setPeriod] = useState({ mode: 'month', date: todayStr() })
  const [list, setList] = useState(null)
  const [recurring, setRecurring] = useState(null) // null = đang tải hoặc chưa nâng cấp database
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editRec, setEditRec] = useState(null)

  async function load(force = false) {
    try {
      await applyRecurring(force)
    } catch (e) {
      showError(e)
    }
    const { from, to } = periodRange(period.mode, period.date)
    const [ex, rec] = await Promise.all([
      supabase.from('expenses').select('*').gte('date', from).lte('date', to).order('date', { ascending: false }).order('id', { ascending: false }),
      supabase.from('recurring_expenses').select('*').order('paused').order('created_at'),
    ])
    if (showError(ex.error)) return
    setList(ex.data)
    if (missingTable(rec.error)) setNeedsUpgrade(true)
    else if (!showError(rec.error)) setRecurring(rec.data)
  }
  useEffect(() => {
    load()
  }, [period])

  // Tạm dừng / chạy lại. Chạy lại thì ghi từ hôm nay, không ghi bù những ngày đã dừng.
  async function togglePause(r) {
    const patch = r.paused ? { paused: false, generated_until: addDays(todayStr(), -1) } : { paused: true }
    setRecurring((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('recurring_expenses').update(patch).eq('id', r.id)
    showError(error)
    load(true)
  }

  // Bỏ qua 1 ngày không phát sinh: xóa khoản đã tự ghi, app không ghi lại nữa
  async function skip(e) {
    if (!confirm(`Bỏ qua ${e.category} ${money(e.amount)} ngày ${fmtDate(e.date)}?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (!showError(error)) setList((l) => l.filter((x) => x.id !== e.id))
  }

  const total = (list || []).reduce((s, e) => s + Number(e.amount), 0)
  const byCat = {}
  ;(list || []).forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount)))
  const today = todayStr()

  return (
    <>
      <PageHeader title="Chi phí khác" subtitle="Các khoản chi ngoài nguyên liệu">
        {!needsUpgrade && (
          <button className="btn btn-ghost" onClick={() => setEditRec({})}>
            <Repeat size={18} /> Định kỳ
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Plus size={18} /> Thêm chi phí
        </button>
      </PageHeader>

      {needsUpgrade && (
        <div className="callout">
          Để dùng <b>chi phí định kỳ</b> (tự ghi mỗi ngày như nước đá), chạy file <code>supabase/nang-cap-v4.sql</code> trong Supabase → SQL
          Editor 1 lần.
        </div>
      )}

      {recurring && (
        <div className="card list-card recurring-card">
          <div className="list-head">
            <span>Chi phí định kỳ — app tự ghi, không cần thêm tay</span>
            <button className="link-btn" onClick={() => setEditRec({})}>
              + Thêm
            </button>
          </div>
          {recurring.length === 0 ? (
            <p className="muted small recurring-empty">
              VD: nước đá 20.000đ mỗi ngày. Tạo 1 lần, mỗi ngày app tự ghi vào chi phí. Hôm nào không mua thì bấm <b>Bỏ qua</b>.
            </p>
          ) : (
            recurring.map((r) => (
              <div key={r.id} className={`list-row ${r.paused ? 'is-paused' : ''}`}>
                <button className="grow recurring-main" onClick={() => setEditRec(r)}>
                  <div>
                    {r.category}
                    {r.note ? <span className="muted"> · {r.note}</span> : ''}
                  </div>
                  <div className="muted small">
                    {r.paused ? 'Đang tạm dừng' : scheduleText(r.weekdays)}
                    {!r.paused && r.start_date > today && ` · từ ${fmtDate(r.start_date)}`}
                  </div>
                </button>
                <strong>{money(r.amount)}</strong>
                <label className="switch" title={r.paused ? 'Chạy lại' : 'Tạm dừng'}>
                  <input type="checkbox" checked={!r.paused} onChange={() => togglePause(r)} aria-label={`${r.paused ? 'Chạy lại' : 'Tạm dừng'} ${r.category}`} />
                  <span />
                </label>
              </div>
            ))
          )}
        </div>
      )}

      <PeriodPicker period={period} onChange={setPeriod} />
      <div className="toolbar">
        <span>
          Tổng: <strong>{money(total)}</strong>
        </span>
      </div>

      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon={Receipt}>Chưa có chi phí nào trong khoảng này.</Empty>
      ) : (
        <div className="two-col">
          <div className="card list-card">
            {list.map((e) => (
              <div key={e.id} className="list-row expense-row">
                <button className="grow expense-main" onClick={() => setEditing(e)}>
                  <div>
                    {e.category}
                    {e.recurring_id && <span className="badge badge-neutral expense-auto">tự ghi</span>}
                  </div>
                  <div className="muted small">
                    {fmtDate(e.date)}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </button>
                <strong>{money(e.amount)}</strong>
                {e.recurring_id && (
                  <button className="icon-btn" onClick={() => skip(e)} title="Bỏ qua ngày này (không phát sinh)" aria-label={`Bỏ qua ${e.category} ${fmtDate(e.date)}`}>
                    <SkipForward size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="card list-card">
            <div className="list-head">Theo loại</div>
            {Object.entries(byCat)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amount]) => (
                <div key={cat} className="list-row">
                  <span className="grow">{cat}</span>
                  <span>{money(amount)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {editing && (
        <ExpenseForm
          expense={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {editRec && (
        <RecurringForm
          item={editRec}
          onClose={() => setEditRec(null)}
          onSaved={() => {
            setEditRec(null)
            load(true)
          }}
        />
      )}
    </>
  )
}

function ExpenseForm({ expense, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: expense.date || todayStr(),
    category: expense.category || CATEGORIES[0],
    amount: expense.amount ?? '',
    note: expense.note || '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const [busy, onSubmit] = useSubmit(submit)

  async function submit() {
    const payload = { ...form, amount: Number(form.amount || 0), note: form.note.trim() || null }
    const { error } = expense.id
      ? await supabase.from('expenses').update(payload).eq('id', expense.id)
      : await supabase.from('expenses').insert(payload)
    if (!showError(error)) onSaved()
  }

  async function remove() {
    if (!confirm(expense.recurring_id ? 'Bỏ qua khoản tự ghi này? App sẽ không ghi lại cho ngày này.' : 'Xóa khoản chi này?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={expense.id ? 'Sửa chi phí' : 'Thêm chi phí'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        {expense.recurring_id && <p className="muted small">Khoản này do chi phí định kỳ tự ghi. Sửa ở đây chỉ đổi riêng ngày này.</p>}
        <div className="form-row">
          <Field label="Ngày">
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
          </Field>
          <Field label="Loại chi phí">
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([...CATEGORIES, form.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Số tiền">
          <MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required />
        </Field>
        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="form-actions">
          {expense.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              {expense.recurring_id ? 'Bỏ qua ngày này' : 'Xóa'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}

function RecurringForm({ item, onClose, onSaved }) {
  const today = todayStr()
  const [form, setForm] = useState({
    category: item.category || 'Nước đá',
    amount: item.amount ?? '',
    note: item.note || '',
    weekdays: item.weekdays || ALL_DAYS,
    start_date: item.start_date || today,
    applyToday: true,
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleDay = (d) => set('weekdays', form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d])
  const [busy, onSubmit] = useSubmit(submit)

  async function submit() {
    if (form.weekdays.length === 0) return alert('Chọn ít nhất 1 ngày trong tuần')
    const payload = {
      category: form.category,
      amount: Number(form.amount || 0),
      note: form.note.trim() || null,
      weekdays: [...form.weekdays].sort(),
      start_date: form.start_date,
    }
    if (item.id) {
      // đổi ngày bắt đầu về sau hôm nay → những ngày trước đó không ghi nữa
      const { error } = await supabase.from('recurring_expenses').update(payload).eq('id', item.id)
      if (showError(error)) return
      if (form.applyToday) {
        const { error } = await supabase
          .from('expenses')
          .update({ category: payload.category, amount: payload.amount, note: payload.note })
          .eq('recurring_id', item.id)
          .eq('date', today)
        if (showError(error)) return
      }
    } else {
      const { error } = await supabase.from('recurring_expenses').insert(payload)
      if (showError(error)) return
    }
    onSaved()
  }

  async function remove() {
    if (!confirm(`Xóa chi phí định kỳ "${item.category}"? Các khoản đã ghi trước đây vẫn được giữ.`)) return
    const { error } = await supabase.from('recurring_expenses').delete().eq('id', item.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={item.id ? 'Sửa chi phí định kỳ' : 'Chi phí định kỳ mới'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <div className="form-row">
          <Field label="Loại chi phí">
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([...CATEGORIES, form.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Số tiền mỗi lần">
            <MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required />
          </Field>
        </div>

        <div className="field">
          <span className="field-label">Lặp lại</span>
          <div className="chips day-chips">
            <button type="button" className={`chip ${form.weekdays.length === 7 ? 'active' : ''}`} onClick={() => set('weekdays', ALL_DAYS)}>
              Mỗi ngày
            </button>
            {WEEKDAYS.map(([d, short]) => (
              <button
                type="button"
                key={d}
                className={`chip ${form.weekdays.length < 7 && form.weekdays.includes(d) ? 'active' : ''}`}
                onClick={() => (form.weekdays.length === 7 ? set('weekdays', [d]) : toggleDay(d))}
              >
                {short}
              </button>
            ))}
          </div>
          <span className="field-hint">
            {form.weekdays.length ? scheduleText(form.weekdays) : 'Chưa chọn ngày nào'}. Hàng tuần: chọn 1 thứ. Hôm nào không mua thì bấm “Bỏ qua”
            trong danh sách chi phí.
          </span>
        </div>

        <div className="form-row">
          <Field label="Bắt đầu từ" hint={form.start_date === today ? 'Hôm nay được ghi luôn' : fmtDateLong(form.start_date)}>
            <input type="date" value={form.start_date} onChange={(e) => e.target.value && set('start_date', e.target.value)} required />
          </Field>
          <Field label="Ghi chú">
            <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="VD: 2 bao đá" />
          </Field>
        </div>

        {item.id && (
          <label className="check">
            <input type="checkbox" checked={form.applyToday} onChange={(e) => set('applyToday', e.target.checked)} />
            Sửa luôn khoản đã ghi hôm nay (các ngày trước giữ nguyên)
          </label>
        )}

        <div className="form-actions">
          {item.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              Xóa
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  )
}
