import { Link } from 'react-router-dom'
import { ChevronRight, LogOut } from 'lucide-react'
import { NAV, logout } from '../components/Layout'
import { PageHeader } from '../components/ui'

export default function More() {
  return (
    <>
      <PageHeader title="Khác" />
      <div className="card list-card">
        {NAV.filter((n) => !n.mobile).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="list-row list-link">
            <Icon size={20} />
            <span className="grow">{label}</span>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
        <button className="list-row list-link danger-text" onClick={logout}>
          <LogOut size={20} />
          <span className="grow">Đăng xuất</span>
        </button>
      </div>
    </>
  )
}
