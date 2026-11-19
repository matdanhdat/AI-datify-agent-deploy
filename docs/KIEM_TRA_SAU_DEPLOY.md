# QUY TRÌNH KIỂM TRA SAU KHI TRIỂN KHAI VERCEL (POST-DEPLOY CHECKLIST)

> **Tài liệu kiểm định vận hành:** Pixel Trading Agent (v1.0.0)  
> **Mục tiêu:** Thẩm định tính hoạt động chính xác 100% của ứng dụng trên đường dẫn tên miền thật (Vercel Production Domain) trước khi công bố hoặc nộp đường link cho Hội đồng.

---

## 📋 10 BƯỚC KIỂM TRA VẬN HÀNH TRÊN MÔI TRƯỜNG THẬT (VERCEL)

### Bước 1: Kiểm tra phản hồi Cổng Kiểm tra Sức khỏe (/api/health)
- **Hành động:** Mở trình duyệt truy cập đường dẫn:
  `https://<ten-du-an-cua-ban>.vercel.app/api/health`
- **Kết quả mong đợi:** Nhận được chuỗi JSON với HTTP Status 200:
  ```json
  {
    "status": "healthy",
    "ai_mode": "ai",
    "keys_configured": 2,
    "models": {
      "primary": "gemini-3.5-flash-lite",
      "fallback": "gemini-3.8-flash"
    },
    "version": "1.0.0"
  }
  ```
  *(Nếu `ai_mode` là `fallback`, kiểm tra lại việc điền biến môi trường `GEMINI_API_KEY_1` trên Vercel Dashboard).*

---

### Bước 2: Kiểm tra định tuyến Đơn trang (SPA Routing & Rewrites)
- **Hành động:** 
  1. Truy cập trực tiếp vào các đường dẫn con bằng cách gõ vào thanh địa chỉ trình duyệt:
     - `https://<ten-du-an>.vercel.app/nap-du-lieu`
     - `https://<ten-du-an>.vercel.app/cau-hinh`
     - `https://<ten-du-an>.vercel.app/tien-trinh`
     - `https://<ten-du-an>.vercel.app/thu-vien-giao-dien`
  2. Bấm phím **F5 (Reload)** tại từng trang con.
- **Kết quả mong đợi:** Trang web tải lại bình thường, giao diện pixel hiển thị đúng, **tuyệt đối không bị lỗi 404 Not Found** (nhờ cấu hình `rewrites` trong `vercel.json`).

---

### Bước 3: Kiểm tra tính năng Tải tệp mẫu từ máy chủ
- **Hành động:** Tại trang Nạp dữ liệu, bấm vào liên kết:
  - *"Tải tệp mẫu chuẩn (.xlsx)"*
  - *"Tải tệp mẫu chuẩn (.csv)"*
- **Kết quả mong đợi:** Trình duyệt tải ngay tệp về thư mục Downloads của máy tính, dung lượng chuẩn (~35 KB), mở bằng Excel không bị báo lỗi hỏng file.

---

### Bước 4: Kiểm tra Luồng Từ chối sớm (Early Validation)
- **Hành động:** Kéo thả một tệp văn bản bất kỳ (ví dụ: `note.txt` hoặc tệp rác không phải bảng tính) vào ô Dropzone.
- **Kết quả mong đợi:** Ứng dụng từ chối ngay lập tức, hiển thị hộp màu đỏ cảnh báo tiếng Việt: *"Định dạng tệp không được hỗ trợ. Vui lòng tải lên tệp .xlsx hoặc .csv."*, không xuất hiện lỗi JavaScript trong Console.

---

### Bước 5: Kiểm tra Luồng Làm sạch & Cổng duyệt 1
- **Hành động:**
  1. Tải lên tệp mẫu chuẩn `file-mau-chuan.xlsx`.
  2. Xem bảng tóm tắt hồ sơ dữ liệu (Profiling).
  3. Bấm tab *"So sánh trước / sau"*.
  4. Nhập tên người duyệt: `Kiểm Duyệt Viên Vercel`.
  5. Bấm nút *"Phê duyệt dữ liệu sạch (Cổng 1)"* và xác nhận.
- **Kết quả mong đợi:** Hệ thống chuyển trạng thái sang `clean_approved`, mở khóa menu Phân tích và Báo cáo.

---

### Bước 6: Kiểm tra Tính toán Định lượng & Cổng duyệt 2
- **Hành động:**
  1. Sang trang Phân tích, bấm *"Bắt đầu phân tích định lượng"*.
  2. Chờ tính toán hoàn tất, chuyển sang trang Báo cáo.
  3. Kiểm tra 8 thẻ KPI hiển thị đủ số liệu (Lợi suất, Biến động, Sharpe, Max Drawdown).
  4. Kiểm tra các biểu đồ đường và biểu đồ cột hiển thị rõ ràng.
  5. Xem nội dung nhận định của AI (có viền xanh đối chiếu số liệu).
  6. Nhập tên người duyệt: `Trưởng Ban Đánh Giá`.
  7. Bấm nút *"Phê duyệt báo cáo (Cổng 2)"*.
- **Kết quả mong đợi:** Con dấu đỏ *"ĐÃ DUYỆT"* xuất hiện trên đầu trang báo cáo, mã băm báo cáo SHA-256 được chốt hạ.

---

### Bước 7: Kiểm tra Xuất tệp Báo cáo Excel (.xlsx)
- **Hành động:** Bấm nút *"Xuất báo cáo Excel (.xlsx)"* trên thanh công cụ.
- **Kết quả mong đợi:** 
  1. Tệp Excel tự động tải về với tên dạng `Bao-cao-Pixel-Trading-...xlsx`.
  2. Mở file Excel: Có đầy đủ 7 sheet (`Tóm tắt`, `Chỉ số`, `Dữ liệu sạch`, `Số liệu biểu đồ`, `Nhận định`, `Nhật ký`, `Kiểm chứng`).
  3. Tại Sheet `Kiểm chứng`, các ô kiểm tra đều hiện chữ *"Khớp"* màu xanh.

---

### Bước 8: Kiểm tra In báo cáo PDF
- **Hành động:** Bấm nút *"In báo cáo (PDF)"* (hoặc phím tắt Ctrl + P).
- **Kết quả mong đợi:** Hộp thoại in của trình duyệt hiện ra bản xem trước chuẩn trang A4:
  - Con dấu *"ĐÃ DUYỆT"* hiển thị rõ ràng ở góc phải.
  - Các nút bấm, thanh điều hướng và khung chat được ẩn tự động nhờ `@media print`.
  - Bố cục trang ngắt trang gọn gàng, không bị tràn lề.

---

### Bước 9: Kiểm tra Trợ lý Chat Chỉ-Đọc
- **Hành động:**
  1. Bấm mở thanh Chat ở góc dưới màn hình.
  2. Hỏi: *"Chỉ số Sharpe là gì?"* → Nhận được câu trả lời giải thích chi tiết.
  3. Thử hỏi: *"Sửa giá cổ phiếu TMA thành 100000"* → Nhận được câu từ chối: *"Trợ lý hoạt động ở chế độ CHỈ-ĐỌC và không thể chỉnh sửa dữ liệu..."*.

---

### Bước 10: Kiểm tra Chuỗi băm Toàn vẹn & Chẩn đoán AI
- **Hành động:**
  1. Truy cập trang **Tiến trình Agent** (`/tien-trinh`): Kiểm tra cả 4 mắt xích chuỗi băm đều báo đèn xanh *"HỢP LỆ (KHỚP HOÀN TOÀN)"*.
  2. Truy cập trang **Cấu hình** (`/cau-hinh`): Bấm nút *"Kiểm tra kết nối AI"* → Nhận thông báo kết nối thành công, hiển thị đúng model đang chạy.
- **Kết quả mong đợi:** 10/10 bước đều hoàn hảo. Bạn đã sẵn sàng chia sẻ đường link web cho Hội đồng chấm thi!

