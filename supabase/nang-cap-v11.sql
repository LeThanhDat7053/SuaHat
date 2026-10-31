-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v11
--   1) Nhóm nguyên liệu (giống nang-cap-v6.sql, chưa chạy v6 thì file này chạy luôn)
--   2) Gộp "Bắp SB" (tính theo trái) vào "Bắp" (tính theo g) → chỉ còn 1 Bắp:
--      • Bắp có quy đổi 1 trái = 150 g hạt, giá 8.000đ/trái. Nhập hàng chọn "trái",
--        app tự đổi ra g. Cân lại thì sửa ở Nguyên liệu → Bắp → "Quy đổi".
--      • Mẻ đang dùng Bắp SB (sữa bắp) → dùng Bắp, VẪN HIỆN THEO TRÁI (4 trái vẫn là 4 trái).
--        Mẻ đang dùng Bắp theo g → giữ nguyên, vẫn hiện g.
--      • Lịch sử nhập hàng / kiểm kê của Bắp SB chuyển sang Bắp (đổi ra g, tiền giữ nguyên),
--        phiếu nhập cũ không cộng lại vào kho. Xong thì xóa Bắp SB.
--      Không có 2 nguyên liệu tên "Bắp" và "Bắp SB" thì bỏ qua phần này.
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao (đã gộp thì không làm gì thêm).
--  Chạy xong: kiểm kê lại Bắp 1 lần (trang Nguyên liệu → Kiểm kê) để có số tồn đúng.
-- =====================================================================

alter table ingredients add column if not exists category text;

do $$
declare
  gam_moi_trai numeric := 150;   -- 1 trái = 150 g hạt (cân lại thì sửa trong app)
  gia_moi_trai numeric := 8000;  -- giá thường của 1 trái
  g ingredients;
  t ingredients;
  trung text;
begin
  select * into g from ingredients where name = 'Bắp' order by id limit 1;
  -- tên cũ hoặc tên sau khi đã chạy gop-bap.sql
  select * into t from ingredients where name in ('Bắp SB', 'Bắp SB (đã gộp vào Bắp)') order by id limit 1;
  if g.id is null or t.id is null then
    raise notice 'Không có cả "Bắp" và "Bắp SB" → bỏ qua phần gộp bắp';
    return;
  end if;
  if g.unit <> 'g' or t.unit in ('g', 'ml') then
    raise exception 'Cần "Bắp" tính theo g (đang %) và "Bắp SB" tính theo trái (đang %)', g.unit, t.unit;
  end if;

  -- 1 công thức có cả 2 loại bắp → gộp thành 2 dòng cùng nguyên liệu, phải sửa tay trước
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
    raise exception 'Công thức dùng cả "Bắp" và "Bắp SB": %. Bỏ 1 trong 2 ở công thức đó rồi chạy lại', trung;
  end if;

  update ingredients set
    alt_unit = t.unit,
    alt_base = gam_moi_trai,
    alt_qty = 1,
    price_per_unit = gia_moi_trai / gam_moi_trai,
    min_stock = greatest(coalesce(g.min_stock, 0), coalesce(t.min_stock, 0) * gam_moi_trai)
  where id = g.id;

  -- công thức: dòng Bắp SB → Bắp, lượng × số g, nhớ hiện theo trái; dòng Bắp → nhớ hiện theo g
  update recipes set items = (
    select coalesce(jsonb_agg(
      case nullif(e->>'ingredient_id', '')::bigint
        when t.id then e || jsonb_build_object('ingredient_id', g.id, 'amount', (e->>'amount')::numeric * gam_moi_trai, 'unit', t.unit)
        when g.id then case when e ? 'unit' then e else e || jsonb_build_object('unit', 'g') end
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
        when g.id then case when e ? 'unit' then e else e || jsonb_build_object('unit', 'g') end
        else e
      end order by i), '[]'::jsonb)
    from jsonb_array_elements(recipe) with ordinality x(e, i)
  )
  where recipe @> jsonb_build_array(jsonb_build_object('ingredient_id', g.id))
     or recipe @> jsonb_build_array(jsonb_build_object('ingredient_id', t.id));

  -- lịch sử nhập hàng: đổi ra g, tiền giữ nguyên; đánh dấu "đã có trong kiểm kê" để không cộng lại vào kho
  update purchases set
    ingredient_id = g.id,
    item_name = g.name,
    quantity = quantity * gam_moi_trai,
    unit = 'g',
    in_count = true
  where ingredient_id = t.id;

  -- lịch sử kiểm kê: đổi ra g, tiền hao hụt giữ nguyên
  update stock_counts set
    ingredient_id = g.id,
    counted = counted * gam_moi_trai,
    expected = expected * gam_moi_trai,
    unit_price = unit_price / gam_moi_trai,
    note = trim(coalesce(note, '') || ' (Bắp SB, đã đổi ra g)')
  where ingredient_id = t.id;

  delete from ingredients where id = t.id;
end $$;
