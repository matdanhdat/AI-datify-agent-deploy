# HƯỚNG DẪN TỪNG BƯỚC ĐẨY MÃ NGUỒN LÊN GITHUB VÀ TRIỂN KHAI VERCEL

> **Dành cho:** Chủ dự án (kể cả người không chuyên về lập trình)  
> **Sản phẩm:** Pixel Trading Agent (v1.0.0)  
> **Nguyên tắc:** Làm đúng theo từng bước hướng dẫn bằng hình ảnh và thao tác chuột dưới đây. Tuyệt đối không cần gõ lệnh phức tạp.

---

## 🚀 PHẦN 1: TẠO KHO CHỨA TRÊN GITHUB (TRÌNH DUYỆT WEB)

### Bước 1.1: Đăng nhập GitHub
1. Mở trình duyệt web truy cập: [https://github.com](https://github.com).
2. Đăng nhập vào tài khoản GitHub cá nhân của bạn (nếu chưa có, bấm *Sign up* để đăng ký miễn phí).

### Bước 1.2: Tạo Repository mới
1. Ở góc trên cùng bên phải màn hình GitHub, bấm vào biểu tượng dấu cộng **`+`** → Chọn **New repository**.
2. Điền các thông tin:
   - **Repository name:** Điền tên `pixel-trading-agent` (hoặc tên tùy ý bạn thích).
   - **Description:** `Hệ thống AI Agent phân tích giao dịch chứng khoán phong cách Pixel Art`.
   - **Visibility:** Chọn **Public** (hoặc **Private** tùy bạn muốn công khai hay giữ kín).
   - **LƯU Ý CỰC KỲ QUAN TRỌNG:**
     - **KHÔNG** tích chọn *"Add a README file"*.
     - **KHÔNG** tích chọn *"Add .gitignore"*.
     - **KHÔNG** chọn license.  
     *(Vì dự án đã có sẵn toàn bộ các tệp này chuẩn chỉ 100%)*.
3. Bấm nút màu xanh lá cây: **Create repository**.
4. Màn hình sẽ chuyển sang trang hướng dẫn có đường link kho chứa của bạn, dạng:  
   `https://github.com/<ten-tai-khoan-cua-ban>/pixel-trading-agent.git`  
   *(Hãy giữ nguyên tab này để lấy link)*.

---

## 💻 PHẦN 2: ĐẨY TOÀN BỘ MÃ NGUỒN LÊN GITHUB (TỪ MÁY TÍNH)

### Bước 2.1: Mở Command Prompt tại thư mục dự án
1. Mở thư mục dự án trên máy tính:
   `c:\Users\ADMIN\Downloads\Antigravity_IDE\pixel-trading-agent`
2. Nhấp chuột vào thanh địa chỉ của File Explorer (nơi hiện đường dẫn thư mục), gõ chữ **`cmd`** rồi nhấn **Enter**.
3. Cửa sổ Command Prompt màu đen sẽ hiện ra ngay tại thư mục này.

### Bước 2.2: Chạy kiểm tra an toàn trước khi đẩy
Gõ lệnh sau và nhấn Enter:
```cmd
npm run predeploy
```
*Đợi khoảng 20 giây để hệ thống chạy 9 bước kiểm tra an toàn. Khi màn hình hiện thông báo:*  
**"🎉 KẾT LUẬN: SẴN SÀNG ĐẨY LÊN GIT!"**  
*thì bạn tiến hành bước tiếp theo.*

### Bước 2.3: Đẩy mã nguồn lên GitHub bằng 5 dòng lệnh
*(Sao chép từng dòng một, dán vào cửa sổ cmd và nhấn Enter)*:

```cmd
git init
git add .
git commit -m "P7: Release v1.0.0 Pixel Trading Agent"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan-cua-ban>/pixel-trading-agent.git
git push -u origin main
```
*(Thay `<ten-tai-khoan-cua-ban>` bằng tên tài khoản GitHub thật của bạn đã lấy ở Bước 1.2).*

> **Mẹo:** Nếu máy tính yêu cầu đăng nhập GitHub, một cửa sổ trình duyệt sẽ bật lên, bạn chỉ cần bấm **Sign in with your browser** và nhấn **Authorize GitCredentialManager** là xong!

Quay lại trang GitHub trên trình duyệt bấm F5: Toàn bộ mã nguồn của bạn đã nằm gọn gàng trên GitHub!

---

## ☁️ PHẦN 3: KẾT NỐI VÀ TRIỂN KHAI LÊN VERCEL (HOÀN TOÀN TỰ ĐỘNG)

### Bước 3.1: Đăng nhập Vercel
1. Mở trình duyệt truy cập: [https://vercel.com](https://vercel.com).
2. Bấm **Log In** → Chọn **Continue with GitHub** (đăng nhập bằng tài khoản GitHub vừa đẩy mã ở Phần 2).

### Bước 3.2: Nhập dự án từ GitHub (Import Project)
1. Tại trang chủ Vercel (Dashboard), bấm nút **Add New...** ở góc phải → Chọn **Project**.
2. Ở danh sách *"Import Git Repository"*, bạn sẽ thấy dự án `pixel-trading-agent` vừa tạo. Bấm nút **Import** bên cạnh tên dự án.

### Bước 3.3: Điền Khóa Bí Mật AI (Environment Variables)
Tại màn hình *"Configure Project"*:
- **Project Name:** Giữ nguyên `pixel-trading-agent`.
- **Framework Preset:** Vercel sẽ tự động nhận diện là **Vite**.
- **Root Directory:** Giữ nguyên `./`.
- Cuộn xuống tìm mục **Environment Variables** (Biến môi trường) và bấm mở rộng ra:
  
  Thêm từng biến một bằng cách điền **Key** và **Value**, sau đó bấm nút **Add**:

  | Key | Value | Ý nghĩa |
  |---|---|---|
  | `GEMINI_API_KEY_1` | `AIzaSy...` *(Khóa Gemini số 1 của bạn)* | Khóa API chính để gọi AI |
  | `GEMINI_API_KEY_2` | `AIzaSy...` *(Khóa Gemini số 2 của bạn)* | Khóa API dự phòng tự xoay vòng |
  | `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Model Gemini chính thức tối ưu tốc độ |
  | `GEMINI_MODEL_FALLBACK` | `gemini-3.8-flash` | Model Gemini dự phòng |
  | `GEMINI_THINKING_LEVEL` | `minimal` | Mức suy nghĩ tối ưu cho tác vụ nhanh |
  | `GEMINI_THINKING_LEVEL_REPORT` | `low` | Mức suy nghĩ cho báo cáo chi tiết |

*(Nếu bạn chưa có sẵn khóa API ngay bây giờ, bạn có thể bỏ qua bước điền khóa này, ứng dụng vẫn hoạt động 100% bình thường ở chế độ Dự phòng Fallback! Bạn có thể thêm khóa vào sau bất cứ lúc nào trong mục Settings của Vercel).*

### Bước 3.4: Bấm Triển khai (Deploy)
1. Bấm nút màu xanh biển lớn: **Deploy**.
2. Màn hình Vercel sẽ hiện hiệu ứng pháo hoa chúc mừng sau khoảng 1 phút xây dựng!
3. Bấm vào nút **Continue to Dashboard** hoặc nhấp trực tiếp vào hình ảnh trang web để truy cập đường link chính thức của bạn, có dạng:  
   `https://pixel-trading-agent-xxxx.vercel.app`

---

## 🔒 BẢO MẬT TUYỆT ĐỐI
- Khóa API của bạn được lưu an toàn tuyệt đối trên máy chủ Vercel (mã hóa chuẩn AES-256).
- Người dùng, Thầy/Cô chấm thi hoặc bất kỳ ai dùng web đều **hoàn toàn không thể xem hoặc đánh cắp khóa API** của bạn.
- Bất cứ khi nào bạn cập nhật code trên máy và chạy `git push`, Vercel sẽ tự động cập nhật bản mới lên trang web trong vòng 60 giây!

