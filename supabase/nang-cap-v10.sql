-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v10: Bán hàng khi mất mạng
--   Lập đơn / "Xong luôn" lúc mất mạng: app lưu đơn trong máy, có mạng lại tự gửi lên.
--   Mỗi đơn mang 1 mã riêng (client_id) do máy tạo → gửi lại bao nhiêu lần
--   (mạng chập chờn, gửi xong mà chưa kịp nhận kết quả) cũng chỉ ghi 1 lần, không cộng tiền 2 lần.
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao. Dữ liệu cũ giữ nguyên.
-- =====================================================================

-- cột của các bản nâng cấp trước (đề phòng chưa chạy v8 / v9)
alter table sales add column if not exists usage jsonb;
alter table sales add column if not exists wholesale boolean not null default false;
alter table quick_orders add column if not exists wholesale boolean not null default false;

alter table quick_orders add column if not exists client_id text;
create unique index if not exists quick_orders_client_id_key on quick_orders (client_id);

-- Lưu 1 đơn nhanh (kèm ghi doanh thu nếu "Xong luôn") trong CÙNG 1 lần.
--   p_order: { date, note, lines, total, wholesale, created_at, done_at }
--   p_rows : các dòng bán (null = đơn chờ giao). Mã đơn trong source ghi là {id}, ở đây thay bằng số đơn thật.
-- Đơn có client_id này đã lưu rồi → trả lại đơn cũ, không ghi gì thêm.
create or replace function save_quick_order(p_client_id text, p_order jsonb, p_rows jsonb)
returns quick_orders language plpgsql security invoker as $$
declare
  v quick_orders;
begin
  select * into v from quick_orders where client_id = p_client_id;
  if found then
    return v;
  end if;

  begin
    insert into quick_orders (date, note, lines, total, wholesale, client_id, created_at)
    values (
      (p_order->>'date')::date,
      nullif(p_order->>'note', ''),
      coalesce(p_order->'lines', '[]'::jsonb),
      coalesce((p_order->>'total')::numeric, 0),
      coalesce((p_order->>'wholesale')::boolean, false),
      p_client_id,
      coalesce((p_order->>'created_at')::timestamptz, now())
    )
    returning * into v;
  exception when unique_violation then
    -- lần gửi trước (chưa kịp báo kết quả) vừa lưu xong cùng lúc → dùng đơn đó
    select * into v from quick_orders where client_id = p_client_id;
    return v;
  end;

  if p_rows is not null and jsonb_typeof(p_rows) = 'array' then
    update quick_orders set status = 'done', done_at = coalesce((p_order->>'done_at')::timestamptz, now())
    where id = v.id
    returning * into v;

    insert into sales (date, product_id, product_name, source, pack, quantity, unit_price, unit_cost, usage, wholesale)
    select r.date, r.product_id, r.product_name, replace(r.source, '{id}', v.id::text), r.pack, r.quantity,
           r.unit_price, r.unit_cost, r.usage, coalesce(r.wholesale, false)
    from jsonb_to_recordset(p_rows) as r(date date, product_id bigint, product_name text, source text, pack text,
                                         quantity integer, unit_price numeric, unit_cost numeric, usage jsonb, wholesale boolean);
  end if;
  return v;
end $$;

grant execute on function save_quick_order(text, jsonb, jsonb) to authenticated;
