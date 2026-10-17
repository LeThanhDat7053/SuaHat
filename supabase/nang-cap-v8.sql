-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v8: Gia cố tồn kho
--   1) Chốt lượng nguyên liệu của mỗi ly NGAY LÚC BÁN (cột usage).
--      Sau này sửa công thức / "mẻ ra được" / xóa món thì số đã bán trước đó
--      không bị tính lại → kho không tự nhảy lên / xuống.
--   2) Phiếu nhập "đã nằm trong số kiểm kê" (cột in_count): không cộng kho lần 2.
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao. Dữ liệu cũ giữ nguyên
--  (dòng bán cũ chưa có usage thì app vẫn tính theo công thức hiện tại như trước).
-- =====================================================================

-- Lượng nguyên liệu cho 1 phần lúc bán: { "ingredient_id": lượng }
alter table sales add column if not exists usage jsonb;
alter table waste add column if not exists usage jsonb;

-- true = hàng của phiếu này đã có trong số kiểm kê → chỉ tính tiền, không cộng kho
alter table purchases add column if not exists in_count boolean not null default false;

-- Đơn nhanh "Đã xong": ghi thêm usage của từng dòng
create or replace function complete_quick_order(p_id bigint, p_rows jsonb)
returns void language plpgsql security invoker as $$
begin
  update quick_orders set status = 'done', done_at = now() where id = p_id and status = 'pending';
  if not found then
    raise exception 'Đơn này đã được bấm xong rồi (hoặc đã bị xóa)';
  end if;
  insert into sales (date, product_id, product_name, source, pack, quantity, unit_price, unit_cost, usage)
  select r.date, r.product_id, r.product_name, r.source, r.pack, r.quantity, r.unit_price, r.unit_cost, r.usage
  from jsonb_to_recordset(p_rows) as r(date date, product_id bigint, product_name text, source text, pack text,
                                       quantity integer, unit_price numeric, unit_cost numeric, usage jsonb);
end $$;

grant execute on function complete_quick_order(bigint, jsonb) to authenticated;
