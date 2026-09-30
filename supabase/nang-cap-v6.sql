-- =====================================================================
--  QUÁN SỮA HẠT — Nâng cấp v6: Nhóm nguyên liệu (Hạt, Sữa & nước, Bao bì…)
--
--  Cách dùng: Supabase → SQL Editor → New query → dán file này → RUN.
--  Chạy lại nhiều lần cũng không sao.
--  Nguyên liệu chưa chọn nhóm (null) được app tự xếp nhóm theo tên, sửa lại được trong form.
-- =====================================================================

alter table ingredients add column if not exists category text;
