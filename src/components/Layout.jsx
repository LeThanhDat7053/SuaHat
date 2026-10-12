import { useEffect, useRef, useState } from 'react'
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
  Columns3,
  WifiOff,
  Wifi,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { BARISTA_PATHS, setBarista, useBarista } from '../lib/barista'
import { ReminderWatcher } from './Reminders'
import { useLiveStatus } from '../lib/live'
import { useNet } from '../lib/net'

// mobile: hiện ở thanh dưới điện thoại (còn lại nằm trong "Khác")
export const NAV = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, mobile: true },
  { to: '/ban-hang', label: 'Bán hàng', icon: ShoppingBag, mobile: true },
  { to: '/lich', label: 'Lịch đơn', icon: CalendarDays, mobile: true },
  { to: '/cong-thuc', label: 'Công thức', icon: BookOpen, mobile: true },
  { to: '/pha-che', label: 'Chia màn hình', icon: Columns3, baristaOnly: true },
  { to: '/nhap-hang', label: 'Nhập hàng', icon: PackagePlus },
  { to: '/don', label: 'Đơn bán & tổng quan đơn', icon: ClipboardList },
  { to: '/nguyen-lieu', label: 'Nguyên liệu & tồn kho', icon: Wheat },
  { to: '/san-pham', label: 'Sản phẩm & sửa công thức', icon: CupSoda },
  { to: '/chi-phi', label: 'Chi phí khác', icon: Receipt },
  { to: '/huong-dan', label: 'Cách dùng', icon: CircleQuestionMark },
]

// Menu theo chế độ: pha chế chỉ thấy Đơn hàng + Công thức
export function navFor(barista) {
  if (!barista) return NAV.filter((n) => !n.baristaOnly)
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
    <div className={`app ${barista ? 'is-barista' : ''} ${pathname === '/pha-che' ? 'is-split' : ''}`}>
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
        {children}
      </main>
      <ReminderWatcher />
      <NetStatus />

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

// Thanh trạng thái mạng nổi ở trên cùng (không đẩy nội dung):
// mất mạng → vàng, mạng chậm → đang tải, có mạng lại → báo xanh 2,5 giây rồi tắt.
function NetStatus() {
  const live = useLiveStatus()
  const { down, slow } = useNet()
  const [back, setBack] = useState(false)
  const wasDown = useRef(false)

  useEffect(() => {
    if (down) {
      wasDown.current = true
      setBack(false)
      return
    }
    if (!wasDown.current) return
    wasDown.current = false
    setBack(true)
    const t = setTimeout(() => setBack(false), 2500)
    return () => clearTimeout(t)
  }, [down])

  let tone, icon, text
  if (down) {
    tone = 'warn'
    icon = <WifiOff size={16} />
    text = 'Mất mạng — đang chờ kết nối lại. Thao tác lúc này có thể chưa lưu.'
  } else if (slow) {
    tone = 'slow'
    icon = <span className="spinner" aria-hidden="true" />
    text = 'Mạng chậm, đang tải…'
  } else if (back) {
    tone = 'good'
    icon = <Wifi size={16} />
    text = 'Đã có mạng lại'
  } else if (live === 'offline') {
    tone = 'warn'
    icon = <WifiOff size={16} />
    text = 'Mất kết nối đồng bộ — số liệu có thể chưa mới, app tự cập nhật khi có mạng lại.'
  } else return null

  return (
    <div className={`net-status net-${tone}`} role="status">
      {icon}
      <span>{text}</span>
    </div>
  )
}
