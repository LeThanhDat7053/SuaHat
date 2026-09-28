// Tạo icon PNG cho PWA (giọt sữa màu kem trên nền nâu) — chạy: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x7b, 0x4a, 0x26]
const FG = [0xf6, 0xea, 0xd8]
const NUT = [0xc8, 0x8a, 0x55]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// Hình giọt nước: hình tròn phía dưới + tam giác nhọn phía trên (toạ độ 0..1)
const cx = 0.5, cy = 0.58, r = 0.2, tipY = 0.2
function inDrop(x, y) {
  const dx = x - cx, dy = y - cy
  if (dx * dx + dy * dy <= r * r) return true
  // đường tiếp tuyến từ đỉnh tới hình tròn, chỉ tới điểm tiếp xúc
  const d = cy - tipY
  const tangentY = cy - (r * r) / d
  if (y < tipY || y > tangentY) return false
  const half = ((y - tipY) * r) / Math.sqrt(d * d - r * r)
  return Math.abs(dx) <= half
}
function inNut(x, y) {
  const dx = (x - 0.5) / 0.075, dy = (y - 0.6) / 0.1
  return dx * dx + dy * dy <= 1
}

function png(size) {
  const S = 4 // khử răng cưa
  const rows = []
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0]
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size
          const y = (py + (sy + 0.5) / S) / size
          const c = inDrop(x, y) ? (inNut(x, y) ? NUT : FG) : BG
          acc = acc.map((v, i) => v + c[i])
        }
      acc.forEach((v, i) => (row[1 + px * 3 + i] = Math.round(v / (S * S))))
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/apple-touch-icon.png', png(180))
console.log('Đã tạo icon trong thư mục public/')
