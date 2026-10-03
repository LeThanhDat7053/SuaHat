import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { setupUpdates } from './lib/pwa'

setupUpdates()

// Máy tính bảng Android cài app lúc còn khóa dọc: mở khóa xoay (máy không hỗ trợ thì bỏ qua)
try {
  screen.orientation?.unlock?.()
} catch {
  /* bỏ qua */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
