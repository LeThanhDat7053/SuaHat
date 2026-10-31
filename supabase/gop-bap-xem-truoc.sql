-- =====================================================================
--  QUÁN SỮA HẠT — Gộp bắp, BƯỚC 1: XEM TRƯỚC (chỉ đọc, không sửa gì)
--   Liệt kê mọi công thức mẻ / món đang dùng "Bắp" hoặc "Bắp SB",
--   để kiểm tra trước khi chạy file gop-bap.sql.
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Tên nguyên liệu khác thì sửa 2 chữ 'Bắp' / 'Bắp SB' ở dưới cho đúng.
-- =====================================================================

with bap as (
  select id, name, unit, price_per_unit, alt_unit, alt_base, alt_qty
  from ingredients
  where name in ('Bắp', 'Bắp SB')
),
dong as (
  select 'Mẻ' as loai, r.name as cong_thuc, e
  from recipes r, jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) e
  union all
  select 'Món (thêm mỗi phần)', p.name, e
  from products p, jsonb_array_elements(coalesce(p.recipe, '[]'::jsonb)) e
)
select d.loai, d.cong_thuc, b.name as nguyen_lieu, (d.e->>'amount')::numeric as luong, b.unit as don_vi
from dong d
join bap b on b.id = nullif(d.e->>'ingredient_id', '')::bigint
union all
-- dòng cuối: thông tin 2 nguyên liệu (đơn vị, giá)
select 'Nguyên liệu', b.name, b.name, b.price_per_unit, b.unit || ' (giá mỗi ' || b.unit || ')'
from bap b
order by 1, 2, 3;
