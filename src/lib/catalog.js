import { supabase } from './supabase'
import { cached, peek } from './cache'
import { withKept } from './keep'

// Món, nguyên liệu, công thức: dùng ở nhiều trang, ít thay đổi → dùng lại trong 1 phút.
// Giữ bản sao trong máy: mất mạng vẫn mở được trang Bán hàng với đúng menu, giá, công thức.
const KEY = 'catalog'

async function fetchCatalog() {
  const [p, i, r] = await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('ingredients').select('*').order('name'),
    supabase.from('recipes').select('*').order('name'),
  ])
  const error = p.error || i.error || r.error
  if (error) throw error
  return { products: p.data, ingredients: i.data, recipes: r.data }
}

export const loadCatalog = (maxAge = 60000) => cached(KEY, () => withKept(KEY, fetchCatalog), maxAge)
export const peekCatalog = () => peek(KEY)
