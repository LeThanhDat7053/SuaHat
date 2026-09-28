-- =====================================================================
--  QUÁN SỮA HẠT — Cấu trúc database
--  Cách dùng: Supabase Dashboard → SQL Editor → New query → dán toàn bộ
--  file này vào → bấm RUN. Chỉ cần chạy 1 lần.
--  Sau đó chạy tiếp file nang-cap-v2.sql.
-- =====================================================================

-- Nguyên liệu (hạt điều, hạnh nhân, đường, ly, nắp...)
create table if not exists ingredients (
  id bigint generated always as identity primary key,
  name text not null,
  unit text not null default 'g',
  price_per_unit numeric not null default 0,   -- giá cho 1 đơn vị (vd: 250đ / g)
  created_at timestamptz not null default now()
);

-- Nhập hàng: mỗi lần đi mua nguyên liệu
create table if not exists purchases (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  ingredient_id bigint references ingredients(id) on delete set null,
  item_name text not null,                      -- lưu tên để giữ lịch sử kể cả khi xóa nguyên liệu
  quantity numeric not null,
  unit text,
  total numeric not null,                       -- tổng tiền trả
  note text,
  created_at timestamptz not null default now()
);

-- Sản phẩm / menu, kèm công thức để tính giá vốn
create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric not null default 0,             -- giá bán
  extra_cost numeric not null default 0,        -- chi phí ly, nắp, ống hút, tem...
  recipe jsonb not null default '[]'::jsonb,    -- [{ "ingredient_id": 1, "amount": 40 }]
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Bán hàng: số lượng bán mỗi món mỗi ngày
create table if not exists sales (
  id bigint generated always as identity primary key,
  date date not null,
  product_id bigint references products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 0,
  unit_price numeric not null default 0,        -- giá bán tại thời điểm bán
  unit_cost numeric not null default 0,         -- giá vốn tại thời điểm bán
  created_at timestamptz not null default now(),
  unique (date, product_id)
);

-- Chi phí khác: mặt bằng, điện, nước, lương...
create table if not exists expenses (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  category text not null,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

-- Đơn đặt trước (hiện trên lịch)
create table if not exists orders (
  id bigint generated always as identity primary key,
  order_date date not null,
  order_time time,
  customer text not null,
  phone text,
  items text,
  total numeric not null default 0,
  deposit numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  note text,
  created_at timestamptz not null default now()
);

-- Ghi chú theo ngày (hiện trên lịch)
create table if not exists notes (
  id bigint generated always as identity primary key,
  date date not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists sales_date_idx on sales (date);
create index if not exists purchases_date_idx on purchases (date);
create index if not exists expenses_date_idx on expenses (date);
create index if not exists orders_date_idx on orders (order_date);
create index if not exists notes_date_idx on notes (date);

-- ---------------------------------------------------------------------
-- Bảo mật: chỉ tài khoản đã đăng nhập mới đọc/ghi được dữ liệu
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ingredients','purchases','products','sales','expenses','orders','notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "admin_all" on %I', t);
    execute format('create policy "admin_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
