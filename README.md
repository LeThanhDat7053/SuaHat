# Quán Sữa Hạt — Phần mềm quản lý

App web (cài được lên màn hình điện thoại như app thật) để:

- **Tổng quan**: doanh thu, giá vốn, lãi gộp, tiền nhập hàng, chi phí khác, lãi thực; biểu đồ doanh thu theo ngày; món bán chạy; đơn đặt 7 ngày tới.
- **Bán hàng**: mỗi ngày bấm +/− số phần bán của từng món, tự lưu.
- **Lịch đơn**: lịch tháng, đơn đặt trước (khách, SĐT, món, tiền cọc, trạng thái) và ghi chú theo ngày.
- **Nhập hàng**: ghi tiền mua nguyên liệu; giá nguyên liệu tự cập nhật theo lần mua mới nhất.
- **Sản phẩm**: menu + công thức 1 phần → tự tính giá vốn và lãi mỗi phần.
- **Chi phí khác**: mặt bằng, điện, nước, lương…

Đăng nhập: **admin / adminmotra**. Máy sẽ nhớ đăng nhập cho tới khi bấm **Đăng xuất**.

---

## Bước 1 — Tạo database Supabase (miễn phí)

1. Vào <https://supabase.com> → đăng ký → **New project** (chọn region *Singapore* cho nhanh). Đặt mật khẩu database gì cũng được (không phải mật khẩu đăng nhập app).
2. Chờ project tạo xong → menu trái **SQL Editor** → **New query** → mở file [`supabase/schema.sql`](supabase/schema.sql), copy toàn bộ dán vào → bấm **Run**. Thấy “Success” là xong.
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

## Cách dùng hằng ngày

**Làm 1 lần lúc đầu:**
1. **Nhập hàng** → “+ Nhập hàng” → chọn *Nguyên liệu mới…* để tạo nguyên liệu (hạt điều, hạnh nhân, đường…) kèm lần mua đầu tiên.
   Mẹo: dùng đơn vị **g** hoặc **ml** (mua 1kg thì nhập 1000 g) để ghi công thức cho dễ.
2. **Sản phẩm** → “Thêm món”: nhập giá bán, chi phí phụ (ly, nắp, ống hút, tem) và công thức 1 phần (vd. 50 g hạt điều + 15 g đường). App tự tính **giá vốn** và **lãi mỗi phần**.

**Mỗi ngày:**
- **Bán hàng**: bán được món nào thì bấm vào món đó (+1). Có thể gõ thẳng số lượng. Xem lại ngày cũ bằng mũi tên ← →.
- **Nhập hàng**: mỗi lần đi chợ thì ghi lại → giá nguyên liệu tự cập nhật → giá vốn các món tự đổi theo.
- **Lịch đơn**: khách đặt trước thì bấm “+ Đơn đặt”; giao xong bấm “Đã giao”. Ghi chú việc cần làm theo ngày bằng nút “Ghi chú”.
- **Chi phí khác**: tiền nhà, điện nước, lương…

**Hiểu các con số ở Tổng quan:**
- **Lãi gộp** = Doanh thu − giá vốn theo công thức → biết bán có lời bao nhiêu trên mỗi phần.
- **Lãi thực (dòng tiền)** = Doanh thu − tiền nhập nguyên liệu − chi phí khác → tiền thực sự còn lại trong khoảng thời gian đó.

> Lưu ý: đơn đặt trước chỉ để nhắc lịch. Khi giao đơn, nhớ bấm thêm số lượng ở trang **Bán hàng** để tính vào doanh thu.

## Lưu ý về gói miễn phí

- Supabase free sẽ **tạm dừng project nếu 7 ngày liền không ai dùng**. Quán dùng mỗi ngày thì không sao; nếu bị dừng, vào supabase.com bấm **Restore** là dữ liệu vẫn còn.
- Muốn đổi mật khẩu: Supabase → Authentication → Users → chọn user admin → đổi password.
- Sao lưu dữ liệu: Supabase → Table Editor → chọn bảng → **Export to CSV**.

## Cấu trúc code (cho người sửa code)

```
src/
  App.jsx              đăng nhập + điều hướng
  lib/supabase.js      kết nối Supabase
  lib/cost.js          công thức tính giá vốn
  lib/format.js        định dạng tiền, ngày
  components/          Layout (menu), ui (modal, ô nhập tiền…)
  pages/               Dashboard, Sales, CalendarPage, Purchases, Products, Expenses
supabase/schema.sql    cấu trúc database
scripts/make-icons.mjs tạo icon PWA (npm run icons)
```
