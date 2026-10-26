-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v9: Bán sỉ
--   Đơn đánh dấu "Bán sỉ" (đơn nhanh ở Bán hàng hoặc đơn đặt ở Lịch đơn):
--   vẫn cộng doanh thu, giá vốn, trừ nguyên liệu trong kho như đơn thường,
--   nhưng KHÔNG cộng vào số phần / số ly đã bán (để số bán lẻ không bị độn lên).
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao. Dữ liệu cũ giữ nguyên (tính là bán lẻ).
-- =====================================================================

alter table sales add column if not exists w    holesale boolean not null default false;
alter table quick_orders add column if not exists wholesale boolean not null default false;
alter table orders add column if not exists wholesale boolean not null default false;

-- Đơn nhanh "Đã xong": ghi thêm cờ bán sỉ của từng dòng
create or replace function complete_quick_order(p_id bigint, p_rows jsonb)
returns void language plpgsql security invoker as $$
begin
  update quick_orders set status = 'done', done_at = now() where id = p_id and status = 'pending';
  if not found then
    raise exception 'Đơn này đã được bấm xong rồi (hoặc đã bị xóa)';
  end if;
  insert into sales (date, product_id, product_name, source, pack, quantity, unit_price, unit_cost, usage, wholesale)
  select r.date, r.product_id, r.product_name, r.source, r.pack, r.quantity, r.unit_price, r.unit_cost, r.usage, coalesce(r.wholesale, false)
  from jsonb_to_recordset(p_rows) as r(date date, product_id bigint, product_name text, source text, pack text,
                                       quantity integer, unit_price numeric, unit_cost numeric, usage jsonb, wholesale boolean);
end $$;

grant execute on function complete_quick_order(bigint, jsonb) to authenticated;
