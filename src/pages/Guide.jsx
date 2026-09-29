import { Link } from 'react-router-dom'
import { CircleQuestionMark, ClipboardCheck, Ellipsis, LayoutDashboard, Plus, ShoppingBag, Smartphone, Wallet, Wheat } from 'lucide-react'
import { PageHeader } from '../components/ui'

// Hình nút giống trong app để người mới dễ nhận ra
const Btn = ({ icon: Icon, children, primary }) => (
  <span className={`ui-chip ${primary ? 'primary' : ''}`}>
    {Icon && <Icon size={14} />}
    {children}
  </span>
)

function Step({ n, title, to, children }) {
  return (
    <div className="guide-step">
      <span className="guide-num">{n}</span>
      <div className="grow">
        <strong>{to ? <Link to={to}>{title}</Link> : title}</strong>
        <div className="guide-text">{children}</div>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, when, open, children }) {
  return (
    <details className="card guide-section" open={open}>
      <summary>
        <span className="guide-icon">
          <Icon size={20} />
        </span>
        <span className="grow">
          <strong>{title}</strong>
          {when && <span className="muted small block">{when}</span>}
        </span>
      </summary>
      <div className="guide-body">{children}</div>
    </details>
  )
}

export default function Guide() {
  return (
    <>
      <PageHeader title="Cách dùng" subtitle="Hướng dẫn ngắn cho người mới. Bấm vào từng phần để xem." />

      <div className="guide">
        <Section icon={Wheat} title="Bắt đầu" when="Chỉ làm 1 lần lúc mới dùng" open>
          <Step n="1" title="Thêm nguyên liệu" to="/nguyen-lieu">
            Vào <b>Nguyên liệu & tồn kho</b> → <Btn icon={Plus} primary>Nguyên liệu</Btn>. Thêm hạt điều, đường, nước, sữa tươi, chai…
            <br />
            Hạt, bột chọn đơn vị <b>g</b> · nước, sữa chọn <b>ml</b> · chai, nắp chọn <b>cái</b>.
          </Step>
          <Step n="2" title="Kiểm kê lần đầu" to="/nguyen-lieu">
            Bấm <Btn icon={ClipboardCheck}>Kiểm kê</Btn>, cân / đếm hàng đang có trong kho rồi gõ vào. Từ đó app tự cộng khi nhập hàng,
            tự trừ khi bán.
          </Step>
          <Step n="3" title="Tạo công thức mẻ" to="/san-pham">
            Vào <b>Sản phẩm & công thức</b> → tab <b>Công thức mẻ</b>. Gõ lượng của <b>1 lần nấu thật</b> (vd 1 kg hạt điều, 9 lít nước,
            300 g đường) và mẻ đó ra được bao nhiêu lít.
          </Step>
          <Step n="4" title="Thêm món bán" to="/san-pham">
            Tab <b>Món bán</b> → <Btn icon={Plus} primary>Thêm món</Btn>: tên, giá bán, chọn công thức mẻ + dung tích (500 ml, 330 ml…),
            thêm <b>chai</b> ở mục “nguyên liệu thêm cho mỗi phần”. App tự tính giá vốn và lãi mỗi phần.
          </Step>
        </Section>

        <Section icon={ShoppingBag} title="Buổi sáng — bán hàng" when="Mỗi ngày">
          <Step n="1" title="Bấm vào món khi bán" to="/ban-hang">
            Bán 1 phần thì bấm vào tên món (+1). Bấm <b>−</b> nếu lỡ bấm dư. Có thể gõ thẳng số lượng. App tự lưu, góc trên hiện{' '}
            <span className="good-text">✓ Đã lưu</span>.
          </Step>
          <Step n="2" title="Tặng, giảm giá, đổ bỏ">
            Bấm nút <Btn icon={Ellipsis} /> trên món đó để ghi số phần tặng khách, tiền giảm giá, hoặc số phần phải đổ bỏ.
          </Step>
          <Step n="3" title="Giao đơn đặt trước" to="/lich">
            Vào <b>Lịch đơn</b>, giao xong bấm <Btn>Đã giao</Btn> → tự tính vào doanh thu, <b>không cần</b> bấm lại ở trang Bán hàng.
          </Step>
        </Section>

        <Section icon={Wallet} title="Buổi tối — chốt sổ" when="Mỗi ngày, làm theo thứ tự">
          <Step n="1" title="Chốt tiền" to="/ban-hang">
            Cuối trang <b>Bán hàng</b>: gõ tiền mặt trong két và tiền chuyển khoản → app báo khớp hay thiếu / dư.
          </Step>
          <Step n="2" title="Kiểm kê (vài ngày 1 lần)" to="/nguyen-lieu">
            Cân / đếm hàng <b>còn lại</b> → <Btn icon={ClipboardCheck}>Kiểm kê</Btn>. Không cần kiểm hết, chỉ cần các loại hạt đắt tiền.
          </Step>
          <Step n="3" title="Nhập hàng vừa mua" to="/nhap-hang">
            <Btn icon={Plus} primary>Nhập hàng</Btn> → chọn nguyên liệu, gõ số <b>kg / lít</b> và <b>tổng tiền đã trả</b>. Mua nhiều món thì
            bấm “Thêm món khác”.
          </Step>
          <p className="guide-tip">
            💡 Nên <b>kiểm kê trước, nhập hàng sau</b>. Nếu lỡ đếm luôn cả hàng mới mua thì phải ghi Nhập hàng <b>trước</b> khi bấm lưu kiểm
            kê, không thì bị cộng 2 lần.
          </p>
        </Section>

        <Section icon={LayoutDashboard} title="Xem lãi lỗ" when="Khi nào muốn xem">
          <Step n="" title="Ba con số chính ở Tổng quan" to="/">
            <ul className="guide-list">
              <li>
                <b>Bán được</b>: tổng tiền bán ra.
              </li>
              <li>
                <b>Lãi</b>: bán được − tiền nguyên liệu đã dùng − chi phí khác (mặt bằng, điện…). Đây là số lãi thật.
              </li>
              <li>
                <b>Tiền còn lại</b>: bán được − tiền đi chợ − chi phí khác. Tuần nào mua trữ nhiều hàng thì số này thấp hơn Lãi, không
                phải lỗ.
              </li>
            </ul>
            Chọn Hôm nay / Tuần này / Tháng này ở trên. Bấm “Xem chi tiết” để xem hàng hủy, hao hụt, điểm hòa vốn…
          </Step>
          <Step n="" title="Xuất Excel">
            Nút <Btn>Xuất Excel</Btn> ở góc trên Tổng quan → tải file Excel của khoảng thời gian đang xem, để lưu trữ hoặc gửi kế toán.
          </Step>
        </Section>

        <Section icon={CircleQuestionMark} title="Câu hỏi thường gặp">
          <div className="guide-faq">
            <p>
              <b>Tồn kho bị âm?</b>
              <br />
              Chưa kiểm kê lần đầu, hoặc mua hàng mà quên ghi Nhập hàng. Kiểm kê lại là hết.
            </p>
            <p>
              <b>Mua được tặng thêm, được giảm giá thì ghi sao?</b>
              <br />
              Ghi <b>tổng số lượng thực nhận</b> (cả phần tặng) và <b>tổng tiền thực trả</b>. App tự chia đều ra giá mỗi kg.
            </p>
            <p>
              <b>Sao giá nguyên liệu không bằng giá lần mua mới nhất?</b>
              <br />
              App tính <b>giá bình quân</b> của hàng cũ còn trong kho và hàng mới mua. Mua giá rẻ dần thì giá bình quân cũng giảm dần theo.
            </p>
            <p>
              <b>Lỡ bấm sai số bán?</b>
              <br />
              Bấm <b>−</b> hoặc gõ lại số đúng. Ngày cũ thì dùng mũi tên ← → ở trang Bán hàng để quay lại ngày đó.
            </p>
            <p>
              <b>Tạm ngừng bán 1 món?</b>
              <br />
              Mở món đó trong <Link to="/san-pham">Sản phẩm</Link>, bỏ tick <b>Đang bán</b>. Đừng xóa, để giữ lịch sử.
            </p>
            <p>
              <b>Bấm Lưu mà chưa thấy gì?</b>
              <br />
              Nút đang hiện vòng xoay “Đang lưu…” thì chờ 1–2 giây, đừng bấm lại hay thoát ra.
            </p>
          </div>
        </Section>

        <Section icon={Smartphone} title="Cài app lên điện thoại">
          <Step n="" title="iPhone (Safari)">
            Mở trang web → nút <b>Chia sẻ</b> → <b>Thêm vào MH chính</b>.
          </Step>
          <Step n="" title="Android (Chrome)">
            Mở trang web → menu <b>⋮</b> → <b>Cài đặt ứng dụng</b> / <b>Thêm vào màn hình chính</b>.
          </Step>
        </Section>
      </div>

    </>
  )
}
