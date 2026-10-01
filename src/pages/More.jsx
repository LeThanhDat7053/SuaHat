import { Link } from 'react-router-dom'
import { ChevronRight, Coffee, LogOut } from 'lucide-react'
import { logout, navFor, toggleBarista } from '../components/Layout'
import { useBarista } from '../lib/barista'
import { PageHeader } from '../components/ui'

export default function More() {
  const barista = useBarista()
  return (
    <>
      <PageHeader title="Khác" subtitle={barista ? 'Đang ở chế độ pha chế' : undefined} />
      <div className="card list-card">
        {navFor(barista)
          .filter((n) => !n.mobile)
          .map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="list-row list-link">
              <Icon size={20} />
              <span className="grow">{label}</span>
              <ChevronRight size={18} className="muted" />
            </Link>
          ))}
        <button className="list-row list-link" onClick={() => toggleBarista(!barista)}>
          <Coffee size={20} />
          <span className="grow">
            {barista ? 'Thoát chế độ pha chế' : 'Chế độ pha chế'}
            {!barista && <span className="muted small block">Máy ở quầy pha: chỉ hiện đơn hàng + công thức</span>}
          </span>
          <ChevronRight size={18} className="muted" />
        </button>
        <button className="list-row list-link danger-text" onClick={logout}>
          <LogOut size={20} />
          <span className="grow">Đăng xuất</span>
        </button>
      </div>
    </>
  )
}
