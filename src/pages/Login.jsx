import { useState } from 'react'
import { ADMIN_EMAIL, ADMIN_USERNAME, supabase } from '../lib/supabase'

export default function Login() {
  const [username, setUsername] = useState(ADMIN_USERNAME)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (username.trim().toLowerCase() !== ADMIN_USERNAME) {
      setError('Sai tên đăng nhập')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password })
    setBusy(false)
    if (error) setError(error.message.includes('Invalid') ? 'Sai mật khẩu' : error.message)
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <img src="/favicon.svg" alt="" width="56" height="56" className="login-logo" />
        <h1>Quán Sữa Hạt</h1>
        <p className="muted">Đăng nhập để quản lý quán</p>
        <label className="field">
          <span className="field-label">Tên đăng nhập</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
        </label>
        <label className="field">
          <span className="field-label">Mật khẩu</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
