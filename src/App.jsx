import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isConfigured, supabase } from './lib/supabase'
import { startLive } from './lib/live'
import { startOutbox } from './lib/outbox'
import { isNetworkError } from './lib/net'
import { BARISTA_PATHS, useBarista } from './lib/barista'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sales from './pages/Sales'
import CalendarPage from './pages/CalendarPage'
import Recipes from './pages/Recipes'

// Trang ít dùng tải riêng; tải sẵn ngầm lúc máy rảnh để bấm vào là có ngay
const pages = {
  Purchases: () => import('./pages/Purchases'),
  Products: () => import('./pages/Products'),
  Expenses: () => import('./pages/Expenses'),
  More: () => import('./pages/More'),
  Ingredients: () => import('./pages/Ingredients'),
  Guide: () => import('./pages/Guide'),
  QuickOrders: () => import('./pages/QuickOrders'),
  BaristaSplit: () => import('./pages/BaristaSplit'),
  Checks: () => import('./pages/Checks'),
}
const Purchases = lazy(pages.Purchases)
const Products = lazy(pages.Products)
const Expenses = lazy(pages.Expenses)
const More = lazy(pages.More)
const Ingredients = lazy(pages.Ingredients)
const Guide = lazy(pages.Guide)
const QuickOrders = lazy(pages.QuickOrders)
const BaristaSplit = lazy(pages.BaristaSplit)
const Checks = lazy(pages.Checks)

const OFFLINE = { offline: true }

// Máy này đã đăng nhập trước đó (Supabase lưu phiên với tên sb-…-auth-token)
function hasSavedLogin() {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))
  } catch {
    return false
  }
}

function prefetchPages() {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500))
  idle(() => Object.values(pages).forEach((load) => load().catch(() => {})))
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return <AuthedApp />
}

function AuthedApp() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Mở app lúc mất mạng mà phiên đăng nhập vừa hết hạn (chưa làm mới được): vẫn cho vào app để bán
    // (đơn lưu trong máy), có mạng lại Supabase tự làm mới phiên rồi gửi lên.
    supabase.auth.getSession().then(({ data, error }) =>
      setSession(data.session || (error && isNetworkError(error) && hasSavedLogin() ? OFFLINE : null)),
    )
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== 'INITIAL_SESSION') setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    startLive()
    startOutbox()
    prefetchPages()
  }, [!!session])

  if (session === undefined) return <div className="splash">Sữa Hạt</div>
  if (!session) return <Login />

  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<Loading />}>
        <BaristaGuard />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ban-hang" element={<Sales />} />
          <Route path="/don" element={<QuickOrders />} />
          <Route path="/lich" element={<CalendarPage />} />
          <Route path="/cong-thuc" element={<Recipes />} />
          <Route path="/pha-che" element={<BaristaSplit />} />
          <Route path="/nhap-hang" element={<Purchases />} />
          <Route path="/san-pham" element={<Products />} />
          <Route path="/chi-phi" element={<Expenses />} />
          <Route path="/nguyen-lieu" element={<Ingredients />} />
          <Route path="/huong-dan" element={<Guide />} />
          <Route path="/kiem-tra" element={<Checks />} />
          <Route path="/khac" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  )
}

// Chế độ pha chế: trang khác (tổng quan, nhập hàng, chi phí…) → về Đơn hàng
function BaristaGuard() {
  const barista = useBarista()
  const { pathname } = useLocation()
  if (barista && !BARISTA_PATHS.includes(pathname)) return <Navigate to="/ban-hang" replace />
  return null
}

function SetupNeeded() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Chưa kết nối Supabase</h1>
        <p className="muted">
          Tạo file <code>.env</code> (copy từ <code>.env.example</code>) và điền <code>VITE_SUPABASE_URL</code>,{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>. Nếu đang dùng Netlify, thêm 2 biến này trong Site configuration →
          Environment variables rồi deploy lại.
        </p>
      </div>
    </div>
  )
}
