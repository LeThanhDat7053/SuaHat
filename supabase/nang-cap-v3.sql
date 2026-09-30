-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v3: Lập đơn nhanh (thay đơn giấy), bán Ly / Chai
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy sau nang-cap-v2.sql. Chạy lại nhiều lần cũng không sao.
-- =====================================================================

-- Phụ thu / giá vốn thêm khi bán dạng Chai, riêng từng món.
-- Để trống (null) = dùng mức chung trong Cài đặt (mặc định +3.000đ bán, +2.500đ vốn).
alter table products add column if not exists chai_surcharge numeric;
alter table products add column if not exists chai_cost numeric;

-- Bán hàng: ghi rõ Ly hay Chai ('' = không phân loại, dữ liệu cũ)
alter table sales add column if not exists pack text not null default '';

-- Đơn lập nhanh tại quầy: chốt xong thì chờ giao (vàng), giao xong thì ghi vào bán hàng
create table if not exists quick_orders (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  note text,                                    -- tên khách / số thứ tự
  lines jsonb not null default '[]'::jsonb,     -- [{ product_id, name, pack: 'ly'|'chai', qty, price, cost }]
  total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quick_orders_date_idx on quick_orders (date);
create index if not exists quick_orders_status_idx on quick_orders (status);

alter table quick_orders enable row level security;
drop policy if exists "admin_all" on quick_orders;
create policy "admin_all" on quick_orders for all to authenticated using (true) with check (true);

-- Bấm "Đã xong": đánh dấu đơn xong + ghi các dòng bán hàng trong CÙNG 1 lần,
-- để không bao giờ có đơn "xong" mà thiếu doanh thu, và 2 máy bấm cùng lúc cũng chỉ ghi 1 lần.
create or replace function complete_quick_order(p_id bigint, p_rows jsonb)
returns void language plpgsql security invoker as $$
begin
  update quick_orders set status = 'done', done_at = now() where id = p_id and status = 'pending';
  if not found then
    raise exception 'Đơn này đã được bấm xong rồi (hoặc đã bị xóa)';
  end if;
  insert into sales (date, product_id, product_name, source, pack, quantity, unit_price, unit_cost)
  select r.date, r.product_id, r.product_name, r.source, r.pack, r.quantity, r.unit_price, r.unit_cost
  from jsonb_to_recordset(p_rows) as r(date date, product_id bigint, product_name text, source text, pack text,
                                       quantity integer, unit_price numeric, unit_cost numeric);
end $$;

-- Mở lại đơn đã xong (bấm nhầm): gỡ doanh thu của đơn, đưa về "đang chờ"
create or replace function reopen_quick_order(p_id bigint)
returns void language plpgsql security invoker as $$
begin
  delete from sales where source like 'quick:' || p_id || ':%';
  update quick_orders set status = 'pending', done_at = null where id = p_id;
end $$;

grant execute on function complete_quick_order(bigint, jsonb) to authenticated;
grant execute on function reopen_quick_order(bigint) to authenticated;
