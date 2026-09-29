# Quán Sữa Hạt — Phần mềm quản lý

App web (cài được lên màn hình điện thoại như app thật) để:

- **Tổng quan**: 3 số chính (Bán được · Lãi · Tiền còn lại) + nhận xét dễ hiểu; bấm “Xem chi tiết” để xem doanh thu, lãi gộp, hàng hủy, hao hụt, lãi ước tính, lãi dòng tiền, tiền mặt / chuyển khoản, điểm hòa vốn; so với kỳ trước; cảnh báo sắp hết hàng / lãi mỏng; **xuất Excel**.
- **Bán hàng**: mỗi ngày bấm +/− số phần bán, tự lưu; ghi **tặng**, **giảm giá**, **hàng hủy**; **chốt tiền cuối ngày** (tiền mặt + chuyển khoản, báo chênh lệch).
- **Lịch đơn**: đơn đặt trước chọn món từ menu, tự tính tiền; bấm **Đã giao** là tự ghi vào doanh thu.
- **Nhập hàng**: một lần đi chợ nhập nhiều món, mua theo kg / lít; giá nguyên liệu tự tính **bình quân**.
- **Nguyên liệu & tồn kho**: tồn kho tự trừ theo số bán × công thức; **kiểm kê** để biết hao hụt; báo sắp hết.
- **Sản phẩm & công thức**: **công thức theo mẻ** (1 mẻ ra bao nhiêu ml) → nhiều size dùng chung 1 công thức → tự tính giá vốn, lãi mỗi phần.
- **Chi phí khác**: mặt bằng, điện, nước, lương… (xem theo ngày / tuần / tháng).
- **Cách dùng**: hướng dẫn ngắn ngay trong app cho người mới (menu Khác → Cách dùng).

Đăng nhập: **admin / adminmotra**. Máy sẽ nhớ đăng nhập cho tới khi bấm **Đăng xuất**.

---

## Bước 1 — Tạo database Supabase (miễn phí)

1. Vào <https://supabase.com> → đăng ký → **New project** (chọn region *Singapore* cho nhanh). Đặt mật khẩu database gì cũng được (không phải mật khẩu đăng nhập app).
2. Chờ project tạo xong → menu trái **SQL Editor** → **New query** → mở file [`supabase/schema.sql`](supabase/schema.sql), copy toàn bộ dán vào → bấm **Run**. Thấy “Success” là xong.
   Tiếp tục **New query** → dán file [`supabase/nang-cap-v2.sql`](supabase/nang-cap-v2.sql) → **Run**.
   (Đã có database từ bản cũ thì chỉ cần chạy `nang-cap-v2.sql`, dữ liệu cũ giữ nguyên.)
3. **Tạo tài khoản admin**: menu trái **Authentication** → **Users** → **Add user** → **Create new user**:
   - Email: `admin@suahat.app`
   - Password: `adminmotra`
   - Tích **Auto Confirm User** → **Create user**.
4. **Chặn người lạ đăng ký** (quan trọng): **Authentication** → **Sign In / Providers** (hoặc *Providers → Email*) → tắt **Allow new users to sign up** → Save.
5. Lấy khóa kết nối: **Project Settings** → **API** (hoặc *Data API* / *API Keys*), copy:
   - **Project URL** (dạng `https://abcxyz.supabase.co`)
   - **anon public** key (hoặc *Publishable key*)

## Bước 2 — Chạy thử trên máy

1. Copy file `.env.example` thành `.env`, dán URL và key vừa copy vào.
2. Mở terminal trong thư mục này:
   ```
   npm install
   npm run dev
   ```
3. Mở <http://localhost:5173> → đăng nhập `admin` / `adminmotra`.

## Bước 3 — Đưa lên Netlify (miễn phí)

**Cách A — Qua GitHub (khuyên dùng, sau này sửa code sẽ tự cập nhật):**

1. Đưa thư mục này lên một repo GitHub (file `.env` đã được bỏ qua, không bị lộ).
2. Vào <https://app.netlify.com> → **Add new site** → **Import an existing project** → chọn repo.
3. Build command `npm run build`, Publish directory `dist` (đã cài sẵn trong `netlify.toml`, thường tự điền).
4. Bấm **Deploy**. (URL và publishable key của Supabase đã có sẵn trong `src/lib/supabase.js`, không cần khai báo biến môi trường. Nếu sau này đổi project Supabase, thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trong **Environment variables** để ghi đè.)

**Cách B — Kéo thả (nhanh, không cần GitHub):**

1. Trên máy (đã có file `.env`), chạy `npm run build` → sinh ra thư mục `dist`.
2. Vào <https://app.netlify.com/drop> → kéo thả thư mục `dist` vào. Xong.
   (Mỗi lần sửa code phải build và kéo thả lại.)

Muốn đổi tên miền: Netlify → **Site configuration** → **Change site name** (vd. `suahat-cuanha.netlify.app`).

## Bước 4 — Thêm vào màn hình chính điện thoại

- **iPhone (Safari)**: mở link → nút **Chia sẻ** → **Thêm vào MH chính**.
- **Android (Chrome)**: mở link → menu ⋮ → **Cài đặt ứng dụng** / **Thêm vào màn hình chính**.

App sẽ mở toàn màn hình như app bình thường và tự cập nhật khi có bản mới.

---

## Dữ liệu mẫu để thử

- Tạo: chạy [`supabase/du-lieu-mau.sql`](supabase/du-lieu-mau.sql) trong SQL Editor.
- Xóa: chạy [`supabase/xoa-du-lieu-mau.sql`](supabase/xoa-du-lieu-mau.sql) — chỉ xóa đúng dữ liệu mẫu. Cuối file có lệnh xóa sạch toàn bộ nếu muốn bắt đầu lại từ đầu.

## Cách dùng hằng ngày

**Làm 1 lần lúc đầu:**
1. **Nguyên liệu & tồn kho** → “+ Nguyên liệu”: hạt điều, đường, nước lọc, sữa tươi, chai… Hạt / bột dùng đơn vị **g**, nước / sữa dùng **ml**, chai / nắp dùng **cái**.
2. **Kiểm kê** lần đầu: cân / đếm hàng đang có rồi nhập vào → từ đó app tự tính tồn kho.
3. **Sản phẩm & công thức** → tab **Công thức mẻ**: ghi đúng 1 lần nấu thực tế (vd 1 kg hạt điều + 9 lít nước + 300 g đường) và mẻ ra được bao nhiêu (lít, ml hoặc số chai).
4. Tab **Món bán** → “Thêm món”: giá bán, chọn công thức mẻ + dung tích (500 ml, 330 ml…), thêm **chai** vào “nguyên liệu thêm cho mỗi phần”. App tự tính giá vốn và lãi.

**Mỗi ngày:**
- **Bán hàng**: bấm vào món để +1. Nút **⋯** trên mỗi món để ghi tặng, giảm giá, hủy. Cuối ngày **chốt tiền** (tiền mặt + chuyển khoản).
- **Nhập hàng**: mỗi lần đi chợ bấm “Nhập hàng”, thêm nhiều món trong 1 lần, nhập theo kg / lít.
- **Lịch đơn**: khách đặt trước → chọn món. Giao xong bấm **Đã giao** → tự vào doanh thu (không cần nhập lại ở Bán hàng).
- **Chi phí khác**: tiền nhà, điện nước, lương…

**Vài ngày / mỗi tuần (khuyên dùng):** **Kiểm kê** (tối, sau khi bán xong) → cân / đếm hàng còn lại, nhập vào; tồn kho tính lại theo đúng số này. App so với sổ sách → biết hao hụt, tồn kho đúng lại. Hàng mua về ghi Nhập hàng sau lúc kiểm kê thì được cộng thêm vào tồn.

**Hiểu các con số ở Tổng quan:**
- **Lãi gộp** = Doanh thu − giá vốn (gồm phần tặng) − hàng hủy.
- **Lãi ước tính** = Lãi gộp − hao hụt kiểm kê − chi phí khác → lãi thực của việc kinh doanh.
- **Lãi dòng tiền** = Doanh thu − tiền nhập nguyên liệu − chi phí khác → tiền thực sự còn lại (tuần nào nhập nhiều hàng thì số này thấp).
- **Điểm hòa vốn** = cần bán bao nhiêu phần mỗi ngày để lãi gộp đủ bù chi phí khác.
- **Giá nguyên liệu bình quân**: còn 1 kg giá 280k, mua thêm 2 kg giá 290k → giá mới = (280k + 580k) / 3 kg ≈ 287k/kg.

## Lưu ý về gói miễn phí

- Supabase free sẽ **tạm dừng project nếu 7 ngày liền không ai dùng**. Quán dùng mỗi ngày thì không sao; nếu bị dừng, vào supabase.com bấm **Restore** là dữ liệu vẫn còn.
- Muốn đổi mật khẩu: Supabase → Authentication → Users → chọn user admin → đổi password.
- Sao lưu dữ liệu: Supabase → Table Editor → chọn bảng → **Export to CSV**.

## Cấu trúc code (cho người sửa code)

```
src/
  App.jsx              đăng nhập + điều hướng
  lib/supabase.js      kết nối Supabase
  lib/cost.js          giá vốn (mẻ, dung tích), giá bình quân
  lib/stock.js         tính tồn kho
  lib/orders.js        đơn đặt → doanh thu
  lib/xlsx.js          xuất Excel
  lib/format.js        định dạng tiền, ngày
  components/          Layout (menu), ui (modal, ô nhập tiền…)
  pages/               Dashboard, Sales, CalendarPage, Purchases, Ingredients, Products, Expenses
supabase/schema.sql    cấu trúc database
supabase/nang-cap-v2.sql  nâng cấp database (mẻ, tồn kho, hủy, chốt tiền…)
public/                logo.png + icon cài app (tạo từ logo gốc)
```
