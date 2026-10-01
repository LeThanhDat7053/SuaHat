import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingBag,
  CalendarDays,
  PackagePlus,
  CupSoda,
  Receipt,
  Menu,
  LogOut,
  Wheat,
  CircleQuestionMark,
  ClipboardList,
  BookOpen,
  Coffee,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { BARISTA_PATHS, setBarista, useBarista } from '../lib/barista'
import { ReminderWatcher } from './Reminders'
import { useLiveStatus } from '../lib/live'

// mobile: hiện ở thanh dưới điện thoại (còn lại nằm trong "Khác")
export const NAV = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, mobile: true },
  { to: '/ban-hang', label: 'Bán hàng', icon: ShoppingBag, mobile: true },
  { to: '/lich', label: 'Lịch đơn', icon: CalendarDays, mobile: true },
  { to: '/cong-thuc', label: 'Công thức', icon: BookOpen, mobile: true },
  { to: '/nhap-hang', label: 'Nhập hàng', icon: PackagePlus },
  { to: '/don', label: 'Đơn bán & tổng quan đơn', icon: ClipboardList },
  { to: '/nguyen-lieu', label: 'Nguyên liệu & tồn kho', icon: Wheat },
  { to: '/san-pham', label: 'Sản phẩm & sửa công thức', icon: CupSoda },
  { to: '/chi-phi', label: 'Chi phí khác', icon: Receipt },
  { to: '/huong-dan', label: 'Cách dùng', icon: CircleQuestionMark },
]

// Menu theo chế độ: pha chế chỉ thấy Đơn hàng + Công thức
export function navFor(barista) {
  if (!barista) return NAV
  return NAV.filter((n) => BARISTA_PATHS.includes(n.to)).map((n) => (n.to === '/ban-hang' ? { ...n, label: 'Đơn hàng', mobile: true } : n))
}

export function logout() {
  if (confirm('Đăng xuất khỏi máy này?')) supabase.auth.signOut()
}

export function toggleBarista(on) {
  if (on) {
    if (confirm('Bật chế độ pha chế trên máy này?\nChỉ còn Đơn hàng + Công thức, ẩn doanh thu, lãi, nhập hàng, chi phí.')) setBarista(true)
  } else if (confirm('Thoát chế độ pha chế, hiện lại đầy đủ?')) setBarista(false)
}

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const barista = useBarista()
  const nav = navFor(barista)
  // sang trang khác thì lên đầu trang (không giữ chỗ cuộn của trang trước)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className={`app ${barista ? 'is-barista' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="" width="40" height="40" />
          <span>Quán Sữa Hạt</span>
        </div>
        {barista && <div className="barista-pill">Chế độ pha chế</div>}
        <nav>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="side-link">
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button className="side-link" onClick={() => toggleBarista(!barista)}>
          <Coffee size={20} />
          {barista ? 'Thoát chế độ pha chế' : 'Chế độ pha chế'}
        </button>
        <button className="side-link side-logout" onClick={logout}>
          <LogOut size={20} />
          Đăng xuất
        </button>
      </aside>

      <main className="content">
        <OfflineNotice />
        {children}
      </main>
      <ReminderWatcher />

      <nav className="bottom-nav">
        {nav
          .filter((n) => n.mobile)
          .map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="bottom-link">
              <Icon size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
        <NavLink to="/khac" className="bottom-link">
          <Menu size={22} />
          <span>Khác</span>
        </NavLink>
      </nav>
    </div>
  )
}

// Mất kết nối đồng bộ → báo để biết số liệu có thể chưa mới (tự hết khi kết nối lại)
function OfflineNotice() {
  const status = useLiveStatus()
  if (status !== 'offline') return null
  return <div className="offline-notice">Mất kết nối — số liệu có thể chưa mới, app tự cập nhật khi có mạng lại.</div>
}
