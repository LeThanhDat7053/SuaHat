import { useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { showError, supabase } from '../lib/supabase'
import { fmtDate, money, periodRange, todayStr } from '../lib/format'
import { Empty, Field, Loading, Modal, MoneyInput, PageHeader, PeriodPicker, SaveButton, useSubmit } from '../components/ui'

const CATEGORIES = ['Mặt bằng', 'Điện', 'Nước', 'Gas', 'Lương nhân viên', 'Bao bì', 'Quảng cáo', 'Sửa chữa', 'Khác']

export default function Expenses() {
  const [period, setPeriod] = useState({ mode: 'month', date: todayStr() })
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null)

  async function load() {
    const { from, to } = periodRange(period.mode, period.date)
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    if (!showError(error)) setList(data)
  }
  useEffect(() => {
    load()
  }, [period])

  const total = (list || []).reduce((s, e) => s + Number(e.amount), 0)
  const byCat = {}
  ;(list || []).forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount)))

  return (
    <>
      <PageHeader title="Chi phí khác" subtitle="Các khoản chi ngoài nguyên liệu">
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Plus size={18} /> Thêm chi phí
        </button>
      </PageHeader>

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
              <button key={e.id} className="list-row list-link" onClick={() => setEditing(e)}>
                <div className="grow">
                  <div>{e.category}</div>
                  <div className="muted small">
                    {fmtDate(e.date)}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <strong>{money(e.amount)}</strong>
              </button>
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
    if (!confirm('Xóa khoản chi này?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (!showError(error)) onSaved()
  }

  return (
    <Modal title={expense.id ? 'Sửa chi phí' : 'Thêm chi phí'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
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
