import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured, supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sales from './pages/Sales'
import CalendarPage from './pages/CalendarPage'
import Purchases from './pages/Purchases'
import Products from './pages/Products'
import Expenses from './pages/Expenses'
import More from './pages/More'
import Ingredients from './pages/Ingredients'
import Guide from './pages/Guide'
import QuickOrders from './pages/QuickOrders'

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return <AuthedApp />
}

function AuthedApp() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash">Sữa Hạt</div>
  if (!session) return <Login />

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ban-hang" element={<Sales />} />
          <Route path="/don" element={<QuickOrders />} />
          <Route path="/lich" element={<CalendarPage />} />
          <Route path="/nhap-hang" element={<Purchases />} />
          <Route path="/san-pham" element={<Products />} />
          <Route path="/chi-phi" element={<Expenses />} />
          <Route path="/nguyen-lieu" element={<Ingredients />} />
          <Route path="/huong-dan" element={<Guide />} />
          <Route path="/khac" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
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
