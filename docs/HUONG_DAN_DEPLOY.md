# HƯỚNG DẪN TRIỂN KHAI LÊN VERCEL (TỪNG BƯỚC CHO NGƯỜI MỚI)

Tài liệu này hướng dẫn chi tiết cách đưa ứng dụng **Pixel Trading Agent** lên Internet qua nền tảng miễn phí **Vercel** và liên kết với dịch vụ trí tuệ nhân tạo **Google Gemini**. Toàn bộ dữ liệu xử lý ngay trên trình duyệt máy khách, máy chủ Vercel chỉ đóng vai trò phân phối giao diện và bảo vệ khóa API an toàn.

---

## BƯỚC 1: Chuẩn bị công cụ trên máy tính

1. **Cài đặt Node.js (phiên bản LTS):**
   - Truy cập trang chủ: [https://nodejs.org/](https://nodejs.org/)
   - Tải bản **LTS (Long Term Support)** và cài đặt theo mặc định (chỉ cần bấm *Next* liên tục).
2. **Cài đặt GitHub Desktop (Khuyên dùng cho người không quen gõ lệnh):**
   - Tải tại: [https://desktop.github.com/](https://desktop.github.com/)
   - Đăng nhập bằng tài khoản GitHub (nếu chưa có, đăng ký miễn phí tại [github.com](https://github.com)).

---

## BƯỚC 2: Chuẩn bị khóa API Google Gemini (Miễn phí)

1. Truy cập [Google AI Studio](https://aistudio.google.com/).
2. Đăng nhập bằng tài khoản Google của bạn.
3. Nhấp vào nút **Get API key** ở thanh menu bên trái.
4. Nhấp **Create API key** và sao chép chuỗi ký tự khóa được cấp (ví dụ bắt đầu bằng `AIzaSy...`).
5. *Mẹo:* Bạn nên tạo thêm một khóa thứ 2 dự phòng để điền vào `GEMINI_API_KEY_2`. Hệ thống sẽ tự động chuyển khóa nếu khóa 1 tạm thời hết hạn mức.

---

## BƯỚC 3: Đưa mã nguồn lên GitHub

### Cách A: Dành cho người dùng GitHub Desktop (Đơn giản nhất)
1. Mở phần mềm **GitHub Desktop**.
2. Chọn menu **File** → **Add Local Repository...** (hoặc phím tắt `Ctrl + O`).
3. Chọn đường dẫn tới thư mục `pixel-trading-agent`.
4. Nếu thấy thông báo *"This directory does not appear to be a Git repository"*, nhấp vào liên kết xanh **create a repository here**.
5. Nhập tên kho (ví dụ: `pixel-trading-agent`), giữ nguyên các tùy chọn và bấm **Create Repository**.
6. Ở góc trên bên phải, bấm nút **Publish repository**.
7. Bỏ chọn ô *"Keep this code private"* nếu muốn công khai hoặc giữ nguyên nếu muốn riêng tư, rồi bấm **Publish repository**.

### Cách B: Dành cho người dùng dòng lệnh (Git CLI)
```bash
cd pixel-trading-agent
git init
git add .
git commit -m "feat: Khoi tao kien truc Pixel Trading Agent Vercel + Browser"
git branch -M main
git remote add origin https://github.com/<tai-khoan-cua-ban>/pixel-trading-agent.git
git push -u origin main
```

---

## BƯỚC 4: Triển khai lên Vercel (Deploy)

1. Truy cập trang chủ [https://vercel.com/](https://vercel.com/) và đăng nhập bằng tài khoản GitHub của bạn.
2. Tại bảng điều khiển Vercel (*Dashboard*), bấm nút **Add New...** ở góc phải và chọn **Project**.
3. Tại danh sách kho GitHub hiện ra, tìm `pixel-trading-agent` và bấm nút **Import**.
4. Tại màn hình **Configure Project**:
   - **Framework Preset:** Chọn **Vite** (Vercel thường sẽ tự nhận diện).
   - **Root Directory:** Giữ nguyên `./` (thư mục gốc).
   - **Build and Output Settings:** Giữ mặc định (Build Command: `npm run build`, Output Directory: `dist`).
5. Mở rộng mục **Environment Variables** (Biến môi trường) và thêm lần lượt các biến sau:
   - **Tên:** `GEMINI_API_KEY_1` | **Giá trị:** *(dán khóa API thứ nhất của bạn)*
   - **Tên:** `GEMINI_API_KEY_2` | **Giá trị:** *(dán khóa API thứ hai của bạn nếu có)*
   - **Tên:** `GEMINI_MODEL` | **Giá trị:** `gemini-3.5-flash-lite` (mô hình nhanh có hạn mức miễn phí)
   - **Tên:** `GEMINI_MODEL_FALLBACK` | **Giá trị:** `gemini-3.8-flash` (mô hình dự phòng)
   - *(Tùy chọn tối ưu tốc độ)* **Tên:** `GEMINI_THINKING_LEVEL` | **Giá trị:** `minimal` (giảm độ trễ ping xuống thấp nhất)
   - *(Tùy chọn)* **Tên:** `GEMINI_THINKING_LEVEL_REPORT` | **Giá trị:** `low` (mức suy nghĩ ngắn cho báo cáo)
6. Nhấp nút **Deploy** màu xanh lớn ở dưới cùng và chờ khoảng 1 phút.
7. Khi thấy màn hình chúc mừng tung hoa giấy (*Congratulations!*), nhấp vào khung xem trước hoặc liên kết miền `.vercel.app` để mở ứng dụng của bạn!

---

## BƯỚC 5: Kiểm tra sau khi triển khai

1. **Kiểm tra trạng thái máy chủ:**
   - Trên thanh địa chỉ trình duyệt, gõ thêm `/api/health` vào sau tên miền của bạn (ví dụ: `https://ten-du-an.vercel.app/api/health`).
   - Màn hình sẽ hiện thông tin JSON:
     ```json
     {
       "status": "ok",
       "app_name": "Pixel Trading Agent",
       "version": "0.2.0",
       "ai_mode": "ai",
       "llm_provider": "gemini",
       "llm_model": "gemini-3.5-flash-lite",
       "llm_model_fallback": "gemini-3.8-flash",
       "llm_key_slots": 2
     }
     ```
     Nếu `llm_key_slots: 2` (hoặc 1) và `ai_mode: "ai"`, hệ thống đã kết nối khóa thành công!
2. **Kiểm tra kết nối AI trên giao diện:**
   - Quay lại trang chủ, vào menu **Cấu hình** trên thanh điều hướng bên trái.
   - Nhìn huy hiệu trên thanh Topbar hiển thị: **`AI: Gemini (2 khóa)`** màu xanh lá.
   - Bấm nút **Kiểm tra kết nối AI**: Hệ thống sẽ gửi gói tin chẩn đoán và hiển thị thông báo thành công kèm thời gian phản hồi (ms).

---

## BƯỚC 6: Cách cập nhật ứng dụng sau này

Mỗi khi bạn sửa đổi mã nguồn hoặc nhận bản cập nhật mới:
1. Mở **GitHub Desktop**, nhập mô tả ngắn (ví dụ: *"Cập nhật giao diện"*) và bấm **Commit to main**.
2. Bấm nút **Push origin**.
3. Vercel sẽ tự động phát hiện commit mới và tự động build lại trang web trong vòng chưa đầy 1 phút. Bạn không cần thao tác lại bất kỳ điều gì trên Vercel.

---

## Bảng tra cứu mã lỗi Cổng AI (LLM Error Codes) & Cách khắc phục cho người dùng

Khi kiểm tra kết nối AI hoặc trong quá trình sử dụng các tính năng AI, nếu có thông báo lỗi kèm mã `(mã LLM_*)`, bạn có thể tra cứu nhanh bảng dưới đây để xử lý:

| Mã lỗi | Ý nghĩa | Nguyên nhân thường gặp | Hướng dẫn khắc phục cho người dùng |
|---|---|---|---|
| **`LLM_NOT_CONFIGURED`** | Chưa cấu hình khóa API | Máy chủ chưa nhận được khóa `GEMINI_API_KEY_1`. | • **Chạy cục bộ:** Kiểm tra tệp `.env.local` đã có dòng `GEMINI_API_KEY_1=AIzaSy...` chưa và khởi động lại terminal.<br>• **Trên Vercel:** Vào *Project Settings* → *Environment Variables* → thêm biến `GEMINI_API_KEY_1`, sau đó vào tab *Deployments* chọn **Redeploy**. |
| **`LLM_BAD_INPUT`** | Yêu cầu gửi tới AI không hợp lệ | Tham số đầu vào bị thiếu trường bắt buộc hoặc sai định dạng quy định. | • Nhấn phím `F5` hoặc tải lại tab trình duyệt để ứng dụng nạp cấu trúc dữ liệu mới nhất.<br>• Xem danh sách các trường bị báo lỗi trên hộp thông báo để kiểm tra lại dữ liệu nạp. |
| **`LLM_BAD_OUTPUT`** | Phản hồi của AI không đúng chuẩn | Mô hình AI trả về kết quả không khớp cấu trúc JSON hoặc sai lệch kiểm chứng số liệu. | • Bấm **Thử lại** lần nữa.<br>• Hệ thống đã tự động chuyển sang mẫu câu dự phòng an toàn (100% kiểm chứng chuẩn) nên báo cáo vẫn xem được bình thường. |
| **`LLM_RATE_LIMITED`** | Vượt hạn mức gọi AI | Đạt ngưỡng tối đa 15 yêu cầu/phút của gói Gemini miễn phí. | • Đợi khoảng 60 giây để hạn mức hồi phục rồi thử lại.<br>• **Khuyên dùng:** Cấu hình thêm Khóa dự phòng thứ hai (`GEMINI_API_KEY_2`) thuộc một Dự án Google Cloud riêng biệt để tự động luân phiên. |
| **`LLM_TIMEOUT`** | Quá thời gian chờ phản hồi | Quá thời gian chờ quy định (50 giây) mà AI chưa kịp phản hồi. | • Kiểm tra lại kết nối mạng Internet.<br>• Nếu mạng vẫn tốt, có thể máy chủ Google AI đang bị nghẽn tạm thời; hãy thử lại sau 1-2 phút. |
| **`LLM_MODEL_UNAVAILABLE`** | Mô hình AI không khả dụng | Tên mô hình trong biến `GEMINI_MODEL` bị sai hoặc Google tạm ngưng mô hình đó. | • Kiểm tra lại biến `GEMINI_MODEL` trên Vercel / `.env.local` (nên đặt `gemini-3.5-flash-lite`).<br>• Cổng AI sẽ tự động kích hoạt mô hình dự phòng `gemini-3.8-flash`. |
| **`LLM_PAYLOAD_TOO_LARGE`** | Dữ liệu vượt quá dung lượng | Gói tin gửi lên cổng AI vượt quá giới hạn an toàn 64 KB. | • Giảm bớt số lượng mã cổ phiếu đang chọn cùng lúc trong kỳ phân tích.<br>• Rút ngắn bớt khoảng thời gian phân tích (ví dụ từ 2 năm xuống 1 năm). |
| **`LLM_UNKNOWN_TASK`** | Tác vụ AI không hợp lệ | Tên tác vụ gửi lên không nằm trong danh mục 5 tác vụ được cấp phép. | • Xóa bộ nhớ cache trình duyệt (`Ctrl + Shift + R`) hoặc khởi động lại ứng dụng để đồng bộ phiên bản mới nhất. |
| **`LLM_UPSTREAM_ERROR`** | Gián đoạn từ máy chủ Google | Máy chủ Google Gemini gặp sự cố phản hồi (mã lỗi 5xx). | • Sự cố tạm thời từ hạ tầng Google Cloud. Vui lòng chờ 1-2 phút rồi bấm kiểm tra hoặc thử lại. |

---

## Các sự cố thường gặp & Cách khắc phục khác

| Hiện tượng | Nguyên nhân | Cách khắc phục |
|---|---|---|
| **`llm_key_slots: 0` và hiện Chế độ dự phòng** | Chưa điền biến môi trường trên Vercel hoặc quên Redeploy | Vào Vercel → Project Settings → Environment Variables → kiểm tra biến `GEMINI_API_KEY_1`. Sau đó vào tab *Deployments*, nhấp vào dấu 3 chấm ở bản deploy gần nhất và chọn **Redeploy**. |
| **Tải lại trang con bị lỗi 404 Not Found** | Thiếu cấu hình điều hướng Single Page App | Kiểm tra tệp `vercel.json` ở thư mục gốc có chứa quy tắc chuyển hướng `/(.*)` về `/index.html`. |
| **Báo lỗi `LLM_RATE_LIMITED (429)`** | Hết hạn mức gọi Gemini miễn phí trong phút đó | Chờ 1 phút rồi thử lại. Khuyên dùng thêm khóa thứ 2 vào `GEMINI_API_KEY_2` để hệ thống tự động luân phiên. |
| **Không tải được trang web khi mất mạng** | Ứng dụng cần tải tài nguyên ban đầu từ máy chủ Vercel | Kiểm tra kết nối Internet trên thiết bị của bạn. Khi đã tải trang xong một lần, các thao tác tính toán dữ liệu sẽ chạy trơn tru cục bộ. |

