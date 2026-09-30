-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v5: Đồng bộ tức thì giữa các máy
--  Máy này thêm đơn / bán hàng / nhập hàng… → máy khác đang mở app tự cập nhật
--  trong khoảng 1 giây, không cần tải lại trang.
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao. Bảng nào chưa có (chưa chạy v3 / v4) thì tự bỏ qua.
-- =====================================================================

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'sales', 'waste', 'orders', 'notes', 'quick_orders', 'products', 'ingredients', 'recipes',
    'purchases', 'stock_counts', 'expenses', 'recurring_expenses', 'day_closings', 'settings'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t)
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
