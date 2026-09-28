-- =====================================================================
--  DỮ LIỆU MẪU để thử app  (cần chạy schema.sql và nang-cap-v2.sql trước)
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Xóa đi bằng file xoa-du-lieu-mau.sql (chỉ xóa đúng dữ liệu mẫu,
--  không đụng dữ liệu thật bạn tự nhập).
-- =====================================================================

-- Bảng ghi lại id các dòng mẫu để xóa cho chính xác
create table if not exists sample_rows (tbl text not null, id bigint not null);
alter table sample_rows enable row level security; -- app không đọc được bảng này

-- Giá vốn 1 phần (giống cách app tính): chi phí phụ + nguyên liệu thêm + phần của mẻ
create or replace function pg_temp.sample_cost(pid bigint) returns numeric language sql as $$
  select p.extra_cost
    + coalesce((select sum((x->>'amount')::numeric * g.price_per_unit)
                from jsonb_array_elements(p.recipe) x join ingredients g on g.id = (x->>'ingredient_id')::bigint), 0)
    + coalesce((select sum((x->>'amount')::numeric * g.price_per_unit) / nullif(r.yield_ml, 0) * p.volume_ml
                from recipes r, jsonb_array_elements(r.items) x join ingredients g on g.id = (x->>'ingredient_id')::bigint
                where r.id = p.recipe_id group by r.yield_ml), 0)
  from products p where p.id = pid
$$;

do $$
declare
  -- nguyên liệu
  i_dieu bigint; i_hanhnhan bigint; i_occho bigint; i_daunanh bigint; i_yenmach bigint;
  i_duong bigint; i_chala bigint; i_suatuoi bigint; i_nuoc bigint; i_chai500 bigint; i_chai330 bigint;
  -- công thức mẻ
  r_dieu bigint; r_hanhnhan bigint; r_occho bigint; r_daunanh bigint; r_yenmach bigint;
  -- sản phẩm
  p_dieu500 bigint; p_dieu330 bigint; p_hanhnhan bigint; p_occho bigint; p_daunanh bigint; p_yenmach bigint;
  o_id bigint;
begin
  if not exists (select 1 from information_schema.columns where table_name = 'sales' and column_name = 'source') then
    raise exception 'Chưa nâng cấp database. Chạy nang-cap-v2.sql trước rồi chạy lại file này.';
  end if;
  if exists (select 1 from sample_rows) then
    raise exception 'Dữ liệu mẫu đã có rồi. Chạy xoa-du-lieu-mau.sql trước nếu muốn tạo lại.';
  end if;

  -- ---------------------------------------------------------------
  -- 1) NGUYÊN LIỆU — giá bình quân 1 đơn vị (g / ml / cái)
  --    min_stock: báo "sắp hết" khi tồn dưới mức này
  -- ---------------------------------------------------------------
  insert into ingredients (name, unit, price_per_unit, min_stock) values ('Hạt điều', 'g', 280, 1000) returning id into i_dieu;        -- 280.000đ/kg
  insert into ingredients (name, unit, price_per_unit, min_stock) values ('Hạnh nhân', 'g', 320, 1000) returning id into i_hanhnhan;   -- 320.000đ/kg
  insert into ingredients (name, unit, price_per_unit) values ('Óc chó', 'g', 400) returning id into i_occho;                           -- 400.000đ/kg
  insert into ingredients (name, unit, price_per_unit) values ('Đậu nành', 'g', 35) returning id into i_daunanh;                        --  35.000đ/kg
  insert into ingredients (name, unit, price_per_unit) values ('Yến mạch', 'g', 90) returning id into i_yenmach;                        --  90.000đ/kg
  insert into ingredients (name, unit, price_per_unit) values ('Đường phèn', 'g', 40) returning id into i_duong;                        --  40.000đ/kg
  insert into ingredients (name, unit, price_per_unit) values ('Chà là', 'g', 150) returning id into i_chala;                           -- 150.000đ/kg
  insert into ingredients (name, unit, price_per_unit, min_stock) values ('Sữa tươi không đường', 'ml', 35, 1000) returning id into i_suatuoi; -- 35.000đ/lít
  insert into ingredients (name, unit, price_per_unit) values ('Nước lọc (bình 20L)', 'ml', 1) returning id into i_nuoc;                --  1.000đ/lít
  insert into ingredients (name, unit, price_per_unit, min_stock) values ('Chai nhựa 500ml', 'cái', 1500, 50) returning id into i_chai500;
  insert into ingredients (name, unit, price_per_unit, min_stock) values ('Chai nhựa 330ml', 'cái', 1200, 30) returning id into i_chai330;
  insert into sample_rows select 'ingredients', unnest(array[i_dieu, i_hanhnhan, i_occho, i_daunanh, i_yenmach, i_duong, i_chala, i_suatuoi, i_nuoc, i_chai500, i_chai330]);

  -- ---------------------------------------------------------------
  -- 2) CÔNG THỨC MẺ — nguyên liệu cho 1 lần nấu + mẻ ra được bao nhiêu ml
  -- ---------------------------------------------------------------
  insert into recipes (name, yield_ml, note, items) values ('Sữa hạt điều', 5000, 'Ngâm hạt 6 tiếng', jsonb_build_array(
      jsonb_build_object('ingredient_id', i_dieu,  'amount', 500),
      jsonb_build_object('ingredient_id', i_duong, 'amount', 150),
      jsonb_build_object('ingredient_id', i_nuoc,  'amount', 4500))) returning id into r_dieu;
  insert into recipes (name, yield_ml, items) values ('Sữa hạnh nhân', 5000, jsonb_build_array(
      jsonb_build_object('ingredient_id', i_hanhnhan, 'amount', 500),
      jsonb_build_object('ingredient_id', i_chala,    'amount', 200),
      jsonb_build_object('ingredient_id', i_nuoc,     'amount', 4500))) returning id into r_hanhnhan;
  insert into recipes (name, yield_ml, items) values ('Sữa óc chó', 4500, jsonb_build_array(
      jsonb_build_object('ingredient_id', i_occho,   'amount', 400),
      jsonb_build_object('ingredient_id', i_suatuoi, 'amount', 1500),
      jsonb_build_object('ingredient_id', i_duong,   'amount', 150),
      jsonb_build_object('ingredient_id', i_nuoc,    'amount', 2500))) returning id into r_occho;
  insert into recipes (name, yield_ml, items) values ('Sữa đậu nành', 9000, jsonb_build_array(
      jsonb_build_object('ingredient_id', i_daunanh, 'amount', 1000),
      jsonb_build_object('ingredient_id', i_duong,   'amount', 400),
      jsonb_build_object('ingredient_id', i_nuoc,    'amount', 9000))) returning id into r_daunanh;
  insert into recipes (name, yield_ml, items) values ('Sữa yến mạch', 4500, jsonb_build_array(
      jsonb_build_object('ingredient_id', i_yenmach, 'amount', 500),
      jsonb_build_object('ingredient_id', i_suatuoi, 'amount', 2000),
      jsonb_build_object('ingredient_id', i_chala,   'amount', 150),
      jsonb_build_object('ingredient_id', i_nuoc,    'amount', 2000))) returning id into r_yenmach;
  insert into sample_rows select 'recipes', unnest(array[r_dieu, r_hanhnhan, r_occho, r_daunanh, r_yenmach]);

  -- ---------------------------------------------------------------
  -- 3) SẢN PHẨM = công thức mẻ × dung tích + chai + chi phí phụ (nắp, tem)
  --    Sữa hạt điều có 2 size dùng chung 1 công thức
  -- ---------------------------------------------------------------
  insert into products (name, price, extra_cost, recipe_id, volume_ml, recipe) values
    ('Sữa hạt điều 500ml', 35000, 500, r_dieu, 500, jsonb_build_array(jsonb_build_object('ingredient_id', i_chai500, 'amount', 1))) returning id into p_dieu500;
  insert into products (name, price, extra_cost, recipe_id, volume_ml, recipe) values
    ('Sữa hạt điều 330ml', 25000, 500, r_dieu, 330, jsonb_build_array(jsonb_build_object('ingredient_id', i_chai330, 'amount', 1))) returning id into p_dieu330;
  insert into products (name, price, extra_cost, recipe_id, volume_ml, recipe) values
    ('Sữa hạnh nhân 500ml', 38000, 500, r_hanhnhan, 500, jsonb_build_array(jsonb_build_object('ingredient_id', i_chai500, 'amount', 1))) returning id into p_hanhnhan;
  insert into products (name, price, extra_cost, recipe_id, volume_ml, recipe) values
    ('Sữa óc chó 500ml', 40000, 500, r_occho, 500, jsonb_build_array(jsonb_build_object('ingredient_id', i_chai500, 'amount', 1))) returning id into p_occho;
  insert into products (name, price, extra_cost, recipe_id, volume_ml, recipe) values
    ('Sữa đậu nành 500ml', 15000, 500, r_daunanh, 500, jsonb_build_array(jsonb_build_object('ingredient_id', i_chai500, 'amount', 1))) returning id into p_daunanh;
  insert into products (name, price, extra_cost, recipe_id, volume_ml, recipe) values
    ('Sữa yến mạch 500ml', 30000, 500, r_yenmach, 500, jsonb_build_array(jsonb_build_object('ingredient_id', i_chai500, 'amount', 1))) returning id into p_yenmach;
  insert into sample_rows select 'products', unnest(array[p_dieu500, p_dieu330, p_hanhnhan, p_occho, p_daunanh, p_yenmach]);

  -- ---------------------------------------------------------------
  -- 4) KIỂM KÊ ĐẦU KỲ (8 ngày trước) — tồn kho tính từ đây
  --    hạt điều & đường lệch sổ sách một chút để thấy "hao hụt"
  -- ---------------------------------------------------------------
  with ins as (
    insert into stock_counts (date, ingredient_id, counted, expected, unit_price, note) values
      (current_date - 8, i_dieu,     2000,  2150, 280, 'Kiểm kê đầu kỳ'),
      (current_date - 8, i_hanhnhan, 1500,  1500, 320, 'Kiểm kê đầu kỳ'),
      (current_date - 8, i_occho,    2500,  2500, 400, 'Kiểm kê đầu kỳ'),
      (current_date - 8, i_daunanh,  3000,  3000, 35,  'Kiểm kê đầu kỳ'),
      (current_date - 8, i_yenmach,  3000,  3000, 90,  'Kiểm kê đầu kỳ'),
      (current_date - 8, i_duong,    3000,  3300, 40,  'Kiểm kê đầu kỳ'),
      (current_date - 8, i_chala,    2000,  2000, 150, 'Kiểm kê đầu kỳ'),
      (current_date - 8, i_suatuoi,  5000,  5000, 35,  'Kiểm kê đầu kỳ'),
      (current_date - 8, i_nuoc,    20000, 20000, 1,   'Kiểm kê đầu kỳ'),
      (current_date - 8, i_chai500,   200,   200, 1500, 'Kiểm kê đầu kỳ'),
      (current_date - 8, i_chai330,   100,   100, 1200, 'Kiểm kê đầu kỳ')
    returning id
  )
  insert into sample_rows select 'stock_counts', id from ins;

  -- ---------------------------------------------------------------
  -- 5) NHẬP HÀNG — mua theo kg / lít, app lưu theo g / ml
  -- ---------------------------------------------------------------
  with ins as (
    insert into purchases (date, ingredient_id, item_name, quantity, unit, total, note) values
      (current_date - 20, i_dieu,     'Hạt điều',             3000, 'g',   810000, 'Chợ Bà Chiểu'),
      (current_date - 20, i_daunanh,  'Đậu nành',             5000, 'g',   175000, null),
      (current_date - 18, i_occho,    'Óc chó',               2000, 'g',   800000, null),
      (current_date - 18, i_yenmach,  'Yến mạch',             3000, 'g',   270000, null),
      (current_date - 6,  i_suatuoi,  'Sữa tươi không đường', 10000, 'ml', 350000, '10 hộp 1 lít'),
      (current_date - 5,  i_dieu,     'Hạt điều',             3000, 'g',   870000, 'Lên giá 290k/kg'),
      (current_date - 5,  i_nuoc,     'Nước lọc (bình 20L)', 60000, 'ml',   60000, '3 bình'),
      (current_date - 4,  i_daunanh,  'Đậu nành',             4000, 'g',   140000, null),
      (current_date - 4,  i_duong,    'Đường phèn',           2000, 'g',    80000, null),
      (current_date - 4,  i_chai500,  'Chai nhựa 500ml',       200, 'cái', 300000, 'Kèm nắp'),
      (current_date - 3,  i_hanhnhan, 'Hạnh nhân',            2000, 'g',   640000, null),
      (current_date - 2,  i_suatuoi,  'Sữa tươi không đường', 6000, 'ml',  210000, null),
      (current_date - 2,  i_nuoc,     'Nước lọc (bình 20L)', 60000, 'ml',   60000, '3 bình')
    returning id
  )
  insert into sample_rows select 'purchases', id from ins;

  -- ---------------------------------------------------------------
  -- 6) BÁN HÀNG TẠI QUÁN — 14 ngày gần nhất, số lượng ngẫu nhiên
  -- ---------------------------------------------------------------
  with ins as (
    insert into sales (date, product_id, product_name, source, quantity, unit_price, unit_cost)
    select d::date, p.id, p.name, '',
           1 + floor(random() * 10)::int + case when p.price < 20000 then 6 else 0 end,
           p.price, pg_temp.sample_cost(p.id)
    from generate_series(current_date - 13, current_date, interval '1 day') d
    cross join products p
    where p.id in (p_dieu500, p_dieu330, p_hanhnhan, p_occho, p_daunanh, p_yenmach)
    returning id
  )
  insert into sample_rows select 'sales', id from ins;

  -- vài ngày có tặng khách / giảm giá khách quen
  update sales set gift_qty = 1 where product_id = p_daunanh and date in (current_date - 1, current_date - 5, current_date - 9);
  update sales set discount = 15000 where product_id = p_dieu500 and date in (current_date - 2, current_date - 6);

  -- ---------------------------------------------------------------
  -- 7) HÀNG HỦY
  -- ---------------------------------------------------------------
  with ins as (
    insert into waste (date, product_id, product_name, quantity, unit_cost, reason) values
      (current_date - 6, p_occho,    'Sữa óc chó 500ml',    2, pg_temp.sample_cost(p_occho),    'Quá hạn'),
      (current_date - 2, p_hanhnhan, 'Sữa hạnh nhân 500ml', 1, pg_temp.sample_cost(p_hanhnhan), 'Đổ vỡ'),
      (current_date - 1, p_daunanh,  'Sữa đậu nành 500ml',  3, pg_temp.sample_cost(p_daunanh),  'Nấu dư, quá hạn')
    returning id
  )
  insert into sample_rows select 'waste', id from ins;

  -- ---------------------------------------------------------------
  -- 8) CHI PHÍ KHÁC
  -- ---------------------------------------------------------------
  with ins as (
    insert into expenses (date, category, amount, note) values
      (current_date - 20, 'Mặt bằng', 3000000, 'Tiền thuê tháng này'),
      (current_date - 15, 'Gas', 380000, 'Bình gas 12kg'),
      (current_date - 7,  'Bao bì', 150000, 'Túi, tem dán'),
      (current_date - 2,  'Điện', 450000, null),
      (current_date - 2,  'Nước', 120000, 'Hóa đơn nước máy (rửa, vệ sinh)')
    returning id
  )
  insert into sample_rows select 'expenses', id from ins;

  -- ---------------------------------------------------------------
  -- 9) ĐƠN ĐẶT — chọn món từ menu. Đơn đã giao được ghi vào doanh thu.
  -- ---------------------------------------------------------------
  insert into orders (order_date, order_time, customer, phone, lines, total, deposit, status, note)
  values (current_date - 4, '09:00', 'Chị Lan', '0901234567', jsonb_build_array(
      jsonb_build_object('product_id', p_dieu500,  'name', 'Sữa hạt điều 500ml',  'qty', 10, 'price', 35000),
      jsonb_build_object('product_id', p_hanhnhan, 'name', 'Sữa hạnh nhân 500ml', 'qty', 5,  'price', 38000)),
    540000, 200000, 'done', null)
  returning id into o_id;
  insert into sample_rows values ('orders', o_id);
  with ins as (
    insert into sales (date, product_id, product_name, source, quantity, unit_price, unit_cost) values
      (current_date - 4, p_dieu500,  'Sữa hạt điều 500ml',  'order:' || o_id, 10, 35000, pg_temp.sample_cost(p_dieu500)),
      (current_date - 4, p_hanhnhan, 'Sữa hạnh nhân 500ml', 'order:' || o_id, 5,  38000, pg_temp.sample_cost(p_hanhnhan))
    returning id
  )
  insert into sample_rows select 'sales', id from ins;

  with ins as (
    insert into orders (order_date, order_time, customer, phone, lines, discount, total, deposit, status, note, items) values
      (current_date + 1, '08:30', 'Công ty ABC', '0912345678', jsonb_build_array(
          jsonb_build_object('product_id', p_daunanh, 'name', 'Sữa đậu nành 500ml', 'qty', 20, 'price', 15000),
          jsonb_build_object('product_id', p_yenmach, 'name', 'Sữa yến mạch 500ml', 'qty', 10, 'price', 30000)),
        30000, 570000, 300000, 'pending', 'Giao tận nơi', null),
      (current_date + 3, '15:00', 'Anh Minh', '0987654321', jsonb_build_array(
          jsonb_build_object('product_id', p_occho, 'name', 'Sữa óc chó 500ml', 'qty', 6, 'price', 40000)),
        0, 240000, 0, 'pending', null, 'Ít đường'),
      (current_date + 5, null, 'Tiệc sinh nhật bé Na', null, jsonb_build_array(
          jsonb_build_object('product_id', p_dieu330,  'name', 'Sữa hạt điều 330ml',  'qty', 15, 'price', 25000),
          jsonb_build_object('product_id', p_hanhnhan, 'name', 'Sữa hạnh nhân 500ml', 'qty', 15, 'price', 38000)),
        0, 945000, 500000, 'pending', 'Gọi xác nhận trước 1 ngày', null)
    returning id
  )
  insert into sample_rows select 'orders', id from ins;

  with ins as (
    insert into notes (date, content) values
      (current_date,     'Sắp hết chai 330ml, đặt thêm 100 cái'),
      (current_date + 1, 'Ngâm đậu nành từ tối hôm trước cho đơn Công ty ABC')
    returning id
  )
  insert into sample_rows select 'notes', id from ins;

  -- ---------------------------------------------------------------
  -- 10) CHỐT TIỀN 5 ngày gần nhất (~60% tiền mặt, còn lại chuyển khoản)
  --     hôm qua thiếu 10.000đ để thấy "chênh lệch"
  -- ---------------------------------------------------------------
  with rev as (
    select s.date,
           sum(s.quantity * s.unit_price - s.discount)
             - coalesce((select sum(o.deposit) from orders o where o.order_date = s.date and o.status = 'done'), 0) as amount
    from sales s
    where s.date between current_date - 5 and current_date - 1
      and s.id in (select id from sample_rows where tbl = 'sales')
    group by s.date
  ), ins as (
    insert into day_closings (date, cash, transfer, note)
    select date,
           round(amount * 0.6, -3) - case when date = current_date - 1 then 10000 else 0 end,
           amount - round(amount * 0.6, -3),
           case when date = current_date - 1 then 'Thiếu 10k, chưa rõ lý do' end
    from rev
    returning id
  )
  insert into sample_rows select 'day_closings', id from ins;
end $$;
