import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { invalidateCache } from './cache'

// Đồng bộ tức thì giữa các máy (Supabase Realtime, cần chạy nang-cap-v5.sql):
// máy khác thêm / sửa / xóa → bộ nhớ tạm bị làm cũ → trang đang mở tự tải lại phần liên quan.

const ALL = '*'
const FALLBACK_MS = 30000 // chưa kết nối được thì cứ 30 giây kiểm tra lại 1 lần

let started = false
let everLive = false
let status = 'connecting' // 'live' | 'connecting' | 'offline'
const statusListeners = new Set()
let queued = new Set()
let timer = null

function setStatus(s) {
  if (s === status) return
  status = s
  statusListeners.forEach((fn) => fn(s))
}

// gom các thay đổi dồn dập (vd bấm Đã xong ghi 3 dòng) thành 1 lần tải lại
function changed(table) {
  invalidateCache()
  queued.add(table)
  clearTimeout(timer)
  timer = setTimeout(() => {
    const tables = queued
    queued = new Set()
    window.dispatchEvent(new CustomEvent('db-change', { detail: tables }))
  }, 250)
}

export function startLive() {
  if (started || !supabase) return
  started = true

  supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => changed(payload.table))
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        // kết nối lại sau khi rớt mạng: có thể đã lỡ thay đổi → tải lại hết
        if (everLive) changed(ALL)
        everLive = true
        setStatus('live')
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline')
    })

  // điện thoại tắt màn hình thường ngắt kết nối → mở lại app là tải lại cho chắc
  const catchUp = () => document.visibilityState === 'visible' && changed(ALL)
  document.addEventListener('visibilitychange', catchUp)
  window.addEventListener('online', catchUp)
  window.addEventListener('offline', () => setStatus('offline'))
  setInterval(() => {
    if (status !== 'live' && document.visibilityState === 'visible') changed(ALL)
  }, FALLBACK_MS)
}

// Gọi reload() khi 1 trong các bảng `tables` vừa thay đổi (ở máy này hoặc máy khác)
export function useLive(tables, reload) {
  const ref = useRef(reload)
  ref.current = reload
  const key = tables.join(',')
  useEffect(() => {
    const list = key.split(',')
    const on = (e) => (e.detail.has(ALL) || list.some((t) => e.detail.has(t))) && ref.current()
    window.addEventListener('db-change', on)
    return () => window.removeEventListener('db-change', on)
  }, [key])
}

export function useLiveStatus() {
  const [s, set] = useState(status)
  useEffect(() => {
    statusListeners.add(set)
    set(status)
    return () => statusListeners.delete(set)
  }, [])
  return s
}
