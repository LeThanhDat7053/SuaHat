-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v7: Nguyên liệu "Nhà có / không tính kho" + quy đổi đơn vị mua
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao.
-- =====================================================================

-- Nhà có / không tính kho: không tính tiền vào giá vốn, không trừ tồn kho
-- (gạo rang nhà có sẵn, trái cây mua chợ khó định lượng…)
alter table ingredients add column if not exists no_stock boolean not null default false;

-- (Không còn dùng trong app, giữ lại cho file chạy lại được) Mua theo bịch / gói:
-- buy_unit = 'bịch', buy_size = 1000  →  1 bịch = 1000 (đơn vị của nguyên liệu)
alter table ingredients add column if not exists buy_unit text;
alter table ingredients add column if not exists buy_size numeric;

-- Tính tiền 1 lần lúc mua (sữa đặc, đường…): tiền mua trừ thẳng vào lãi ngày mua,
-- ly bán ra không tính tiền nguyên liệu này nữa, nhưng vẫn trừ kho + báo sắp hết
alter table ingredients add column if not exists cost_on_buy boolean not null default false;

-- Quy đổi trong công thức: alt_base (đơn vị gốc) = alt_qty alt_unit. VD trà: 44 g = 380 ml
alter table ingredients add column if not exists alt_unit text;
alter table ingredients add column if not exists alt_base numeric;
alter table ingredients add column if not exists alt_qty numeric;
