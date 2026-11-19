# HƯỚNG DẪN ĐẨY LÊN GITHUB VÀ TRIỂN KHAI VERCEL
**Dự án:** Datify AI Agent (`pixel-trading-agent`)  
**Thư mục đóng gói:** `C:\Users\ADMIN\Downloads\Antigravity_IDE - Copy\datify-ai-agent-deploy`  
**Dành cho:** Người dùng không chuyên lập trình, sử dụng GitHub Desktop và giao diện Vercel.

---

## BƯỚC 1: ĐẨY THƯ MỤC LÊN GITHUB BẰNG GITHUB DESKTOP

1. **Mở phần mềm GitHub Desktop** trên máy tính của bạn.
2. Trên thanh menu trên cùng, chọn:
   `File` ➔ `Add local repository...` (hoặc bấm tổ hợp phím `Ctrl + O`).
3. Bấm nút **Choose...** và duyệt đến đúng thư mục:
   ```
   C:\Users\ADMIN\Downloads\Antigravity_IDE - Copy\datify-ai-agent-deploy
   ```
4. Nếu GitHub Desktop thông báo: *"This directory does not appear to be a Git repository"*, hãy bấm vào dòng chữ màu xanh **"create a repository"** để GitHub Desktop tự khởi tạo:
   - **Name:** `datify-ai-agent` (hoặc tên tùy bạn chọn)
   - **Git Ignore:** None (vì thư mục đã có sẵn tệp `.gitignore` chuẩn)
   - **License:** None (hoặc MIT)
   - Bấm nút **Create Repository**.
5. Bấm nút **Publish repository** (màu xanh ở góc phải trên) để tải toàn bộ mã nguồn lên tài khoản GitHub của bạn:
   - Bỏ tick ô *"Keep this code private"* nếu bạn muốn chia sẻ kho công khai cho giảng viên, hoặc giữ tick nếu để kho riêng tư.
   - Bấm **Publish Repository**.

---

## BƯỚC 2: KẾT NỐI VÀ DEPLOY TRÊN VERCEL

1. Mở trình duyệt web truy cập trang chủ Vercel: [https://vercel.com/dashboard](https://vercel.com/dashboard) và đăng nhập bằng tài khoản GitHub của bạn.
2. Bấm nút **Add New...** (góc phải trên màn hình) ➔ chọn **Project**.
3. Tại danh sách các kho GitHub (**Import Git Repository**), tìm kho bạn vừa đẩy lên (ví dụ: `datify-ai-agent`) và bấm nút **Import**.
4. Tại màn hình **Configure Project**:
   - **Framework Preset:** Vercel sẽ tự động nhận diện là **Vite** (giữ nguyên).
   - **Root Directory:** `./` (giữ nguyên mặc định).
   - **Build and Output Settings:** Giữ nguyên mặc định (Build Command: `npm run build`, Output Directory: `dist`).
5. **CẤU HÌNH BIẾN MÔI TRƯỜNG (Environment Variables):**
   Mở rộng mục **Environment Variables** và thêm các biến sau:
   - **Key:** `GEMINI_API_KEY_1`  
     **Value:** *(Dán khóa API Gemini của bạn lấy từ Google AI Studio)*
   - **Key:** `GEMINI_API_KEY_2` *(Tùy chọn, thêm nếu bạn có khóa dự phòng)*  
     **Value:** *(Dán khóa Gemini dự phòng)*
   *(Cảnh báo bảo mật: Tuyệt đối không chia sẻ khóa API cho người lạ và không commit khóa vào kho GitHub).*
   *(Ghi chú: Nếu chưa có khóa, web vẫn chạy 100% bằng chế độ phân tích mẫu chuẩn xác định và không bị lỗi).*
6. Bấm nút **Deploy** màu xanh lớn ở góc dưới.
7. Đợi khoảng 1–2 phút để Vercel tự động cài đặt gói và biên dịch. Khi màn hình hiện hiệu ứng pháo hoa chúc mừng ("Congratulations!"), dự án đã được triển khai online thành công!

---

## BƯỚC 3: KIỂM TRA WEB SAU KHI TRIỂN KHAI THÀNH CÔNG

1. Bấm vào nút **Continue to Dashboard** hoặc bấm vào đường link trang web do Vercel cấp (dạng `https://datify-ai-agent-xxx.vercel.app`).
2. **Kiểm tra trạng thái hệ thống và AI:**
   - Trên thanh menu của trang web, bấm vào tab **"Cấu hình"** (`/cau-hinh`).
   - Bấm nút **"Kiểm tra kết nối"**: Hệ thống sẽ gọi API `/api/health` và hiển thị trạng thái màu xanh **"SẴN SÀNG"** (200 OK) cùng số lượng khóa API đang hoạt động.
3. **Thử nghiệm luồng phân tích thực tế:**
   - Bấm tab **"Nạp dữ liệu"** (`/nap-du-lieu`).
   - Nhập một câu hỏi phân tích (ví dụ: *"Kênh nào bán tốt nhất và doanh thu biến động ra sao?"*).
   - Bấm chọn hoặc kéo thả tệp mẫu bán lẻ (`samples/business/du-lieu-test-ban-le.csv`).
   - Bấm **"Tiếp tục làm sạch"** ➔ tại Cổng duyệt 1 bấm **"Duyệt và tiếp tục"** ➔ bấm **"Đến bước Phân tích"**.
   - Bấm **"Chạy phân tích dữ liệu kinh doanh"** ➔ bấm **"Xem báo cáo & Nhận định AI"**.
   - Kiểm tra toàn bộ biểu đồ, bảng chỉ số KPI, 20 sự kiện số liệu và phần xuất file Excel/PNG hiển thị chuẩn xác.

---

## BƯỚC 4: KHẮC PHỤC CÁC SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

1. **Lỗi "Build Failed" trên Vercel:**
   - Dự án đã được kiểm thử biên dịch trước 100% không lỗi. Vercel không cần biến môi trường để build bản web tĩnh. Nếu build fail, hãy vào mục **Deployments** ➔ bấm vào lần deploy bị lỗi ➔ xem mục **Build Logs** để kiểm tra nguyên nhân chi tiết.
2. **Lỗi 404 Not Found khi F5 (Tải lại trang) ở trang con (ví dụ: `/bao-cao`, `/phan-tich`):**
   - Tệp cấu hình `vercel.json` trong thư mục đã cài đặt sẵn quy tắc rewrite toàn bộ route về `/index.html`.
   - Nếu gặp lỗi 404, hãy kiểm tra trên kho GitHub xem tệp `vercel.json` có nằm ở thư mục gốc của kho không.
3. **Lỗi AI báo "503 LLM_NOT_CONFIGURED":**
   - Lỗi này xuất hiện khi bạn chưa điền khóa API Gemini hoặc nhập sai tên biến.
   - **Cách khắc phục:** Vào Vercel ➔ chọn dự án ➔ **Settings** ➔ **Environment Variables** ➔ kiểm tra xem tên biến có đúng chính xác là `GEMINI_API_KEY_1` không. Sau khi sửa, vào tab **Deployments** ➔ bấm vào dấu 3 chấm ở bản deploy mới nhất ➔ chọn **Redeploy** để Vercel nạp biến mới.
