-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v4: Báo thức cho lịch đơn + Chi phí định kỳ
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy sau nang-cap-v3.sql. Chạy lại nhiều lần cũng không sao.
-- =====================================================================

-- Báo thức cho đơn đặt và ghi chú
--   remind_at     : giờ báo (null = không báo)
--   remind_before : số phút báo trước giờ giao (null = báo đúng giờ đã chọn)
--   remind_off    : tạm tắt nhanh, vẫn giữ giờ đã cài
--   reminded_at   : lúc bấm "Đã biết" (null = chưa báo / chưa tắt)
do $$
declare t text;
begin
  foreach t in array array['orders', 'notes'] loop
    execute format('alter table %I add column if not exists remind_at timestamptz', t);
    execute format('alter table %I add column if not exists remind_before integer', t);
    execute format('alter table %I add column if not exists remind_off boolean not null default false', t);
    execute format('alter table %I add column if not exists reminded_at timestamptz', t);
    execute format('create index if not exists %I on %I (remind_at) where remind_at is not null', t || '_remind_idx', t);
  end loop;
end $$;

-- Chi phí định kỳ: tạo 1 lần, app tự ghi vào Chi phí khác theo các thứ đã chọn
create table if not exists recurring_expenses (
  id bigint generated always as identity primary key,
  category text not null,
  amount numeric not null,
  note text,
  weekdays integer[] not null default '{0,1,2,3,4,5,6}', -- 0 = Chủ nhật, 1 = Thứ 2 … 6 = Thứ 7
  start_date date not null default current_date,
  paused boolean not null default false,
  generated_until date,                                  -- đã tự ghi tới hết ngày này
  created_at timestamptz not null default now()
);

alter table recurring_expenses enable row level security;
drop policy if exists "admin_all" on recurring_expenses;
create policy "admin_all" on recurring_expenses for all to authenticated using (true) with check (true);

-- Khoản chi được tự ghi từ chi phí định kỳ nào (xóa định kỳ thì các khoản cũ vẫn giữ)
alter table expenses add column if not exists recurring_id bigint references recurring_expenses(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_recurring_date_key') then
    alter table expenses add constraint expenses_recurring_date_key unique (recurring_id, date);
  end if;
end $$;
