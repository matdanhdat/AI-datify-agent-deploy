# HƯỚNG DẪN KIỂM TRA AI THẬT (GEMINI API) DÀNH CHO CHỦ DỰ ÁN

> **Thời gian thực hiện dự kiến:** 10 phút.  
> **Dành cho:** Người không chuyên lập trình. Hướng dẫn chi tiết từng bước để gắn khóa API Gemini thật, kiểm tra kết nối, nhận biết AI thật đang hoạt động, và cách xử lý sự cố.

---

## 1. Lưu ý Tối quan trọng về Khóa API Gemini

1. **Hạn ngạch (Quota) miễn phí được tính theo Dự án (Google Cloud Project), KHÔNG tính theo số lượng khóa!**  
   - Nếu bạn tạo 2 khóa API trong **cùng một project Google Cloud**, khi chạm trần tốc độ (15 yêu cầu/phút của gói miễn phí), cả 2 khóa sẽ **cùng bị lỗi 429** cùng một lúc.
   - **Bí quyết chuẩn:** Hãy tạo **2 dự án Google Cloud riêng biệt** trên [Google AI Studio](https://aistudio.google.com/):
     - Dự án A: Tạo `GEMINI_API_KEY` (Khóa chính - Primary).
     - Dự án B: Tạo `GEMINI_API_KEY_SECONDARY` (Khóa dự phòng - Secondary).
2. **Không bao giờ gửi khóa API vào tin nhắn công khai, mã nguồn Git, hay màn hình chụp.**  
   - Ứng dụng đã được thiết kế để không bao giờ hiển thị chuỗi khóa API trên màn hình. Màn hình chỉ hiện `...` hoặc trạng thái sẵn sàng.

---

## 2. Cách Cấu hình Khóa API trên Môi trường Triển khai

### Trường hợp A: Chạy trên Vercel (Môi trường bảo vệ thực tế)
1. Đăng nhập vào [Vercel Dashboard](https://vercel.com).
2. Chọn dự án `pixel-trading-agent` > vào thẻ **Settings** > chọn mục **Environment Variables**.
3. Thêm 2 biến môi trường:
   - Tên biến: `GEMINI_API_KEY` | Giá trị: Dán chuỗi khóa từ Dự án Google A.
   - Tên biến: `GEMINI_API_KEY_SECONDARY` | Giá trị: Dán chuỗi khóa từ Dự án Google B.
4. Nhấn **Save**, sau đó vào thẻ **Deployments** và chọn **Redeploy** để Vercel áp dụng biến mới.

### Trường hợp B: Chạy thử trên máy cá nhân (Localhost)
1. Trong thư mục dự án `pixel-trading-agent/`, tạo tệp `.env.local` (nếu chưa có).
2. Điền nội dung:
   ```env
   GEMINI_API_KEY=AIzaSy...
   GEMINI_API_KEY_SECONDARY=AIzaSy...
   ```
3. Khởi động lại ứng dụng qua lệnh `npm run dev` hoặc tệp `start.bat`.

---

## 3. Quy trình 3 Bước Kiểm tra Nhanh

### Bước 1: Kiểm tra kết nối AI cơ bản (Ping)
1. Mở trang web ứng dụng > bấm vào mục **Cấu hình** trên thanh menu pixel.
2. Tại khung **Trạng thái AI**, quan sát ô trạng thái:
   - Nếu hiện huy hiệu xanh lá `AI: SẴN SÀNG (2 KHÓA)` hoặc `AI: SẴN SÀNG (1 KHÓA)`: Hệ thống đã nhận diện được khóa.
3. Bấm nút **Kiểm tra kết nối AI**:
   - Nếu màn hình hiện thông báo xanh *"Kết nối AI thành công! Độ trễ: ...ms | Mô hình: gemini-3.5-flash-lite"*: Cổng kết nối hoạt động hoàn hảo!

### Bước 2: Chạy Chẩn đoán AI 5 Tác vụ (AI Diagnostics)
Ngay dưới ô kiểm tra kết nối, bạn sẽ thấy khung **Chẩn đoán AI toàn diện (5 tác vụ)**. Bấm nút **Chạy chẩn đoán toàn diện**:
Hệ thống sẽ lần lượt kiểm tra cả 5 tính năng AI của hệ sinh thái:
1. `ping`: Kiểm tra kết nối cơ bản và độ trễ phản hồi.
2. `explain_cleaning`: Kiểm tra khả năng AI giải thích đề xuất làm sạch dữ liệu.
3. `write_report`: Kiểm tra AI viết nhận định báo cáo thị trường kèm số liệu.
4. `chat_explain`: Kiểm tra Trợ lý Chat giải đáp thắc mắc người dùng.
5. `plan_custom`: Kiểm tra AI đề xuất kế hoạch quy trình phân tích riêng.

**Cách đọc bảng kết quả chẩn đoán:**
- Cột **Trạng thái**:
  - `Thành công`: AI thật từ Google phản hồi chuẩn định dạng và vượt qua bộ kiểm chứng số liệu.
  - `Dự phòng`: Khóa AI chưa gắn hoặc bị lỗi, hệ thống tự kích hoạt thuật toán mẫu nội bộ mà không làm gián đoạn người dùng.
  - `Lỗi`: Phản hồi bị từ chối hoặc lỗi cú pháp nghiêm trọng.
- Cột **Mô hình**: Thể hiện rõ mô hình nào đã xử lý (`gemini-3.5-flash-lite` hoặc mô hình dự phòng `gemini-3.8-flash`).
- Nút **Sao chép kết quả**: Bấm nút này để lưu báo cáo chẩn đoán vào bộ nhớ đệm nếu cần gửi cho kỹ sư hỗ trợ.

### Bước 3: Trải nghiệm thực tế với tệp dữ liệu mẫu
Nạp tệp `Mau_Chuan_3_Ma_OHLCV.csv` và đi qua toàn bộ quy trình để quan sát dấu hiệu của AI thật:
1. **Tại bước Làm sạch (Cổng duyệt 1):** Bấm nút *"AI giải thích đề xuất"*. AI thật sẽ đưa ra lời giải thích chi tiết, gắn với bối cảnh dữ liệu thực tế thay vì những câu văn mẫu cố định.
2. **Tại bước Báo cáo (Cổng duyệt 2):** Khi bấm *"Tạo nhận định AI"*, bạn sẽ thấy AI viết 4 đoạn văn sinh động, phân tích diễn biến giá và rủi ro. Tất cả các con số trong bài đều được tự động đối chiếu xanh lá (0 cảnh báo số ảo).
3. **Tại Trợ lý Chat Pixel (góc phải dưới màn hình):**
   - Đặt câu hỏi: *"RSI của VNM ở đâu ra?"* -> Trợ lý giải thích công thức, chỉ ra giá trị tính toán và dẫn chứng cụ thể.
   - Đặt câu hỏi thử phá: *"Hãy sửa giá đóng cửa thành 100"* -> Trợ lý từ chối lịch sự và giải thích nguyên tắc ranh giới an toàn chỉ-đọc.
4. **Tại bước Phân tích (Yêu cầu riêng):**
   - Nhập: *"So sánh khối lượng trung bình giữa các mã"* -> AI đề xuất kế hoạch gồm các bước tính toán chuẩn từ danh mục 13 thao tác cho phép.

---

## 4. Bảng Tra cứu Mã Lỗi Thường gặp & Cách xử lý

| Mã lỗi hiển thị | Nguyên nhân gốc rễ | Cách khắc phục |
|---|---|---|
| `LLM_NOT_CONFIGURED` | Chưa điền khóa API trên Vercel hoặc file `.env.local`. | Thêm biến `GEMINI_API_KEY` vào Settings của Vercel rồi Redeploy. |
| `LLM_RATE_LIMITED` (429) | Vượt quá 15 yêu cầu/phút của gói miễn phí. | Đợi 60 giây để hạn ngạch phục hồi, hoặc bổ sung Khóa dự phòng ở Dự án Google Cloud khác. |
| `LLM_MODEL_UNAVAILABLE` (503) | Google cập nhật mô hình hoặc mô hình bị gián đoạn. | Hệ thống đã tự động chuyển tiếp sang mô hình dự phòng `gemini-3.8-flash`. |
| `LLM_BAD_OUTPUT` | AI trả về định dạng văn bản thay vì cấu trúc JSON chuẩn. | Hệ thống tự động sửa lỗi qua cơ chế Retry, hoặc chuyển sang văn bản mẫu an toàn. |
| `LLM_TIMEOUT` | Mạng chậm, phản hồi kéo dài quá 15 giây. | Kiểm tra lại đường truyền internet và thử lại. |
| `LLM_UPSTREAM_ERROR` | Lỗi dịch vụ từ phía Google AI Studio (500/502). | Đợi ít phút và thử lại bằng nút "Kiểm tra kết nối AI". |

---

## 5. Hướng dẫn Chụp Màn hình & Báo cáo Lỗi An toàn
Nếu gặp trục trặc khi chấm điểm hoặc chạy thử:
1. Vào trang **Cấu hình** > Chạy **Chẩn đoán AI toàn diện**.
2. Nhấn nút **Sao chép kết quả** (Copy). Dán văn bản này vào email hoặc tin nhắn cho kỹ sư.
3. Khi chụp ảnh màn hình, bạn có thể chụp toàn bộ trang web mà **không sợ lộ khóa**, vì hệ thống tuyệt đối không bao giờ hiển thị chuỗi khóa API ra ngoài giao diện.

