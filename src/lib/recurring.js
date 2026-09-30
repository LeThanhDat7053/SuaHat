import { supabase } from './supabase'
import { addDays, parseDate, todayStr } from './format'
import { missingTable } from './quick'

// Thứ tự hiển thị T2 → CN (giá trị theo Date.getDay(): 0 = CN)
export const WEEKDAYS = [
  [1, 'T2', 'Thứ 2'],
  [2, 'T3', 'Thứ 3'],
  [3, 'T4', 'Thứ 4'],
  [4, 'T5', 'Thứ 5'],
  [5, 'T6', 'Thứ 6'],
  [6, 'T7', 'Thứ 7'],
  [0, 'CN', 'Chủ nhật'],
]
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export function scheduleText(days) {
  if (days.length === 7) return 'Mỗi ngày'
  if (days.length === 1) return `Mỗi ${WEEKDAYS.find(([d]) => d === days[0])[2]}`
  if (days.length === 6 && !days.includes(0)) return 'Mỗi ngày, trừ CN'
  return WEEKDAYS.filter(([d]) => days.includes(d))
    .map(([, s]) => s)
    .join(', ')
}

const MAX_BACKFILL = 62 // lâu không mở app thì chỉ ghi bù tối đa 2 tháng

let lastRun = null // { day, promise }: mỗi ngày chỉ chạy 1 lần trừ khi ép chạy lại

// Tự ghi các khoản chi định kỳ còn thiếu, từ lần ghi trước tới hôm nay.
// Xóa 1 khoản đã ghi (= bỏ qua ngày đó) thì không bị ghi lại, vì đã đánh dấu generated_until.
export function applyRecurring(force = false) {
  const day = todayStr()
  if (!force && lastRun?.day === day) return lastRun.promise
  const promise = run(day).catch((e) => {
    lastRun = null
    throw e
  })
  lastRun = { day, promise }
  return promise
}

async function run(today) {
  const { data, error } = await supabase.from('recurring_expenses').select('*').eq('paused', false)
  if (missingTable(error)) return
  if (error) throw error

  const rows = []
  const ids = []
  const floor = addDays(today, -MAX_BACKFILL)
  data.forEach((r) => {
    let from = r.start_date
    if (r.generated_until && addDays(r.generated_until, 1) > from) from = addDays(r.generated_until, 1)
    if (from < floor) from = floor
    if (from > today) return
    ids.push(r.id)
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (r.weekdays.includes(parseDate(d).getDay())) {
        rows.push({ date: d, category: r.category, amount: r.amount, note: r.note, recurring_id: r.id })
      }
    }
  })
  if (rows.length) {
    // 2 máy chạy cùng lúc cũng không ghi trùng (unique recurring_id + date)
    const ins = await supabase.from('expenses').upsert(rows, { onConflict: 'recurring_id,date', ignoreDuplicates: true })
    if (ins.error) throw ins.error
  }
  if (ids.length) {
    const upd = await supabase.from('recurring_expenses').update({ generated_until: today }).in('id', ids)
    if (upd.error) throw upd.error
  }
}
