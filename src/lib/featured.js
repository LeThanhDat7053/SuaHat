import { getSettingStrict } from './supabase'
import { withKept } from './keep'
import { cached } from './cache'

// Món đang bán mấy hôm nay (đánh sao ở trang Bán hàng): chọn 1 lần, giữ tới khi đổi, mọi máy dùng chung
export const FEATURED_KEY = 'featured_products'
export const loadFeatured = () => cached(FEATURED_KEY, () => withKept(FEATURED_KEY, () => getSettingStrict(FEATURED_KEY, [])), 0)
