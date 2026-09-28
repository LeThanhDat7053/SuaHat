-- =====================================================================
--  XÓA DỮ LIỆU MẪU (tạo bởi du-lieu-mau.sql)
--  Chỉ xóa đúng các dòng mẫu; dữ liệu bạn tự nhập vẫn giữ nguyên.
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
-- =====================================================================

do $$
declare t text;
begin
  if to_regclass('sample_rows') is null then
    raise notice 'Không có dữ liệu mẫu nào để xóa.';
    return;
  end if;
  -- xóa bảng "con" trước, bảng "cha" sau
  foreach t in array array['sales','purchases','expenses','waste','day_closings','stock_counts','orders','notes','products','recipes','ingredients'] loop
    if to_regclass(t) is not null then
      execute format('delete from %I where id in (select id from sample_rows where tbl = %L)', t, t);
    end if;
  end loop;
  drop table sample_rows;
end $$;

-- ---------------------------------------------------------------------
--  MUỐN XÓA SẠCH TOÀN BỘ (cả dữ liệu mẫu lẫn mọi thứ đã nhập thử)
--  để bắt đầu dùng thật từ đầu: bỏ dấu -- ở dòng dưới rồi chạy riêng.
--  KHÔNG thể hoàn tác.
-- ---------------------------------------------------------------------
-- truncate sales, purchases, expenses, waste, day_closings, stock_counts, orders, notes, products, recipes, ingredients, settings restart identity cascade; drop table if exists sample_rows;
