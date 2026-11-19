# DANH SÁCH CẦN KIỂM TRA TRƯỚC NGÀY BẢO VỆ ĐỒ ÁN (CHECKLIST)

> **Dành cho:** Chủ dự án / Sinh viên chuẩn bị bước vào phòng bảo vệ  
> **Sản phẩm:** Pixel Trading Agent (v1.0.0)  
> **Mục tiêu:** Đảm bảo không xảy ra bất kỳ sự cố kỹ thuật nào trong 15 phút trình diễn trước Hội đồng chấm điểm.

---

## 📅 PHẦN 1: 1 NGÀY TRƯỚC KHI BẢO VỆ (T-24 GIỜ)

### 1. Kiểm tra Thiết bị & Phần cứng
- [ ] **Máy tính xách tay (Laptop):** Sạc đầy 100% pin và mang theo dây sạc / củ sạc dự phòng.
- [ ] **Cáp chuyển đổi máy chiếu:** Chuẩn bị sẵn cổng chuyển đổi HDMI / Type-C sang VGA/HDMI để cắm vào máy chiếu của hội trường. Thử cắm trước để kiểm tra hiển thị.
- [ ] **Độ phân giải màn hình:** Đặt độ phân giải màn hình về mức chuẩn **1366x768** hoặc **1920x1080** (tỷ lệ hiển thị 100%, không để phóng to 125% hay 150% khiến giao diện bị lệch khung).
- [ ] **Chuột quang:** Chuẩn bị chuột rời để thao tác kéo thả tệp và bấm nút mượt mà, không dùng touchpad để tránh bấm nhầm.

### 2. Kiểm tra Môi trường Chạy cục bộ (Localhost)
- [ ] Mở Command Prompt hoặc PowerShell tại thư mục đồ án, chạy lệnh kiểm tra toàn diện:
  ```cmd
  npm run predeploy
  ```
  *Yêu cầu bắt buộc:* Kết quả phải báo **"🎉 KẾT LUẬN: SẴN SÀNG ĐẨY LÊN GIT!"** (9/9 bước đạt chuẩn).
- [ ] Thử nháy đúp chuột vào tệp `start.bat`:
  *Yêu cầu:* Cửa sổ cmd màu đen hiện thông báo *"Dang khoi dong Pixel Trading Agent..."*, không báo lỗi cú pháp, tự động mở trình duyệt Chrome tại `http://localhost:8000`.
- [ ] Thử tắt mạng Wifi và chạy thử toàn bộ luồng với tệp `file-mau-chuan.xlsx` để chắc chắn chế độ Fallback hoạt động trơn tru 100% khi không có Internet.

### 3. Kiểm tra Tài khoản & Khóa API Google Gemini
- [ ] Đăng nhập vào [Google AI Studio](https://aistudio.google.com/) kiểm tra 2 khóa API (`GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`):
  - Đảm bảo hạn mức (Quota) còn nguyên vẹn, không bị khóa tài khoản.
  - Thử tạo thêm 1 khóa dự phòng thứ 3 cất vào file ghi chú trên máy nếu cần thay thế khẩn cấp.
- [ ] Truy cập trang `/cau-hinh` trên web cục bộ:
  - Bấm nút **"Kiểm tra kết nối AI"** → Phải báo đèn xanh: *"Kết nối AI thành công! Trạng thái: 200"*.
  - Bấm **"Chạy chẩn đoán toàn diện (5 tác vụ)"** → Cả 5 tác vụ (`ping`, `explain_cleaning`, `write_report`, `chat_explain`, `plan_custom`) đều báo thành công.

### 4. Chuẩn bị Thư mục Tệp Mẫu để Demo
- [ ] Tạo một thư mục riêng ngoài Desktop đặt tên là `DEMO_FILES/` chứa sẵn:
  1. `file-mau-chuan.xlsx` (Tệp chuẩn để chạy trọn vẹn luồng demo chính).
  2. `TC01_thieu_cot_bat_buoc.csv` (Tệp lỗi thiếu cột để biểu diễn tính năng Từ chối sớm).
  3. `TC19_vuot_qua_so_dong_toi_da.csv` (Tệp quá khổ để biểu diễn kiểm soát tài nguyên).
  4. Bản in PDF báo cáo mẫu đã in sẵn ra giấy khổ A4 có con dấu Pixel "ĐÃ DUYỆT" để sẵn sàng nộp cho Thầy/Cô nếu được yêu cầu xem bản cứng.

---

## ⏰ PHẦN 2: 1 GIỜ TRƯỚC KHI VÀO PHÒNG BẢO VỆ (T-60 PHÚT)

### 1. Chuẩn bị Trình duyệt Trình diễn
- [ ] Khởi chạy ứng dụng:
  ```cmd
  npm start
  ```
- [ ] Mở trình duyệt Google Chrome:
  - Mở sẵn tab 1: Trang chủ ứng dụng `http://localhost:8000/`.
  - Mở sẵn tab 2: Trang web đã deploy trên Vercel (nếu có Internet ổn định).
  - Nhấn phím **F11** để vào chế độ toàn màn hình (Full-screen) giúp giao diện pixel art chiếm trọn không gian, tạo ấn tượng thị giác chuyên nghiệp.
- [ ] Mở sẵn phần mềm Microsoft Excel trên máy để khi bấm nút **"Xuất báo cáo Excel (.xlsx)"** có thể mở lên ngay lập tức để Hội đồng kiểm tra các công thức sống.

### 2. Thiết lập Mạng & Phương án Dự phòng
- [ ] Bật tính năng phát Wifi (Personal Hotspot) từ điện thoại 4G/5G sẵn sàng, đề phòng Wifi của trường đại học bị chập chờn hoặc chặn cổng kết nối.
- [ ] Tắt toàn bộ thông báo của hệ điều hành Windows (Bật chế độ **Focus Assist / Do Not Disturb**) để tránh hiện thông báo tin nhắn cá nhân trong lúc máy chiếu đang chiếu màn hình.
- [ ] Tắt tất cả các ứng dụng ngầm nặng máy (Zalo, Telegram, game, trình duyệt có hàng chục tab ngầm) để giải phóng RAM tối đa cho Web Worker.

### 3. Tâm lý & Quy tắc Ứng xử
- [ ] Hít thở sâu, giữ thái độ tự tin, bình tĩnh.
- [ ] Nhớ nguyên tắc cốt lõi: *"AI không tính số - Con người kiểm soát qua 2 Cổng duyệt - Số liệu nào cũng có công thức toán và Excel đối chứng"*.
- [ ] Khi Thầy/Cô hỏi khó: Lắng nghe hết câu, gật đầu cảm ơn Thầy/Cô, không ngắt lời, bình tĩnh dùng chuột chỉ vào màn hình tính năng tương ứng để giải thích bằng chứng thực tế.

