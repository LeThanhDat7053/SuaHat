-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v2
--  Công thức theo mẻ, nhiều size, tồn kho + kiểm kê, hàng hủy,
--  tặng / giảm giá, đơn đặt tính vào doanh thu, chốt tiền cuối ngày.
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy sau schema.sql. Chạy lại nhiều lần cũng không sao,
--  dữ liệu cũ được giữ nguyên.
-- =====================================================================

-- Công thức 1 mẻ nấu: nguyên liệu cho cả mẻ + mẻ đó ra được bao nhiêu ml
create table if not exists recipes (
  id bigint generated always as identity primary key,
  name text not null,
  items jsonb not null default '[]'::jsonb,     -- [{ "ingredient_id": 1, "amount": 500 }] cho 1 mẻ
  yield_ml numeric not null default 0,          -- 1 mẻ ra bao nhiêu ml thành phẩm
  note text,
  created_at timestamptz not null default now()
);

-- Sản phẩm = công thức mẻ × dung tích (nhiều size dùng chung 1 công thức)
-- products.recipe (cũ) giờ là "nguyên liệu thêm cho mỗi phần": chai, nắp, topping…
alter table products add column if not exists recipe_id bigint references recipes(id) on delete set null;
alter table products add column if not exists volume_ml numeric not null default 0;

-- Báo sắp hết hàng khi tồn dưới mức này (theo đơn vị của nguyên liệu)
alter table ingredients add column if not exists min_stock numeric not null default 0;

-- Bán hàng: tách nguồn (quán / đơn đặt), ghi tặng và giảm giá
alter table sales add column if not exists source text not null default '';   -- '' = bán tại quán, 'order:12' = từ đơn đặt số 12
alter table sales add column if not exists gift_qty integer not null default 0; -- số phần tặng (tính giá vốn, không có doanh thu)
alter table sales add column if not exists discount numeric not null default 0; -- tổng tiền giảm giá của dòng này
alter table sales drop constraint if exists sales_date_product_id_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_date_product_source_key') then
    alter table sales add constraint sales_date_product_source_key unique (date, product_id, source);
  end if;
end $$;

-- Đơn đặt: món có cấu trúc để tự tính tiền và tự ghi doanh thu khi giao
alter table orders add column if not exists lines jsonb not null default '[]'::jsonb; -- [{ "product_id", "name", "qty", "price" }]
alter table orders add column if not exists discount numeric not null default 0;

-- Hàng hủy / đổ bỏ (quá hạn, hỏng, đổ vỡ)
create table if not exists waste (
  id bigint generated always as identity primary key,
  date date not null,
  product_id bigint references products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 0,
  unit_cost numeric not null default 0,         -- giá vốn tại thời điểm hủy
  reason text,
  created_at timestamptz not null default now(),
  unique (date, product_id)
);

-- Kiểm kê: số tồn thực tế cân / đếm được vào CUỐI ngày `date`
create table if not exists stock_counts (
  id bigint generated always as identity primary key,
  date date not null,
  ingredient_id bigint not null references ingredients(id) on delete cascade,
  counted numeric not null,                     -- tồn thực tế
  expected numeric not null default 0,          -- tồn theo sổ sách lúc kiểm
  unit_price numeric not null default 0,        -- giá 1 đơn vị lúc kiểm (tính tiền hao hụt)
  note text,
  created_at timestamptz not null default now()
);

-- Chốt tiền cuối ngày
create table if not exists day_closings (
  id bigint generated always as identity primary key,
  date date not null unique,
  cash numeric not null default 0,              -- tiền mặt trong két
  transfer numeric not null default 0,          -- tiền chuyển khoản nhận được
  note text,
  created_at timestamptz not null default now()
);

-- Cài đặt chung (vd: ngưỡng cảnh báo lãi)
create table if not exists settings (
  key text primary key,
  value jsonb
);

create index if not exists waste_date_idx on waste (date);
create index if not exists stock_counts_date_idx on stock_counts (date);

do $$
declare t text;
begin
  foreach t in array array['recipes','waste','stock_counts','day_closings','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "admin_all" on %I', t);
    execute format('create policy "admin_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
