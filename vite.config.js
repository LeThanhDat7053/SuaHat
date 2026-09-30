import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // tự cập nhật do src/lib/pwa.js lo, để kiểm soát lúc tải lại
      injectRegister: null,
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'Quản lý Quán Sữa Hạt',
        short_name: 'Sữa Hạt',
        description: 'Tính chi phí, doanh thu và lịch đơn đặt cho quán sữa hạt',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf6f0',
        theme_color: '#7b4a26',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        importScripts: ['sw-notify.js'], // bấm thông báo báo thức → mở Lịch đơn
      },
    }),
  ],
})
