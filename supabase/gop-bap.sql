-- =====================================================================
--  QUÁN SỮA HẠT — Gộp bắp, BƯỚC 2: GỘP "Bắp SB" (tính theo trái) vào "Bắp" (tính theo g)
--   Mua bắp trái về, 1 phần làm sữa bắp theo trái, phần còn lại lặt hạt dùng theo g
--   → chỉ còn 1 kho Bắp tính bằng g, kèm quy đổi "1 trái = ? g".
--
--   Sau khi chạy:
--   • "Bắp" có quy đổi 1 trái = (số g điền ở dưới). Nhập hàng chọn được "trái", app tự đổi ra g.
--   • Công thức đang dùng "Bắp SB" (trái) → chuyển sang "Bắp", lượng đổi ra g,
--     VẪN HIỆN THEO TRÁI như cũ (20 trái vẫn là 20 trái).
--   • Công thức đang dùng "Bắp" (g) → giữ nguyên, vẫn hiện theo g.
--   • Giá Bắp = giá 1 trái Bắp SB ÷ số g 1 trái (tiền thật bỏ ra mua bắp trái).
--   • "Bắp SB" đổi tên thành "Bắp SB (đã gộp vào Bắp)" và để "Nhà có / không tính kho":
--     không xóa, để giữ lịch sử nhập hàng và kiểm kê cũ.
--
--  Cách dùng:
--   1) Chạy gop-bap-xem-truoc.sql trước để xem công thức nào đang dùng gì.
--   2) Lặt hạt vài trái, cân, chia số trái → điền vào gam_moi_trai ở dưới (đang là 0).
--   3) Supabase → SQL Editor → New query → dán file này → RUN.
--   4) Kiểm kê lại Bắp ngay (trang Nguyên liệu → Kiểm kê) để có số tồn đúng làm mốc.
--  Chạy lần 2 không làm gì thêm (Bắp SB đã gộp rồi thì báo lỗi, không sửa gì).
-- =====================================================================

do $$
declare
  ten_gam text := 'Bắp';        -- nguyên liệu tính theo g (giữ lại)
  ten_trai text := 'Bắp SB';    -- nguyên liệu tính theo trái (gộp vào trên)
  gam_moi_trai numeric := 0;    -- ← ĐIỀN số g hạt của 1 trái, VD 150
  g ingredients;
  t ingredients;
  trung text;
begin
  if gam_moi_trai is null or gam_moi_trai <= 0 then
    raise exception 'Chưa điền gam_moi_trai (số g hạt của 1 trái) ở đầu file';
  end if;

  if (select count(*) from ingredients where name = ten_gam) <> 1 then
    raise exception 'Cần đúng 1 nguyên liệu tên "%"', ten_gam;
  end if;
  if (select count(*) from ingredients where name = ten_trai) <> 1 then
    raise exception 'Cần đúng 1 nguyên liệu tên "%" (đã gộp rồi thì thôi, không cần chạy lại)', ten_trai;
  end if;
  select * into g from ingredients where name = ten_gam;
  select * into t from ingredients where name = ten_trai;

  if g.unit <> 'g' then
    raise exception '"%" đang tính theo %, cần tính theo g', g.name, g.unit;
  end if;
  if t.unit in ('g', 'ml') then
    raise exception '"%" đang tính theo %, file này dành cho bắp tính theo trái', t.name, t.unit;
  end if;
  if g.alt_unit is not null and g.alt_unit <> t.unit then
    raise exception '"%" đang có quy đổi khác (% g = % %), sửa tay ở trang Nguyên liệu', g.name, g.alt_base, g.alt_qty, g.alt_unit;
  end if;

  -- 1 công thức có cả 2 loại bắp → sau khi gộp thành 2 dòng cùng 1 nguyên liệu, phải sửa tay
  select string_agg(name, ', ') into trung from (
    select r.name from recipes r
    where r.items @> jsonb_build_array(jsonb_build_object('ingredient_id', g.id))
      and r.items @> jsonb_build_array(jsonb_build_object('ingredient_id', t.id))
    union all
    select p.name from products p
    where p.recipe @> jsonb_build_array(jsonb_build_object('ingredient_id', g.id))
      and p.recipe @> jsonb_build_array(jsonb_build_object('ingredient_id', t.id))
  ) x;
  if trung is not null then
    raise exception 'Công thức dùng cả "%" và "%": %. Bỏ 1 trong 2 ở công thức đó rồi chạy lại', g.name, t.name, trung;
  end if;

  -- Bắp: quy đổi 1 trái = gam_moi_trai g, giá theo tiền mua bắp trái
  update ingredients set
    alt_unit = t.unit,
    alt_base = gam_moi_trai,
    alt_qty = 1,
    price_per_unit = case when t.price_per_unit > 0 then t.price_per_unit / gam_moi_trai else price_per_unit end
  where id = g.id;

  -- Công thức mẻ và nguyên liệu thêm mỗi phần:
  --   dòng Bắp SB → Bắp, lượng × số g, nhớ hiện theo trái; dòng Bắp → nhớ hiện theo g
  update recipes set items = (
    select coalesce(jsonb_agg(
      case nullif(e->>'ingredient_id', '')::bigint
        when t.id then e || jsonb_build_object('ingredient_id', g.id, 'amount', (e->>'amount')::numeric * gam_moi_trai, 'unit', t.unit)
        when g.id then e || jsonb_build_object('unit', 'g')
        else e
      end order by i), '[]'::jsonb)
    from jsonb_array_elements(items) with ordinality x(e, i)
  )
  where items @> jsonb_build_array(jsonb_build_object('ingredient_id', g.id))
     or items @> jsonb_build_array(jsonb_build_object('ingredient_id', t.id));

  update products set recipe = (
    select coalesce(jsonb_agg(
      case nullif(e->>'ingredient_id', '')::bigint
        when t.id then e || jsonb_build_object('ingredient_id', g.id, 'amount', (e->>'amount')::numeric * gam_moi_trai, 'unit', t.unit)
        when g.id then e || jsonb_build_object('unit', 'g')
        else e
      end order by i), '[]'::jsonb)
    from jsonb_array_elements(recipe) with ordinality x(e, i)
  )
  where recipe @> jsonb_build_array(jsonb_build_object('ingredient_id', g.id))
     or recipe @> jsonb_build_array(jsonb_build_object('ingredient_id', t.id));

  -- Bắp SB: giữ lại cho lịch sử, không tính kho nữa
  update ingredients set name = t.name || ' (đã gộp vào ' || g.name || ')', no_stock = true, min_stock = 0 where id = t.id;
end $$;
