// Nhóm nguyên liệu. Nguyên liệu chưa chọn nhóm → tự đoán theo tên (sửa lại được trong form).
export const ING_CATEGORIES = [
  'Hạt & đậu',
  'Ngũ cốc',
  'Trái cây',
  'Củ quả',
  'Bột',
  'Trà & cà phê',
  'Sữa & nước',
  'Đường & gia vị',
  'Bao bì',
  'Khác',
]

// Tên nhóm của bản trước → coi như chưa chọn, để app xếp lại theo nhóm mới
const LEGACY = new Set(['Hạt & ngũ cốc', 'Tạo ngọt & hương vị'])

// Xét lần lượt từ trên xuống, gặp nhóm nào có từ khóa trước thì lấy nhóm đó. Thứ tự quan trọng:
//   "Chai sữa" → Bao bì · "Nước đường" → Đường, còn "Sữa tươi không đường" → Sữa
//   "Hạt kê nếp" → Ngũ cốc (kê) · "Hạt bí xanh" → Hạt, còn "Bí đỏ" → Củ quả
//   "Lá dứa" → gia vị, còn "Dứa" → Trái cây
const RULES = [
  ['Bao bì', ['chai', 'nắp', 'ly', 'cốc', 'ống hút', 'tem', 'nhãn', 'túi', 'màng', 'hộp', 'hũ', 'lọ', 'muỗng', 'thìa', 'băng keo', 'giấy', 'bao bì', 'khay']],
  ['Đường & gia vị', ['nước đường', 'siro', 'syrup', 'mật ong', 'lá dứa', 'lá nếp']],
  ['Sữa & nước', ['sữa', 'nước', 'kem', 'whipping', 'cốt dừa', 'đá', 'đá viên']],
  ['Trà & cà phê', ['trà', 'chè', 'cà phê', 'cafe', 'coffee']],
  ['Bột', ['bột', 'cacao', 'ca cao', 'matcha', 'socola', 'chocolate', 'năng']],
  ['Ngũ cốc', ['gạo', 'yến mạch', 'kê', 'kiều mạch', 'lúa mạch', 'diêm mạch', 'quinoa', 'cốm', 'nếp', 'ngũ cốc', 'lúa']],
  [
    'Hạt & đậu',
    ['hạt', 'đậu', 'điều', 'hạnh nhân', 'óc chó', 'macca', 'mắc ca', 'mè', 'vừng', 'lanh', 'chia', 'sen', 'hướng dương', 'lạc', 'phỉ', 'dẻ', 'hồ đào', 'hồ trăn'],
  ],
  [
    'Trái cây',
    ['chuối', 'táo', 'chà là', 'xoài', 'dâu', 'bơ', 'dừa', 'nho', 'cam', 'mít', 'sầu riêng', 'thanh long', 'dứa', 'thơm', 'kỷ tử', 'long nhãn', 'nhãn nhục', 'việt quất', 'mơ', 'lê', 'ổi', 'đu đủ', 'dưa'],
  ],
  ['Củ quả', ['khoai', 'bí', 'bắp', 'ngô', 'cà rốt', 'củ', 'dền', 'sắn', 'bầu', 'cải', 'rau']],
  ['Đường & gia vị', ['đường', 'muối', 'vani', 'vanilla', 'quế', 'gừng', 'hương', 'tiêu', 'hồi']],
]

const norm = (s) => ` ${String(s || '').toLowerCase().normalize('NFC').replace(/[()[\],.;:/+\-–]/g, ' ').replace(/\s+/g, ' ')} `

// tìm từ khóa đứng riêng (không khớp "ly" trong "lyn", "kê" trong "kêu"…)
const hasWord = (text, kw) => text.includes(` ${kw} `)

export function guessCategory(name, unit) {
  const text = norm(name)
  for (const [cat, kws] of RULES) if (kws.some((kw) => hasWord(text, kw))) return cat
  if (unit === 'cái' || unit === 'chai' || unit === 'hộp') return 'Bao bì'
  if (unit === 'ml') return 'Sữa & nước'
  return 'Khác'
}

export const categoryOf = (g) => (g.category && !LEGACY.has(g.category) ? g.category : guessCategory(g.name, g.unit))

// Gom nguyên liệu theo nhóm, đúng thứ tự nhóm; nhóm tự đặt (ngoài danh sách) để cuối
export function groupByCategory(list) {
  const groups = {}
  list.forEach((g) => (groups[categoryOf(g)] ||= []).push(g))
  const order = [...ING_CATEGORIES, ...Object.keys(groups).filter((c) => !ING_CATEGORIES.includes(c)).sort()]
  return order.filter((c) => groups[c]).map((c) => [c, groups[c]])
}

// Tìm không dấu: "hat dieu" khớp "Hạt điều"
export const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
