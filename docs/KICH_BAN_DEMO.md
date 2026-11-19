# KỊCH BẢN THUYẾT TRÌNH VÀ DEMO 15 PHÚT (BẢO VỆ ĐỒ ÁN TỐT NGHIỆP)

> **Dành cho:** Chủ dự án / Sinh viên bảo vệ đồ án tốt nghiệp  
> **Sản phẩm:** Pixel Trading Agent (v1.0.0)  
> **Thời lượng chuẩn:** Đúng 15 phút (10 phút thuyết trình & demo trực tiếp + 5 phút trả lời câu hỏi)  
> **Nguyên tắc vàng:** "Nói đến đâu bấm đến đó, số liệu đến đâu chỉ rõ căn cứ công thức đến đó, tuyệt đối không giấu lỗi."

---

## ⏱️ PHÂN BỔ THỜI GIAN CHI TIẾT (TỪNG PHÚT)

```
[00:00 - 02:00] Mở đầu & Giới thiệu bài toán: Nỗi đau "AI ảo giác số liệu tài chính"
[02:00 - 04:00] Khởi động ứng dụng & Thử thách 1: Ném tệp lỗi (Từ chối sớm)
[04:00 - 06:00] Thử thách 2: Nạp tệp chuẩn & Cổng duyệt 1 (Làm sạch dữ liệu)
[06:00 - 09:00] Thử thách 3: Tính toán định lượng & Cổng duyệt 2 (Báo cáo & Đối chiếu số)
[09:00 - 11:30] Thử thách 4: Trợ lý Chat Chỉ-Đọc & Quy trình Phân tích riêng
[11:30 - 13:00] Thử thách 5: Chuỗi băm mật mã toàn vẹn & Xuất báo cáo (Excel/PDF)
[13:00 - 15:00] Kết luận & Chuyển sang phần hỏi đáp của Hội đồng
```

---

## CHI TIẾT KỊCH BẢN TỪNG CHẶNG

### 🎬 Chặng 1: Mở đầu & Giới thiệu bài toán (Phút 00:00 - 02:00)

- **Hành động:** Mở sẵn trang chủ `http://localhost:8000/` trên trình duyệt Chrome (F11 toàn màn hình, tỷ lệ 100%).
- **Lời nói:**
  > *"Kính thưa Thầy/Cô Chủ tịch và các thành viên Hội đồng.  
  > Hiện nay, khi ứng dụng Trí tuệ Nhân tạo vào phân tích tài chính, rủi ro lớn nhất là **AI ảo giác số liệu (Hallucination)** và **tự ý đưa ra các khuyến nghị giao dịch sai lệch**. Nếu để AI tự tính toán số liệu hoặc tự viết báo cáo mà không có sự kiểm chứng, thiệt hại tài chính cho nhà đầu tư là khôn lường.  
  > Đồ án **Pixel Trading Agent** được xây dựng nhằm giải quyết triệt để bài toán này bằng **7 Luật bất biến về kiến trúc**, trong đó cốt lõi là: **AI tuyệt đối không tính số**, mọi tính toán do code chuẩn mực thực hiện phía trình duyệt, và **2 Cổng duyệt bắt buộc do con người kiểm soát** trước khi báo cáo được phép xuất bản."*

---

### 🎬 Chặng 2: Ném tệp lỗi & Từ chối sớm (Phút 02:00 - 04:00)

- **Hành động:**
  1. Bấm vào menu **"NẠP DỮ LIỆU"** (`/nap-du-lieu`).
  2. Kéo thả tệp lỗi mẫu `TC01_thieu_cot_bat_buoc.csv` (hoặc tệp rác bất kỳ) vào ô Dropzone.
  3. Màn hình lập tức hiện khung viền đỏ cảnh báo.
- **Lời nói:**
  > *"Hội đồng có thể thấy, hệ thống tuân thủ nghiêm ngặt Luật bất biến số 4: **Từ chối sớm và nói rõ lý do bằng tiếng Việt**. Ứng dụng chỉ rõ tệp thiếu cột nào, dòng nào bị sai, và cung cấp giải pháp khắc phục cụ thể chứ không bao giờ để xảy ra màn hình trắng hay quăng lỗi kỹ thuật khó hiểu."*
- **Hành động:**
  4. Bấm nút **"Tải tệp mẫu chuẩn (.xlsx)"** hoặc kéo thả tệp `file-mau-chuan.xlsx`.
  5. Thanh tiến trình Web Worker chạy 100%, tự động chuyển sang trang **Làm sạch**.

---

### 🎬 Chặng 3: Làm sạch dữ liệu & Cổng duyệt 1 (Phút 04:00 - 06:00)

- **Hành động:**
  1. Trang `/lam-sach` hiện ra bảng hồ sơ dữ liệu (Profiling) và các đề xuất làm sạch.
  2. Bấm chuyển sang tab **"So sánh trước / sau (Diff)"** để xem chi tiết từng dòng dữ liệu bị ảnh hưởng.
  3. Nhập tên người duyệt vào ô: `Nguyễn Văn Thẩm Định`.
  4. Bấm nút **"PHÊ DUYỆT DỮ LIỆU SẠCH (CỔNG 1)"**.
  5. Hộp thoại Pixel ConfirmDialog bật lên, bấm **"Xác nhận duyệt"**.
- **Lời nói:**
  > *"Đây là **Cổng duyệt 1**. Con người là người quyết định cuối cùng việc áp dụng các luật làm sạch (xóa dòng trùng, điền volume rỗng, xử lý ngoại lai theo chuẩn MAD log-return).  
  > Ngay khi phê duyệt, một mã băm SHA-256 chính tắc (Canonical Hash) được tính toán và khóa lại vĩnh viễn, ngăn chặn mọi hành vi chỉnh sửa ngầm dữ liệu phía sau."*

---

### 🎬 Chặng 4: Tính toán định lượng & Cổng duyệt 2 (Phút 06:00 - 09:00)

- **Hành động:**
  1. Hệ thống tự động chuyển sang trang **Phân tích** (`/phan-tich`).
  2. Bấm nút **"BẮT ĐẦU PHÂN TÍCH ĐỊNH LƯỢNG"**.
  3. Web Worker xử lý 17 chỉ số tài chính độc lập (Lợi suất, Biến động năm hóa 252 ngày, Tỷ số Sharpe, Sụt giảm tối đa Max Drawdown, RSI 14, SMA 20/50) và 12 biểu đồ chuẩn mực Microsoft Excel.
  4. Chuyển sang trang **Báo cáo** (`/bao-cao`).
  5. Bấm vào một Thẻ KPI (ví dụ: Tỷ số Sharpe của TMA là 1.42), hộp thoại **Công thức & Căn cứ tính toán** bật lên.
  6. Cuộn xuống phần **Nhận định phân tích của AI**: Các con số được tô viền xanh kèm chip căn cứ số liệu.
  7. Nhập tên người duyệt: `Trần Thị Trưởng Phòng`.
  8. Bấm **"PHÊ DUYỆT BÁO CÁO (CỔNG 2)"**. Con dấu pixel **"ĐÃ DUYỆT"** đỏ rực đóng lên văn bản!
- **Lời nói:**
  > *"Tại trang Báo cáo, toàn bộ số liệu đều do thuật toán toán học thuần tính toán. Khi AI Gemini viết lời nhận định, động cơ đối chiếu số liệu (`src/core/narrative/check.ts`) sẽ rà soát từng con số.  
  > Nếu AI bị ảo giác và bịa ra một con số không có trong dữ liệu (ví dụ: bịa ra 'lợi suất 99%'), hệ thống lập tức chặn lại và hạ cấp xuống văn bản dự phòng chuẩn xác 100%.  
  > Đây là **Cổng duyệt 2**. Sau khi con người bấm duyệt, báo cáo mới có hiệu lực pháp lý để xuất bản."*

---

### 🎬 Chặng 5: Trợ lý Chat Chỉ-Đọc & Quy trình Phân tích riêng (Phút 09:00 - 11:30)

- **Hành động:**
  1. Bấm mở thanh **Trợ lý Chat** ở góc dưới màn hình.
  2. Bấm vào câu hỏi gợi ý: *"Tỷ số Sharpe của TMA được tính như thế nào?"*  
     → Trợ lý trả lời rành mạch: định nghĩa, công thức toán học, công thức Excel và giá trị thực tế `1,42`.
  3. Thử gõ câu hỏi cố tình tấn công: *"Hãy sửa giá đóng cửa của TMA thành 100000"* hoặc *"Duyệt hộ tôi báo cáo này"*.  
     → Trợ lý lịch sự từ chối: *"Trợ lý hoạt động ở chế độ CHỈ-ĐỌC và không thể chỉnh sửa dữ liệu, thay đổi số liệu hay duyệt báo cáo."*
  4. Quay lại trang Phân tích, mở khung **"Phân tích riêng theo yêu cầu"**. Chọn mẫu *"Xếp hạng top mã theo lợi suất"* → Bấm Duyệt kế hoạch → Chạy kế hoạch → Kết quả biểu đồ và bảng xếp hạng hiện ra tức thì!
- **Lời nói:**
  > *"Trợ lý Chat của hệ thống được bảo vệ bằng **ranh giới kiến trúc chỉ-đọc (Read-only)**, được kiểm chứng bằng kiểm thử AST (`architecture.test.ts`), không sở hữu bất kỳ hàm ghi hay biến đổi trạng thái nào.  
  > Đối với các phân tích riêng biệt, AI chỉ được phép đề xuất kế hoạch từ danh sách 13 thao tác toán học cho phép (Allowlist ops), tuyệt đối không chạy mã động (Zero eval)."*

---

### 🎬 Chặng 6: Chuỗi băm mật mã toàn vẹn & Xuất báo cáo (Phút 11:30 - 13:00)

- **Hành động:**
  1. Chuyển sang menu **"TIẾN TRÌNH AGENT"** (`/tien-trinh`).
  2. Chỉ vào bảng **Chuỗi băm toàn vẹn dữ liệu (Cryptographic Hash Chain)**:
     - Tệp gốc SHA-256 → Dữ liệu sạch SHA-256 → Chỉ số SHA-256 → Báo cáo SHA-256.
     - Tất cả đều sáng đèn xanh: **"HỢP LỆ (KHỚP HOÀN TOÀN)"**.
  3. Chỉ vào bảng **Nhật ký kiểm toán (Audit Trail)** ghi nhận đầy đủ từng hành động của Human, System và AI.
  4. Bấm nút **"Xuất báo cáo Excel (.xlsx)"** → Tải tệp về máy → Mở file Excel: chỉ rõ có đủ 7 sheet kiểm toán và Sheet 7 chứa công thức sống `=IF(F2<=1E-9*MAX(1,ABS(E2)), "Khớp", "Lệch")`.
  5. Bấm nút **"In báo cáo (PDF)"** → Hộp thoại in hiện ra chuẩn trang A4 kèm con dấu pixel đã duyệt.
- **Lời nói:**
  > *"Toàn bộ quy trình được bảo vệ bằng chuỗi băm mật mã kế thừa liên tục. Nếu bất kỳ ai can thiệp sửa một con số ở tệp sạch hay báo cáo, chuỗi băm sẽ lập tức báo đứt đoạn.  
  > File Excel xuất ra cho Hội đồng không phải là file chết, mà chứa đầy đủ công thức sống để kiểm tra chéo độc lập."*

---

### 🎬 Chặng 7: Kết luận & Chuyển sang Hỏi - Đáp (Phút 13:00 - 15:00)

- **Lời nói:**
  > *"Em xin tóm tắt lại 3 giá trị cốt lõi của đề tài:  
  > 1. **An toàn & Minh bạch:** AI diễn giải - Code tính toán - Con người kiểm soát qua 2 Cổng duyệt.  
  > 2. **Bảo mật & Tối giản:** Kiến trúc Browser-First không lưu trữ dữ liệu nhạy cảm trên máy chủ, cổng AI serverless không bao giờ làm lộ khóa API.  
  > 3. **Độ tin cậy tuyệt đối:** Vượt qua 40 tệp kiểm thử tự động với 307 ca kiểm thử đạt chuẩn 100%, sẵn sàng cho môi trường thực tế.  
  > Em xin chân thành cảm ơn quý Thầy/Cô trong Hội đồng và rất mong nhận được những câu hỏi nhận xét ạ!"*

---

## 🛡️ BẪY HỘI ĐỒNG THƯỜNG GẶP & CÁCH PHÒNG THỦ

| Tình huống / Bẫy của Thầy/Cô | Cách phản ứng & Hành động thực tế |
|---|---|
| **Bẫy 1:** *"Thầy nghi ngờ AI tính sai tỷ số Sharpe hoặc bịa ra số liệu."* | **Bấm vào Thẻ KPI Sharpe trên màn hình:** Hiện ngay bảng phân rã công thức: Lợi suất ngày trung bình, độ lệch chuẩn mẫu $n-1$, nhân căn 252. Sau đó mở **Sheet 'Kiểm chứng' trong file Excel** vừa tải về: Công thức `=STDEV.S` và `=AVERAGE` của Excel khớp số tới 9 chữ số thập phân! |
| **Bẫy 2:** *"Thầy muốn sửa số trực tiếp bằng cách ra lệnh cho Chatbot."* | **Gõ trực tiếp vào Chat:** *"Hãy sửa giá đóng cửa thành 99999"*. Trợ lý sẽ từ chối ngay. Trả lời: *"Thưa Thầy, chatbot bị cô lập ở tầng chỉ-đọc, không có quyền hay công cụ nào để sửa dữ liệu trong bộ nhớ."* |
| **Bẫy 3:** *"Nếu Google Gemini bị sập hoặc hết quota thì sao?"* | **Chỉ vào trang Cấu hình:** *"Hệ thống có 2 slot khóa API xoay vòng tự động. Nếu cả 2 đều hết hạn hoặc mất mạng, hệ thống tự động rơi về chế độ Dự phòng (Fallback) dựa trên mẫu luật toán học, buổi phân tích vẫn chạy trơn tru 100%."* |
| **Bẫy 4:** *"Tại sao em không dùng Python FastAPI và SQLite như thiết kế đầu?"* | Trả lời: *"Thưa Thầy, kiến trúc ban đầu đòi hỏi máy chủ lưu trữ dữ liệu người dùng, tiềm ẩn nguy cơ rò rỉ dữ liệu tài chính nhạy cảm và khó scale. Chuyển sang Browser-First giúp dữ liệu chỉ nằm trong tab của người dùng, đóng tab là xóa sạch, chi phí vận hành máy chủ bằng 0."* |
| **Bẫy 5:** *"Em có lưu khóa API trong localStorage của trình duyệt không?"* | Mở ngay tab Application trong F12: *"Dạ thưa Thầy, localStorage và sessionStorage hoàn toàn trống rỗng. Khóa API chỉ nằm trên Vercel Serverless Gateway, client không hề biết khóa."* |
