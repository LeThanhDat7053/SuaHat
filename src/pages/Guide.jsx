import { Link } from 'react-router-dom'
import {
  AlarmClock,
  BookOpen,
  Check,
  CircleQuestionMark,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  Columns3,
  Download,
  Ellipsis,
  LayoutDashboard,
  PackagePlus,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  WifiOff,
  Smartphone,
  Trash2,
  Wallet,
  Wheat,
} from 'lucide-react'
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
      <PageHeader title="Cách dùng" subtitle="Hướng dẫn từng bước. Bấm vào từng phần để mở ra xem, bấm tên bước để tới đúng trang đó." />

      <p className="guide-tip" style={{ marginBottom: 12 }}>
        📱 Trên điện thoại, thanh dưới cùng chỉ có <b>Tổng quan · Bán hàng · Lịch đơn · Công thức</b>. Các trang khác (Nhập hàng, Nguyên liệu,
        Sản phẩm, Chi phí, Đơn bán…) nằm trong mục <b>Khác</b>.
      </p>

      <div className="guide">
        <Section icon={Wheat} title="Bắt đầu" when="Chỉ làm 1 lần lúc mới dùng, theo đúng thứ tự" open>
          <Step n="1" title="Thêm nguyên liệu" to="/nguyen-lieu">
            Vào <b>Nguyên liệu & tồn kho</b> → <Btn icon={Plus} primary>Nguyên liệu</Btn>. Thêm hạt điều, đường, nước, sữa tươi, ly, nắp…
            <ul className="guide-list">
              <li>
                <b>Đơn vị</b>: hạt, bột chọn <b>g</b> · nước, sữa chọn <b>ml</b> · ly, nắp, chai chọn <b>cái</b>. Lúc nhập hàng và kiểm kê vẫn
                gõ theo kg / lít được, app tự đổi.
              </li>
              <li>
                <b>Cách tính tiền</b> (chọn 1):
                <br />– <b>Theo từng ly</b> (mặc định): mỗi ly bán ra tính tiền nguyên liệu này và trừ kho.
                <br />– <b>Tính 1 lần lúc mua</b>: sữa đặc, đường… Tiền mua trừ thẳng vào lãi ngày mua, ly bán ra không tính nữa. Kho vẫn trừ.
                <br />– <b>Nhà có / không tính</b>: gạo rang nhà có, trái cây chợ khó cân… Không tính tiền, không trừ kho.
              </li>
              <li>
                <b>Quy đổi trong công thức</b> (không bắt buộc): trà mua theo g nhưng công thức đong theo ml → ghi “44 g = 380 ml”.
              </li>
            </ul>
          </Step>
          <Step n="2" title="Kiểm kê lần đầu" to="/nguyen-lieu">
            Cân / đếm hàng đang có trong kho → bấm <Btn icon={ClipboardCheck}>Kiểm kê</Btn> → gõ số vào từng món → <Btn primary>Lưu kiểm kê</Btn>.
            Từ đó app tự cộng khi nhập hàng, tự trừ khi bán. Cách kiểm kê chi tiết xem phần <b>Kiểm kê kho</b> bên dưới.
          </Step>
          <Step n="3" title="Tạo công thức mẻ" to="/san-pham">
            Vào <b>Sản phẩm & sửa công thức</b> → tab <b>Công thức mẻ</b> → <Btn icon={Plus} primary>Công thức mẻ</Btn>. Gõ lượng của{' '}
            <b>1 lần nấu thật</b> (VD 1000 g hạt điều, 9000 ml nước, 300 g đường) và ô <b>Mẻ ra được</b> = số ml thành phẩm sau khi lọc bã.
            Có thể ghi cách làm ở ô Ghi chú để người pha xem.
          </Step>
          <Step n="4" title="Thêm món bán" to="/san-pham">
            Tab <b>Món bán</b> → <Btn icon={Plus} primary>Thêm món</Btn>:
            <ul className="guide-list">
              <li>
                <b>Tên món</b>, <b>Giá bán</b> (giá Ly).
              </li>
              <li>
                <b>Công thức mẻ</b> + <b>Dung tích mỗi phần</b> (250, 270, 300 ml…): app tự lấy đúng phần nguyên liệu từ mẻ.
              </li>
              <li>
                <b>Nguyên liệu thêm cho mỗi phần</b>: ly, nắp, ống hút, topping…
              </li>
              <li>
                <b>Bán Chai đắt hơn Ly</b> và <b>Vốn thêm khi bán Chai</b> (vỏ chai): để trống thì dùng mức chung. Vỏ chai ghi ở đây, đừng ghi
                thêm vào “nguyên liệu thêm” kẻo tính 2 lần.
              </li>
            </ul>
            App tự tính giá vốn và lãi mỗi phần, món nào lãi mỏng sẽ có nhãn <b>Lãi mỏng</b>.
          </Step>
        </Section>

        <Section icon={ShoppingBag} title="Bán hàng mỗi ngày" when="Lập đơn, giao đơn, tặng / giảm giá / đổ bỏ">
          <Step n="1" title="Chọn “Món hôm nay”" to="/ban-hang">
            Ở trang <b>Bán hàng</b> bấm <Btn>Chọn món</Btn> → tích các món đang bán → <Btn primary>Lưu</Btn>. Các món này được tô màu, xếp lên
            đầu; món khác gọn vào mục “Món khác”. Giữ nguyên cho các ngày sau, mọi máy thấy giống nhau.
          </Step>
          <Step n="2" title="Lập đơn khi khách gọi" to="/ban-hang">
            <ol className="guide-list">
              <li>
                Bấm vào <b>tên món</b> → hiện bảng chọn.
              </li>
              <li>
                Khách dặn <b>ít ngọt / không ngọt</b> thì chọn ở hàng trên cùng <b>trước</b>.
              </li>
              <li>
                Bấm ô <b>Đá</b> / <b>Nóng</b> ở dòng <b>Ly</b> hoặc <b>Chai</b>. Bấm 1 lần = 1 phần, bấm nhiều lần = nhiều phần (VD 2 ly đá + 1 ly
                nóng). Bấm nhầm thì bấm dấu <b>−</b> ở góc ô.
              </li>
              <li>
                Bấm <Btn primary>Thêm · n phần</Btn>. Nút <Btn icon={ClipboardPlus}>Lập đơn</Btn> chuyển{' '}
                <span className="good-text">xanh lá</span> = đang lập đơn, thanh đơn hiện ở dưới đáy. Gõ tên khách ở thanh này nếu muốn.
              </li>
              <li>
                Gọi đủ món thì bấm <Btn primary>Chốt đơn</Btn> → đơn thành thẻ <b>màu vàng</b> ở “Đơn đang chờ”. Làm được nhiều đơn cùng lúc.
              </li>
              <li>
                Khách lấy hàng xong bấm <Btn icon={Check}>Đã xong</Btn> trên thẻ vàng → tiền mới vào doanh thu và kho mới bị trừ.
              </li>
            </ol>
            Khách lấy liền thì bấm <Btn>Xong luôn</Btn> thay cho Chốt đơn: chốt và tính tiền 1 lần.
          </Step>
          <Step n="3" title="Sửa / xóa đơn">
            <ul className="guide-list">
              <li>
                Đơn còn ở thẻ vàng: bấm <Btn icon={Pencil} /> để sửa món, <Btn icon={Trash2} /> để xóa.
              </li>
              <li>
                Đơn đã bấm Đã xong mà sai: <Btn icon={ClipboardList}>Xem mọi đơn</Btn> (trang <Link to="/don">Đơn bán</Link>) → tìm đơn →{' '}
                <Btn icon={RotateCcw}>Mở lại</Btn> → đơn quay về thẻ vàng ở Bán hàng → sửa rồi bấm Đã xong lại.
              </li>
            </ul>
          </Step>
          <Step n="4" title="Tặng, giảm giá, đổ bỏ">
            Bấm nút <Btn icon={Ellipsis} /> ở góc thẻ món → ghi số phần <b>tặng khách</b> (tính vốn, không tính tiền), <b>tổng tiền giảm giá</b> hôm
            nay, hoặc số phần <b>hủy / đổ bỏ</b> kèm lý do.
          </Step>
          <Step n="5" title="Chỉnh giá Ly / Chai">
            Trong bảng chọn Ly / Chai bấm <Btn icon={Pencil}>Chỉnh giá</Btn>: giá Ly, Chai đắt hơn bao nhiêu, vốn thêm của vỏ chai. Mục “Mức chung
            cho mọi món” đổi mặc định cho tất cả món.
          </Step>
          <Step n="6" title="Bán sỉ (giao số lượng lớn)">
            Đang lập đơn thì tích ô <b>Bán sỉ</b> cạnh ô tên khách → danh sách món mở ra, sửa <b>giá sỉ</b> cho từng món → Chốt đơn / Xong luôn. Thẻ
            đơn có nhãn <span className="badge badge-ws">Sỉ</span>.
            <ul className="guide-list">
              <li>
                Đơn sỉ <b>vẫn cộng doanh thu, giá vốn và trừ nguyên liệu</b> trong kho như đơn thường.
              </li>
              <li>
                Nhưng <b>không cộng vào số phần / số ly đã bán</b>, nên số bán lẻ không bị độn lên. Tổng quan ghi riêng “+ n sỉ”.
              </li>
              <li>
                Giao sỉ hẹn ngày thì tạo ở <Link to="/lich">Lịch đơn</Link> (xem phần Đơn đặt trước) và tích <b>Bán sỉ</b> trong form.
              </li>
            </ul>
          </Step>
          <Step n="7" title="Xem / ghi ngày cũ">
            Dùng mũi tên <b>← →</b> dưới tiêu đề trang Bán hàng để quay lại ngày trước.
          </Step>
          <Step n="8" title="Mất mạng vẫn bán được">
            <WifiOff size={15} className="inline-icon" /> Lập đơn, bấm <b>Xong luôn</b> / <b>Đã xong</b>, sửa tặng / giảm / hủy lúc mất mạng: app lưu trong
            máy (đơn có dòng <b>Chưa gửi lên</b>), có mạng lại tự gửi. Gửi lại bao nhiêu lần cũng không bị cộng tiền 2 lần. Đừng xóa dữ liệu trình
            duyệt / gỡ app khi thanh trên cùng còn báo “thao tác chưa gửi”. (Đơn đặt trước ở Lịch đơn vẫn cần có mạng.)
          </Step>
          <p className="guide-tip">
            💡 Góc trên trang hiện <b>Đang lưu…</b> rồi <b>✓ Đã lưu</b>. Mất mạng thì hiện <b>Đã lưu trong máy · chờ mạng</b>. Thấy{' '}
            <b className="danger-text">Lỗi lưu</b> thì xem lỗi báo ở dưới màn hình.
          </p>
        </Section>

        <Section icon={AlarmClock} title="Đơn đặt trước & báo thức" when="Khách đặt hẹn ngày giờ lấy">
          <Step n="1" title="Tạo đơn đặt" to="/lich">
            Vào <b>Lịch đơn</b> → bấm ngày giao trên lịch → <Btn icon={Plus} primary>Đơn đặt</Btn> → giờ giao, tên khách, số điện thoại, chọn món
            (Ly / Chai, Đá / Nóng, độ ngọt như lúc lập đơn), tiền cọc nếu có. Đơn <b>bán sỉ</b>: tích ô <b>Bán sỉ</b> ở đầu form rồi bấm vào giá
            từng món để sửa thành giá sỉ.
          </Step>
          <Step n="2" title="Đặt báo thức">
            Trong form đơn (hoặc ghi chú), mục <b>Báo thức</b>: chọn <b>Trước giờ giao</b> (15 phút, 1 tiếng…) hoặc <b>Chọn giờ</b>. Đến giờ app kêu
            bíp và hiện thông báo. Nút <Btn icon={AlarmClock}>Báo thức</Btn> ở Lịch đơn để xem hết báo thức sắp tới. App phải đang mở (chạy nền cũng
            được) mới báo.
          </Step>
          <Step n="3" title="Giao đơn">
            Đơn tự hiện ở <b>Bán hàng</b> thành thẻ <b>màu tím</b> “Đặt trước” đúng giờ báo thức; không đặt báo thức thì hiện lúc <b>6:30</b> sáng
            ngày giao. Giao xong bấm <Btn>Đã giao</Btn> ở Bán hàng <b>hoặc</b> ở Lịch đơn đều được — cùng 1 đơn, tiền chỉ cộng 1 lần.
          </Step>
          <p className="guide-tip">
            ⚠️ Đơn đặt <b>chưa chọn món</b> thì không tính được tiền: bấm Sửa để chọn món trước khi giao.
          </p>
        </Section>

        <Section icon={BookOpen} title="Công thức & quầy pha" when="Cho người đứng pha">
          <Step n="1" title="Xem công thức" to="/cong-thuc">
            Trang <b>Công thức</b> hiện nguyên liệu của từng mẻ. Món đánh sao ở “Món hôm nay” xếp lên đầu. Gõ tên vào ô tìm để tìm nhanh.
          </Step>
          <Step n="2" title="Pha theo số ly (nút “Ly”)">
            Bấm <b>Ly</b> trên thẻ công thức → bấm <b>+ / −</b> chọn số ly → bấm dung tích <b>250 · 270 · 300 · 350 · 500 · 600 ml</b> (hoặc gõ số ml
            khác). Lượng từng nguyên liệu tự tính đúng cho số ly đó. VD: 3 ly × 270 ml = 810 ml.
          </Step>
          <Step n="3" title="Nấu nửa mẻ (nút ÷2, ÷3…)">
            Bấm <b>÷2</b> để xem lượng của nửa mẻ, <b>÷3</b> cho 1/3 mẻ… <b>÷1</b> là cả mẻ.
          </Step>
          <Step n="4" title="Chế độ pha chế (máy ở quầy)">
            Vào <b>Khác</b> → <b>Chế độ pha chế</b>: máy đó chỉ còn <b>Đơn hàng</b> (vẫn lập đơn được) và <b>Công thức</b>, ẩn doanh thu / lãi. Chỉ đổi
            riêng máy đó. Tắt: <b>Khác</b> → <b>Thoát chế độ pha chế</b>.
          </Step>
          <Step n="5" title="Chia màn hình (máy tính bảng / máy tính)">
            Trong chế độ pha chế bấm <Btn icon={Columns3}>Chia màn hình</Btn>: 2 khung công thức + 1 khung đơn hàng, vừa pha vừa thấy đơn mới. Bấm tên
            món ở khung để đổi công thức, <b>‹ ›</b> để lật nhanh. Màn hình hẹp thì bấm tab trên cùng để đổi khung.
          </Step>
        </Section>

        <Section icon={Wallet} title="Nhập hàng & chi phí" when="Mỗi lần đi chợ, trả tiền điện nước…">
          <Step n="1" title="Nhập hàng vừa mua" to="/nhap-hang">
            <Btn icon={PackagePlus} primary>Nhập hàng</Btn> → chọn nguyên liệu (chưa có thì chọn “+ Nguyên liệu mới…”) → gõ <b>số lượng</b> (chọn kg /
            g, lít / ml) và <b>tổng tiền đã trả</b>. Mua nhiều thứ thì bấm <b>+ Thêm nguyên liệu khác</b> → <Btn primary>Lưu</Btn>.
            <ul className="guide-list">
              <li>Dưới mỗi dòng có ghi kho đang còn bao nhiêu và giá lần mua trước để so.</li>
              <li>Giá lần này chênh gấp đôi / còn một nửa so với giá đang dùng thì app hỏi lại — hay do gõ thiếu / thừa số 0.</li>
              <li>
                Nếu app hỏi <b>“Lúc kiểm kê ngày … hàng này đã có trong kho chưa?”</b>: lúc cân đã có hàng này rồi thì chọn <b>Có rồi</b> (chỉ ghi
                tiền, không cộng kho 2 lần); hàng về sau lúc kiểm kê thì chọn <b>Chưa</b>.
              </li>
            </ul>
          </Step>
          <Step n="2" title="Chi phí khác (mặt bằng, điện, nước đá…)" to="/chi-phi">
            Vào <b>Chi phí khác</b> → <Btn icon={Plus} primary>Thêm chi phí</Btn> → loại, số tiền, ngày. Mỗi khoản tính trọn vào ngày ghi.
          </Step>
          <Step n="3" title="Chi phí lặp lại mỗi ngày / mỗi tuần" to="/chi-phi">
            <Btn icon={Repeat}>Định kỳ</Btn> → tạo 1 lần, chọn mỗi ngày hoặc các thứ trong tuần. App tự ghi; hôm nào không mua thì bấm <b>Bỏ qua</b>{' '}
            trên khoản đó. Mặt bằng 6 triệu/tháng muốn xem lãi theo ngày cho sát thì tạo định kỳ 200.000đ mỗi ngày thay vì ghi 1 lần.
          </Step>
          <p className="guide-tip">
            💡 Ly, nắp, chai đã có trong công thức món thì <b>không</b> ghi thêm vào Chi phí khác, kẻo bị trừ 2 lần.
          </p>
        </Section>

        <Section icon={ClipboardCheck} title="Kiểm kê kho" when="Vài ngày 1 lần, để biết hao hụt">
          <Step n="1" title="Mở kiểm kê" to="/nguyen-lieu">
            Vào <b>Nguyên liệu & tồn kho</b> → <Btn icon={ClipboardCheck}>Kiểm kê</Btn>.
          </Step>
          <Step n="2" title="Chọn ngày và lúc kiểm">
            <ul className="guide-list">
              <li>
                <b>Đầu ngày — chưa bán ly nào</b>: kiểm lúc mở quán. Ly bán trong ngày vẫn bị trừ kho bình thường.
              </li>
              <li>
                <b>Cuối ngày — đã bán xong</b>: chỉ chọn khi đã đóng quán, mọi đơn đã bấm Đã xong.
              </li>
            </ul>
          </Step>
          <Step n="3" title="Cân / đếm rồi gõ số">
            Mỗi dòng có số <b>Sổ sách</b> (app đang tính còn bao nhiêu). Gõ số <b>thực tế</b> vào ô bên phải — để ý đơn vị ghi cạnh ô (<b>kg</b>,{' '}
            <b>lít</b>, cái…).
            <ul className="guide-list">
              <li>
                Đếm thấy đúng bằng sổ → bấm <b>= Sổ</b>, khỏi gõ.
              </li>
              <li>
                Bấm <b>Enter / Tiếp</b> trên bàn phím để sang ô kế tiếp.
              </li>
              <li>Món nào không kiểm thì để trống. Không cần kiểm hết, ít nhất là các loại hạt đắt tiền.</li>
              <li>
                Dùng ô tìm, các nút nhóm, nút <b>Chưa nhập</b> để xem món còn sót. Dòng đã nhập có vạch xanh bên trái.
              </li>
              <li>Lỡ đóng giữa chừng: mở lại vẫn còn số đã gõ (giữ 12 tiếng).</li>
            </ul>
          </Step>
          <Step n="4" title="Xem kỹ trước khi lưu">
            Mỗi dòng ghi <b className="danger-text">hụt … = −tiền</b>, <b className="good-text">dư …</b> hoặc <b className="good-text">khớp sổ</b>.
            Thanh dưới đáy cho thấy <b>tổng tiền hao hụt</b> sẽ trừ vào lãi.
            <ul className="guide-list">
              <li>
                Dòng <b className="danger-text">tô đỏ</b> = lệch nhiều. Bấm nút <b>Lệch nhiều</b> để xem riêng các dòng này, cân lại cho chắc.
              </li>
              <li>
                Hiện <b>“Nhầm đơn vị? Ý bạn là …”</b> → thường do gõ g vào ô kg. Bấm vào dòng đó để app sửa giúp.
              </li>
              <li>
                Hiện <b>“Sổ sách cao bất thường”</b> → lần nhập hàng / kiểm kê trước bị gõ nhầm. <b>Đừng lưu</b> — sửa lần nhầm trước (xem bước 5) rồi
                mới kiểm kê.
              </li>
            </ul>
            Xong bấm <Btn primary>Lưu kiểm kê</Btn>. Tiền hụt chỉ tính phần <b>thiếu</b>, phần dư không cộng tiền.
          </Step>
          <Step n="5" title="Lỡ lưu sai thì sửa thế nào?">
            Tab <b>Lịch sử kiểm kê</b> → tìm dòng sai → bấm <Btn icon={Trash2}>Nhập sai</Btn>: xóa lần đó, gỡ tiền hao hụt của lần đó, kho tính lại như
            chưa kiểm. Nếu đã kiểm kê lại sau lần sai, xóa <b>cả 2 lần</b> rồi kiểm kê lại 1 lần với số đúng.
          </Step>
          <p className="guide-tip">
            💡 Nên <b>kiểm kê trước, nhập hàng sau</b>. Nhập hàng có ngày trùng / trước ngày kiểm kê thì app sẽ hỏi hàng đó đã nằm trong số đếm chưa để
            không cộng 2 lần.
          </p>
        </Section>

        <Section icon={LayoutDashboard} title="Xem lãi lỗ" when="Trang Tổng quan">
          <Step n="1" title="Chọn khoảng thời gian" to="/">
            Bấm <b>Hôm nay · Hôm qua · Tuần này · Tuần trước · Tháng này · Tháng trước</b>, hoặc <b>Tùy chọn</b> để chọn từ ngày nào đến ngày nào.
          </Step>
          <Step n="2" title="Ba con số chính">
            <ul className="guide-list">
              <li>
                <b>Bán được</b>: tổng tiền bán ra và số phần, so với kỳ trước.
              </li>
              <li>
                <b>Lãi ròng</b>: bán được − nguyên liệu của số ly đã bán − hàng hủy − hao hụt kiểm kê − chi phí khác − nguyên liệu “tính 1 lần lúc
                mua”. Đây là số lời / lỗ thật.
              </li>
              <li>
                <b>Tiền còn lại</b>: bán được − tiền đi chợ − chi phí khác. Tuần nào mua trữ nhiều hàng thì số này thấp hơn Lãi ròng, không phải lỗ.
              </li>
            </ul>
            Bấm <b>Xem lãi ròng được tính thế nào ▾</b> để thấy từng khoản trừ. Số lãi / lỗ trông lạ thì xem ở đây trước.
          </Step>
          <Step n="3" title="Cần chú ý & nhận xét">
            Khung <b>Cần chú ý</b> báo đơn quên bấm Đã xong, nguyên liệu sắp hết, món lãi mỏng — bấm vào để tới đúng trang. Bên dưới có vài câu nhận
            xét: bán nhiều / ít hơn kỳ trước, cần bán bao nhiêu phần/ngày để hòa vốn, hàng hủy nhiều…
          </Step>
          <Step n="4" title="Kiểm tra số liệu" to="/kiem-tra">
            <ShieldCheck size={15} className="inline-icon" /> App tự quét những chỗ làm số sai mà khó thấy: đơn đã giao nhưng mất doanh thu, món chưa
            có công thức (lãi ảo), nguyên liệu chưa có giá, dòng bán giá vốn 0đ, tồn kho âm, chưa chạy file nâng cấp… Mỗi mục ghi rõ hậu quả, bấm để
            tới chỗ sửa, có nút sửa luôn (<b>Ghi lại doanh thu</b>, <b>Sửa giá vốn</b>). Có lỗi thì Tổng quan cũng nhắc ở khung Cần chú ý.
          </Step>
          <Step n="5" title="Xuất Excel">
            Nút <Btn icon={Download}>Xuất Excel</Btn> ở góc trên → tải file Excel của khoảng thời gian đang xem, để lưu trữ hoặc gửi kế toán.
          </Step>
        </Section>

        <Section icon={CircleQuestionMark} title="Câu hỏi thường gặp">
          <div className="guide-faq">
            <p>
              <b>Tổng quan báo lỗ rất lớn (hàng chục, hàng trăm triệu)?</b>
              <br />
              Gần như luôn do gõ nhầm đơn vị (g ↔ kg) ở nhập hàng hoặc kiểm kê. Bấm <b>Xem lãi ròng được tính thế nào</b> xem dòng nào to bất thường:
              <br />– <b>Hao hụt kiểm kê</b> to → <Link to="/nguyen-lieu">Nguyên liệu</Link> → <b>Lịch sử kiểm kê</b> → bấm <b>Nhập sai</b> các lần
              sai (cả lần sửa lại sau đó), rồi kiểm kê lại 1 lần.
              <br />– <b>Nguyên liệu của số ly đã bán</b> to → giá nguyên liệu bị sai (xem câu dưới).
            </p>
            <p>
              <b>Lỡ nhập hàng sai?</b>
              <br />
              Vào <Link to="/nhap-hang">Nhập hàng</Link>, bấm thùng rác để xóa phiếu sai rồi nhập lại. Lưu ý: <b>giá bình quân không tự đổi lại</b> —
              mở nguyên liệu đó ở trang Nguyên liệu, sửa ô <b>Giá mỗi kg</b> (hoặc lít / cái) cho đúng.
            </p>
            <p>
              <b>Tồn kho bị âm?</b>
              <br />
              Chưa kiểm kê lần đầu, hoặc mua hàng mà quên ghi Nhập hàng. Kiểm kê lại là hết.
            </p>
            <p>
              <b>Mua được tặng thêm, được giảm giá thì ghi sao?</b>
              <br />
              Ghi <b>tổng số lượng thực nhận</b> (cả phần tặng) và <b>tổng tiền thực trả</b>. App tự chia ra giá mỗi kg.
            </p>
            <p>
              <b>Sao giá nguyên liệu không bằng giá lần mua mới nhất?</b>
              <br />
              App tính <b>giá bình quân</b> của hàng cũ còn trong kho và hàng mới mua. Mua giá rẻ dần thì giá bình quân cũng giảm dần theo.
            </p>
            <p>
              <b>Lỡ bán sai, bấm Đã xong nhầm?</b>
              <br />
              Xem phần <b>Bán hàng mỗi ngày → Sửa / xóa đơn</b>: vào Đơn bán → <b>Mở lại</b> đơn đó → sửa → Đã xong lại.
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
          <Step n="" title="Đổi giao diện sáng / tối">
            Vào <b>Khác</b> → <b>Giao diện</b>.
          </Step>
        </Section>
      </div>
    </>
  )
}
