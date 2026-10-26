import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { isNetworkError } from './net'
import { notifyChange } from './live'
import { withUsage } from './usage'
import { QUICK_ID, missingTable, quickRows } from './quick'

// Hàng chờ gửi: thao tác bán hàng được LƯU VÀO MÁY TRƯỚC, rồi mới gửi lên database.
// - Có mạng: gửi ngay, người bấm nhận kết quả như bình thường.
// - Rớt mạng: giữ trong máy (tắt app, tải lại trang cũng không mất), có mạng lại tự gửi theo đúng thứ tự.
// Gửi lại không bao giờ ghi trùng: số bán / hủy là "ghi đè" theo (ngày, món); đơn mới có mã riêng (client_id)
// nên database chỉ lưu 1 lần; "Đã xong" 1 đơn đã xong thì coi như xong.
// Lỗi dữ liệu (không phải mạng) của việc gửi ngầm → giữ lại, báo ở trang Kiểm tra số liệu để gửi lại / bỏ.

const KEY = 'outbox'
const RETRY_MS = 15000

export const QUICK_UPGRADE = 'Cần chạy file supabase/nang-cap-v10.sql trong Supabase → SQL Editor 1 lần để bán được lúc mất mạng.'

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(v) ? v.map((j) => ({ ...j, live: false })) : []
  } catch {
    return []
  }
}

let jobs = read()
let sendingId = null
let running = null
let timer = null
let snap = { jobs, sending: null }
const listeners = new Set()
const sentListeners = new Set()
const waiters = new Map() // id việc → resolve của người đang chờ kết quả

function commit(next) {
  jobs = next
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs))
  } catch {
    /* máy chặn lưu trữ: vẫn gửi được khi có mạng, chỉ không giữ qua lần tải lại */
  }
  emit()
}

function emit() {
  snap = { jobs, sending: sendingId }
  listeners.forEach((fn) => fn())
}

function settle(id, result) {
  const resolve = waiters.get(id)
  waiters.delete(id)
  resolve?.(result)
}

export const newId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// Gửi 1 việc. Trả về { data } khi đã lưu lên database, { queued: true } khi đang giữ trong máy chờ mạng,
// { error } khi database từ chối (việc bị bỏ, như trước đây).
// `key`: việc mới thay việc cũ cùng key chưa gửi (VD sửa số bán của cùng món cùng ngày nhiều lần).
export function send(job) {
  const j = { ...job, id: newId(), at: new Date().toISOString(), live: true }
  const promise = new Promise((resolve) => waiters.set(j.id, resolve))
  const replaced = j.key ? jobs.filter((x) => x.key === j.key && x.id !== sendingId && !x.error) : []
  replaced.forEach((x) => settle(x.id, { replaced: true }))
  commit([...jobs.filter((x) => !replaced.includes(x)), j])
  flush()
  return promise
}

// Sửa 1 việc chưa gửi (VD sửa đơn lập lúc mất mạng). false = đang gửi dở / đã gửi xong, không sửa được.
export function updateJob(id, patch) {
  const job = jobs.find((j) => j.id === id)
  if (!job || id === sendingId) return false
  commit(jobs.map((j) => (j.id === id ? { ...j, ...patch(j), error: null } : j)))
  flush()
  return true
}

export function removeJob(id) {
  if (id === sendingId || !jobs.some((j) => j.id === id)) return false
  settle(id, { removed: true })
  commit(jobs.filter((j) => j.id !== id))
  return true
}

// Gửi lại các việc bị lỗi (sau khi đã sửa nguyên nhân, VD đã chạy file nâng cấp)
export function retryFailed() {
  commit(jobs.map((j) => (j.error ? { ...j, error: null } : j)))
  return flush()
}

// Đang gửi dở thì đợi lượt đó xong rồi chạy thêm 1 lượt (lượt đó có thể vừa dừng vì mất mạng)
export function flush() {
  if (running) return running.then(() => flush())
  running = run().finally(() => {
    running = null
    clearTimeout(timer)
    if (jobs.some((j) => !j.error)) timer = setTimeout(flush, RETRY_MS)
  })
  return running
}

// Mất mạng: dừng, giữ nguyên hàng chờ, báo người đang chờ là "đã lưu trong máy"
function pause() {
  const waiting = jobs.filter((j) => j.live)
  if (waiting.length) commit(jobs.map((j) => (j.live ? { ...j, live: false } : j)))
  waiting.forEach((j) => settle(j.id, { queued: true }))
}

async function run() {
  for (;;) {
    const job = jobs.find((j) => !j.error)
    if (!job) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return pause()
    // phiên đăng nhập hết hạn lúc mất mạng (chưa làm mới được) → đợi, không gửi kiểu "khách" bị từ chối
    const { data: auth } = await supabase.auth.getSession()
    if (!auth?.session) return pause()

    sendingId = job.id
    emit()
    let res
    try {
      res = await HANDLERS[job.type](job)
    } catch (e) {
      res = { error: e }
    }
    sendingId = null

    if (res.error && isNetworkError(res.error)) {
      emit()
      return pause()
    }
    if (res.error) {
      console.error(res.error)
      if (job.live) {
        commit(jobs.filter((j) => j.id !== job.id))
        settle(job.id, { error: res.error })
      } else {
        commit(jobs.map((j) => (j.id === job.id ? { ...j, error: res.error.message || String(res.error), errorCode: res.error.code || null } : j)))
      }
      continue
    }
    commit(jobs.filter((j) => j.id !== job.id))
    settle(job.id, { data: res.data ?? null })
    sentListeners.forEach((fn) => fn(job, res.data ?? null))
    notifyChange(TABLES[job.type])
  }
}

const TABLES = {
  sale: ['sales'],
  waste: ['waste'],
  'quick-new': ['quick_orders', 'sales'],
  'quick-done': ['quick_orders', 'sales'],
}

const HANDLERS = {
  // số bán tại quán của 1 món trong 1 ngày (row = null → xóa dòng)
  sale: (j) =>
    j.row
      ? withUsage((r) => supabase.from('sales').upsert(r, { onConflict: 'date,product_id,source' }), j.row)
      : supabase.from('sales').delete().eq('date', j.date).eq('product_id', j.product_id).eq('source', ''),
  // hàng hủy của 1 món trong 1 ngày (row = null → xóa)
  waste: (j) =>
    j.row
      ? withUsage((r) => supabase.from('waste').upsert(r, { onConflict: 'date,product_id' }), j.row)
      : supabase.from('waste').delete().eq('date', j.date).eq('product_id', j.product_id),
  // đơn mới (rows có = "Xong luôn": ghi doanh thu cùng lúc)
  'quick-new': async (j) => {
    const res = await supabase.rpc('save_quick_order', { p_client_id: j.cid, p_order: j.order, p_rows: j.rows || null })
    if (missingTable(res.error)) return { error: { code: res.error.code, message: QUICK_UPGRADE } }
    return res
  },
  // "Đã xong" 1 đơn đang chờ. Đã xong rồi (máy khác bấm, hoặc lần gửi trước đã tới) → coi như xong.
  'quick-done': async (j) => {
    const res = await supabase.rpc('complete_quick_order', { p_id: j.order_id, p_rows: j.rows })
    if (res.error && /đã được bấm xong/i.test(res.error.message || '')) return { data: null }
    return res
  },
}

// ---------- Đơn nhanh ----------

// Lập đơn mới; done = "Xong luôn" (khách lấy liền, tính tiền luôn)
export async function sendNewQuickOrder(order, done) {
  const o = done ? { ...order, done_at: new Date().toISOString() } : order
  return send({ type: 'quick-new', cid: newId(), order: o, rows: done ? await quickRows(o, QUICK_ID) : null })
}

// "Đã xong" 1 đơn đã có trên database
export async function sendQuickDone(order) {
  const rows = await quickRows(order)
  return send({ type: 'quick-done', key: `quick-done:${order.id}`, order_id: order.id, rows })
}

// "Đã xong" 1 đơn lập lúc mất mạng, chưa gửi lên: ghi luôn vào việc đang chờ
export async function finishLocalOrder(jobId) {
  const job = jobs.find((j) => j.id === jobId)
  if (!job) return false
  const order = { ...job.order, done_at: new Date().toISOString() }
  const rows = await quickRows(order, QUICK_ID)
  return updateJob(jobId, () => ({ order, rows }))
}

// Đơn đang chờ giao lập lúc mất mạng → dạng giống đơn trên database để hiện chung danh sách
export const localOrders = (list) =>
  list
    .filter((j) => j.type === 'quick-new' && !j.rows)
    .map((j) => ({ ...j.order, id: j.id, status: 'pending', local: true, failed: j.error || null }))

// Các dòng bán đã bấm xong nhưng chưa gửi được: vẫn cộng vào số hôm nay cho đúng
export const unsentSales = (list) => list.filter((j) => j.rows && (j.type === 'quick-new' || j.type === 'quick-done')).flatMap((j) => j.rows)

// ---------- Theo dõi ----------

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const useOutbox = () => useSyncExternalStore(subscribe, () => snap)
export const outboxJobs = () => jobs

// Gọi fn(job, data) mỗi khi gửi xong 1 việc
export function onSent(fn) {
  sentListeners.add(fn)
  return () => sentListeners.delete(fn)
}

let started = false
export function startOutbox() {
  if (started) return
  started = true
  window.addEventListener('online', () => flush())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && flush())
  flush()
}

// Chỉ dùng trong test: bắt đầu lại từ hàng chờ đang lưu
export function _reset() {
  jobs = read()
  sendingId = null
  running = null
  clearTimeout(timer)
  waiters.clear()
  sentListeners.clear()
  emit()
}
