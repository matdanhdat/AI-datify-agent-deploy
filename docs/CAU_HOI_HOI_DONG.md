# BỘ CÂU HỎI VÀ TRẢ LỜI BẢO VỆ ĐỒ ÁN TRƯỚC HỘI ĐỒNG (25+ CÂU)

> **Tài liệu tham khảo phòng thủ đồ án:** Pixel Trading Agent (v1.0.0)  
> **Chủ đề:** Kiến trúc hệ thống, Toán tài chính, Bảo mật AI, Chuỗi băm toàn vẹn, Xử lý lỗi.

---

## PHẦN 1: KIẾN TRÚC HỆ THỐNG & CÔNG NGHỆ

### Câu 1: Tại sao đồ án lại chuyển từ Python FastAPI + SQLite sang kiến trúc "Browser-First + Vercel Serverless Gateway"?
**Trả lời:**  
1. **Bảo mật và riêng tư dữ liệu tài chính:** Dữ liệu giao dịch nội bộ của nhà đầu tư rất nhạy cảm. Với kiến trúc Browser-First, toàn bộ tệp và dữ liệu chỉ nằm trong bộ nhớ RAM của tab trình duyệt đang mở. Không có cơ sở dữ liệu trung gian, không ghi ra đĩa máy chủ. Khi người dùng đóng tab, dữ liệu biến mất hoàn toàn, không có nguy cơ rò rỉ cơ sở dữ liệu.
2. **Chi phí vận hành & Khả năng mở rộng:** Tính toán phân tích chạy bằng sức mạnh CPU của máy khách thông qua Web Worker. Máy chủ Vercel chỉ đóng vai trò phân phát mã tĩnh và proxy gọi Gemini an toàn, giúp chi phí máy chủ gần như bằng 0 và phục vụ hàng ngàn người dùng đồng thời mà không bị nghẽn CPU máy chủ.
3. **Độ trễ:** Tính toán 17 chỉ số và biểu đồ diễn ra ngay trong Web Worker phía trình duyệt (< 50ms cho 750 dòng dữ liệu), không mất thời gian truyền tải hàng chục megabyte dữ liệu qua mạng internet.

### Câu 2: Web Worker trong dự án hoạt động như thế nào? Tại sao cần Web Worker?
**Trả lời:**  
Trình duyệt chạy giao diện trên Main Thread. Nếu thực hiện các phép tính nặng như giải nén tệp Excel (.xlsx), tính ma trận tương quan, phát hiện ngoại lai (MAD) hay tính toán 17 chỉ số cho hàng chục ngàn dòng trên Main Thread thì giao diện sẽ bị đơ, giật hạt (UI freeze) và nút bấm không phản hồi.  
Dự án phân chia 4 Web Worker độc lập:
- `validate.worker.ts`: Phân tích cú pháp tệp nhị phân và kiểm tra quy tắc.
- `clean.worker.ts`: Chạy pipeline làm sạch, phát hiện ngoại lai và tính toán chuỗi băm.
- `analysis.worker.ts`: Tính toán chỉ số tài chính và dựng dữ liệu biểu đồ.
- `plan.worker.ts`: Thực thi các thao tác phân tích riêng dùng một lần.  
Nếu trình duyệt cũ không hỗ trợ Web Worker, hệ thống tự động fallback chạy đồng bộ trong luồng chính (`runInThreadCleanTask`) đảm bảo luôn hoạt động.

### Câu 3: Làm thế nào để cổng AI `/api/ai` bảo mật được khóa API mà người dùng không thể lấy trộm?
**Trả lời:**  
Khóa API `GEMINI_API_KEY_1` và `GEMINI_API_KEY_2` được lưu tại Environment Variables của Vercel Serverless Function (chạy trên Node.js runtime phía máy chủ).  
Phía frontend (Client) chỉ gửi các yêu cầu nghiệp vụ kèm số liệu tóm tắt (không gửi dữ liệu thô) lên `/api/ai`. Serverless Gateway gắn khóa API vào header và gọi Google Gemini, sau đó chỉ trả kết quả văn bản về cho Client. Trong toàn bộ bundle Javascript tải về máy người dùng (thư mục `dist/`), không chứa bất kỳ ký tự nào của khóa bí mật (được kiểm chứng tự động bởi `npm run check:secrets`).

### Câu 4: Cơ chế xoay vòng 2 slot khóa (Key Rotation) và chống nghẽn hoạt động ra sao?
**Trả lời:**  
Tại `api/_lib/gemini.ts`, hệ thống duy trì 2 slot khóa:
- Mặc định sử dụng Khóa 1.
- Nếu Khóa 1 bị lỗi hạn mức HTTP 429 (Too Many Requests), gateway tự động kích hoạt thời gian hạ nhiệt (cooldown 60 giây) cho Khóa 1 và tự động chuyển tiếp yêu cầu sang Khóa 2 ngay lập tức mà không làm gián đoạn trải nghiệm người dùng.
- Ngoài ra, hệ thống áp dụng giới hạn tần suất (Rate Limiting) tại gateway: tối đa 20 yêu cầu/phút và 300 yêu cầu/giờ trên mỗi địa chỉ IP.

---

## PHẦN 2: TOÁN HỌC & ĐỊNH LƯỢNG TÀI CHÍNH

### Câu 5: Công thức tính Lợi suất kỳ (Period Return) và tại sao chọn lợi suất đóng cửa đơn giản?
**Trả lời:**  
Lợi suất kỳ được tính theo công thức:
$$R_{period} = \frac{P_{end} - P_{start}}{P_{start}} = \frac{P_{end}}{P_{start}} - 1$$
Hệ thống sử dụng giá đóng cửa điều chỉnh (Close price). Trong tài chính thực nghiệm ngắn hạn, lợi suất đơn giản trực quan và dễ hiểu nhất đối với nhà đầu tư và tương thích hoàn toàn với công thức tính trong Microsoft Excel: `=(Close_Cuoi - Close_Dau) / Close_Dau`.

### Câu 6: Biến động năm hóa (Annualized Volatility) được tính như thế nào? Tại sao lại nhân căn bậc hai của 252?
**Trả lời:**  
Độ biến động ngày ($\sigma_{daily}$) là độ lệch chuẩn mẫu ($n-1$) của chuỗi lợi suất ngày:
$$s = \sqrt{\frac{1}{n-1} \sum_{i=1}^n (r_i - \bar{r})^2}$$
Một năm giao dịch chứng khoán tại Việt Nam (HOSE/HNX) và quốc tế có trung bình **252 phiên giao dịch** (đã trừ ngày nghỉ cuối tuần và ngày lễ).  
Theo giả định bước đi ngẫu nhiên (Random Walk) và phương sai tăng tuyến tính theo thời gian:
$$\sigma_{annual} = \sigma_{daily} \times \sqrt{252}$$
Công thức này khớp 100% với công thức Excel: `=STDEV.S(D3:D252)*SQRT(252)`.

### Câu 7: Tỷ số Sharpe được tính như thế nào và giả định lãi suất phi rủi ro ($R_f$) trong đồ án là bao nhiêu?
**Trả lời:**  
Tỷ số Sharpe đo lường phần bù lợi nhuận trên mỗi đơn vị rủi ro:
$$\text{Sharpe} = \frac{\bar{r}_{annual} - R_f}{\sigma_{annual}} = \frac{\bar{r}_{daily} \times 252 - R_f}{\sigma_{daily} \times \sqrt{252}} = \frac{\bar{r}_{daily}}{\sigma_{daily}} \times \sqrt{252} \quad (\text{khi } R_f = 0)$$
Trong đồ án, giả định mặc định $R_f = 0\%$ (lãi suất phi rủi ro danh nghĩa cơ sở). Hệ thống hiển thị rõ ràng giả định này trong thuyết minh phương pháp và ghi chú tính toán để tránh ngộ nhận.

### Câu 8: Mức sụt giảm tối đa (Maximum Drawdown - MDD) được tính ra sao?
**Trả lời:**  
MDD là mức giảm phần trăm lớn nhất từ một đỉnh cao nhất trong quá khứ ($Peak_t$) tới đáy thấp nhất sau đỉnh đó ($Trough$):
$$Peak_t = \max_{1 \le k \le t} (P_k)$$
$$Drawdown_t = \frac{P_t - Peak_t}{Peak_t}$$
$$\text{Max Drawdown} = \min_{1 \le t \le n} (Drawdown_t)$$
Giá trị MDD luôn là số âm (hoặc 0), thể hiện mức rủi ro thua lỗ nặng nề nhất mà một nhà đầu tư phải gánh chịu nếu mua đúng đỉnh và bán đúng đáy trong kỳ.

### Câu 9: Thuật toán Welford được áp dụng ở đâu và tại sao không dùng công thức phương sai thông thường?
**Trả lời:**  
Công thức tính phương sai truyền thống $\sum x^2 - (\sum x)^2 / n$ dễ bị hiện tượng **triệt tiêu thảm họa (Catastrophic Cancellation)** khi các giá trị $x$ rất lớn nhưng chênh lệch giữa chúng rất nhỏ, dẫn đến sai số dấu phẩy động trong máy tính hoặc phương sai ra số âm.  
Đồ án sử dụng thuật toán **Welford 1-pass** (`src/core/metrics/math.ts`), tính toán trung bình và phương sai dồn tích theo công thức cập nhật ổn định số học tuyệt đối, đã được kiểm nghiệm với độ lệch chuẩn mẫu $n-1$.

### Câu 10: Thuật toán phát hiện ngoại lai (Outliers) dựa trên MAD log-return là gì?
**Trả lời:**  
Phương pháp độ lệch chuẩn truyền thống ($\mu \pm 3\sigma$) rất nhạy cảm với các điểm cực trị (chính các điểm dị biệt làm méo mó trung bình $\mu$ và $\sigma$).  
Dự án sử dụng phương pháp thống kê vững (Robust Statistics) dựa trên **Độ lệch tuyệt đối trung vị (Median Absolute Deviation - MAD)** trên chuỗi lợi suất logarit ($r_t = \ln(P_t / P_{t-1})$):
$$MAD = \text{median}(|r_i - \text{median}(r)|)$$
$$z_{modified} = 0.6745 \times \frac{|r_i - \text{median}(r)|}{MAD}$$
Điểm dữ liệu bị gắn cờ dị biệt khi đồng thời thỏa mãn 2 điều kiện: $z_{modified} > 6.0$ và biên độ giá thay đổi vượt quá $10\%$ trong một phiên.

---

## PHẦN 3: BẢO MẬT & KIỂM SOÁT AI CHỐNG ẢO GIÁC

### Câu 11: Làm thế nào để đảm bảo "AI tuyệt đối không tính số"?
**Trả lời:**  
Được ngăn chặn bằng 3 tầng bảo vệ kiến trúc:
1. **Tách biệt vai trò:** Code TypeScript trong Web Worker tính toán toàn bộ số liệu và tạo ra cấu trúc `AnalysisResult`. AI không được giao công cụ tính toán và prompt hệ thống cấm ngặt việc tính toán lại.
2. **Động cơ đối chiếu số liệu (`src/core/narrative/check.ts`):** Rút trích toàn bộ các token số xuất hiện trong đoạn văn AI viết. Mỗi con số bắt buộc phải khớp với danh sách số liệu định lượng hợp lệ (Allowlist) với dung sai tương đối cực nhỏ ($10^{-4}$). Nếu AI tự ý bịa số, hệ thống sẽ gạch cờ `NOT_IN_DATA`.
3. **Cơ chế Fallback:** Nếu đoạn văn có số liệu sai không thể khắc phục sau 1 lần retry, hệ thống tự động thay thế bằng mẫu văn bản dự phòng được điền số liệu trực tiếp từ code.

### Câu 12: Tại sao Trợ lý Chat lại không thể bị Jailbreak để chỉnh sửa dữ liệu phiên?
**Trả lời:**  
1. **Ranh giới kiến trúc chỉ-đọc (Read-only AST):** Mô-đun Chat chỉ import các hàm từ `src/services/readers.ts` (các hàm chỉ đọc dữ liệu từ `ArtifactStore`). Không có bất kỳ hàm biến đổi trạng thái (`setRecord`, `put`, `approve`) nào được đưa vào không gian bộ nhớ của Chat.
2. **Kiểm thử AST tự động (`src/core/architecture.test.ts`):** Quét cây cú pháp của mã nguồn Chat để đảm bảo không vi phạm import.
3. **Bộ lọc tiền xử lý (Input Guard):** 35 mẫu câu tấn công độc hại (prompt injection, ép sửa giá, ép duyệt cổng) được phát hiện ngay lập tức và từ chối ở tầng client trước khi gửi yêu cầu tới AI.

### Câu 13: Quy trình Phân tích riêng (Custom Workflow) có an toàn không nếu AI tự sinh mã độc?
**Trả lời:**  
Hệ thống **tuyệt đối không chạy mã do AI sinh ra (Zero Eval / No Dynamic Code Execution)**.  
Khi người dùng yêu cầu một phân tích riêng, AI chỉ đóng vai trò phân tích ý định và trả về một cấu trúc JSON Kế hoạch (`Plan`) gồm tối đa 8 bước. Mỗi bước phải là một trong **13 thao tác toán học nằm trong danh sách trắng (Allowlist ops)** đã được lập trình sẵn trong `src/core/plan/ops/` (ví dụ: `rank_top_n`, `rolling_mean`, `filter_symbols`). Code runner của chúng ta chỉ đối chiếu tên hàm và thực thi mã tĩnh. Mọi tham số như `expr` hay hàm tùy biến đều bị từ chối ngay ở bước thẩm định `validatePlan`.

### Câu 14: Tại sao tiêu đề của Quy trình riêng phải do Code sinh ra (`derivePlanTitle`) chứ không dùng chuỗi do AI trả về?
**Trả lời:**  
Nếu dùng tiêu đề do AI trả về để hiển thị lên UI hoặc nhúng vào báo cáo xuất bản, kẻ tấn công có thể tiêm nhiễm các chuỗi tấn công (Prompt Injection) như chèn mã độc, câu từ thóa mạ hoặc giả mạo con dấu phê duyệt.  
Hàm `derivePlanTitle` trích xuất toán tử và tham số thực tế của kế hoạch (ví dụ: `op: 'rank_top_n', metric: 'period_return', n: 5`) và dịch thành chuỗi tiếng Việt chuẩn mực: *"Xếp hạng top 5 mã theo lợi suất kỳ"*. Điều này loại bỏ 100% rủi ro bị can thiệp câu chữ từ phía ngoài.

---

## PHẦN 4: TOÀN VẸN DỮ LIỆU & HAI CỔNG DUYỆT

### Câu 15: Chuỗi băm mật mã toàn vẹn (Cryptographic Hash Chain) hoạt động như thế nào?
**Trả lời:**  
Mỗi chặng dữ liệu đều sinh ra một mã băm SHA-256 chính tắc và gắn kết với nhau:
1. **Tệp gốc:** $H_1 = \text{SHA-256}(\text{Raw File Bytes})$.
2. **Dữ liệu sạch:** $H_2 = \text{SHA-256}(\text{Clean Dataset} + H_1 + \text{Decisions})$.
3. **Chỉ số định lượng:** $H_3 = \text{SHA-256}(\text{Canonical Metrics JSON} + H_2)$.
4. **Báo cáo hoàn chỉnh:** $H_4 = \text{SHA-256}(\text{Report Narrative} + H_3 + \text{Reviewer Name})$.  
Tại trang Tiến trình Agent (`/tien-trinh`), hệ thống đối chiếu lại chuỗi liên kết này theo thời gian thực. Nếu có bất kỳ sự thay đổi ngầm nào ở dữ liệu, chuỗi băm sẽ bị lệch và phát cảnh báo đỏ ngay lập tức.

### Câu 16: Tại sao hệ thống bắt buộc phải có 2 Cổng duyệt thay vì tự động chạy hết một mạch?
**Trả lời:**  
Trong quy trình phân tích tài chính chuyên nghiệp, máy móc chỉ là công cụ hỗ trợ, trách nhiệm pháp lý thuộc về chuyên viên phân tích:
- **Cổng duyệt 1:** Chuyên viên phải thẩm định chất lượng dữ liệu sạch trước khi bỏ tài nguyên tính toán các mô hình định lượng. Nếu dữ liệu rác mà vẫn tính toán thì kết quả phân tích sẽ là "Garbage In, Garbage Out".
- **Cổng duyệt 2:** Chuyên viên phải đọc hiểu và chịu trách nhiệm về nội dung nhận định của báo cáo trước khi ký số phát hành cho khách hàng hoặc nhà đầu tư.  
Hai cổng duyệt này được khóa cứng trong máy trạng thái (`src/core/state.ts`), người dùng không thể nhảy cóc qua URL nhờ các chốt chặn `RouteGuard`.

### Câu 17: Hệ thống chống tấn công chèn công thức Excel (Formula Injection) khi xuất file CSV và Excel như thế nào?
**Trả lời:**  
Khi xuất file CSV hoặc Excel, nếu ô dữ liệu chứa các ký tự bắt đầu bằng `=`, `+`, `-`, `@`, các ứng dụng như Excel có thể tự động thực thi các lệnh độc hại (DDE execution).  
Hàm `sanitizeFormulaString` (`src/services/exportExcel.ts`) tự động kiểm tra và thêm tiền tố nháy đơn `'` trước các ký tự nguy hiểm này, vô hiệu hóa việc thực thi lệnh tự động ngoài ý muốn nhưng vẫn giữ nguyên giá trị chuỗi hiển thị.

---

## PHẦN 5: CHẤT LƯỢNG MÃ NGUỒN & KIỂM THỬ

### Câu 18: Đồ án có bao nhiêu bài kiểm thử và tỷ lệ vượt qua là bao nhiêu?
**Trả lời:**  
Hệ thống sở hữu bộ kiểm thử tự động toàn diện được tích hợp với Vitest:
- **40 tệp kiểm thử tự động (Test Files).**
- **307 ca kiểm thử (Tests)** bao phủ toàn bộ các tầng: Toán học, Làm sạch, Parser Excel, Schemas, State Machine, Bảo mật AST, Cổng AI Gateway, Xử lý ngoại lệ, E2E và Chaos testing.
- **Tỷ lệ đạt chuẩn: 100% (ALL PASS)** trên cả Windows, Linux và môi trường Vercel.

### Câu 19: Làm sao chứng minh các chỉ số tính trong đồ án khớp với Microsoft Excel?
**Trả lời:**  
1. **Kiểm tra chéo độc lập:** Script `evidence_report.mjs` chạy các vòng lặp tính toán độc lập (không import mã sản xuất) và so sánh trực tiếp với kết quả Excel trên tệp chuẩn `file-mau-chuan.csv`. Chênh lệch giữa hai bên là `0.000000`.
2. **Sheet Kiểm chứng sống:** Trong file Excel tải về từ ứng dụng, Sheet 7 ("Kiểm chứng") chứa các công thức gốc của Excel (`=AVERAGE`, `=STDEV.S`, `=MIN`) và tự động kiểm tra dung sai bằng công thức:
   `=IF(F{r}<=1E-9*MAX(1,ABS(E{r})), "Khớp", "Lệch")`. Hội đồng có thể tự kiểm tra trực tiếp trên bất kỳ máy tính nào.

### Câu 20: Ứng dụng có thể chạy hoàn toàn Offline (không có Internet) được không?
**Trả lời:**  
**HOÀN TOÀN ĐƯỢC.**  
Toàn bộ logic nạp file, kiểm tra lỗi, làm sạch, tính toán định lượng 17 chỉ số, vẽ biểu đồ, chạy quy trình riêng, xuất file Excel và xuất PDF đều chạy 100% trong trình duyệt. Khi mất mạng, hệ thống tự động kích hoạt chế độ Fallback cho phần nhận định chữ dựa trên các mẫu luật toán học, đảm bảo buổi phân tích diễn ra bình thường mà không cần kết nối tới bất kỳ máy chủ nào.

