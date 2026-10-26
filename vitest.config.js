import { defineConfig } from 'vitest/config'

// Test tự động cho các phép tính tiền / kho: chạy `npm test`
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
