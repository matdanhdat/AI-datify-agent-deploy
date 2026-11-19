# KIẾN TRÚC HỆ THỐNG VÀ MA TRẬN TRUY VẾT BẢO MẬT (TRACEABILITY MATRIX)

> **Dự án:** Pixel Trading Agent (v1.0.0)  
> **Mục đích:** Chứng minh tính chặt chẽ của 7 Luật bất biến thông qua ma trận truy vết từ Đặc tả → Cơ chế kiến trúc → Tệp mã nguồn → Bộ bài kiểm thử tự động.

---

## 1. TỔNG QUAN KIẾN TRÚC BROWSER-FIRST + VERCEL GATEWAY

```
+-----------------------------------------------------------------------------------+
|                            TRÌNH DUYỆT (BROWSER CLIENT)                            |
|                                                                                   |
|  [Tab Memory / In-Memory State]                                                   |
|   ├── sessionStore: Máy trạng thái hữu hạn (FSM) - Quản lý phiên làm việc        |
|   └── ArtifactStore: Lưu trữ dữ liệu lớn (Raw -> Clean -> Metrics -> Report)     |
|                                                                                   |
|  [Giao diện Pixel Art (React 18 + TypeScript)]                                     |
|   ├── RouteGuard: Bảo vệ điều hướng không cho phép vượt cổng trái phép            |
|   ├── ExcelCard & PixelChart: Biểu đồ và Thẻ KPI chuẩn mực kiểu Microsoft Excel   |
|   ├── ChatDock: Trợ lý chat chỉ-đọc (Read-only AST boundary)                     |
|   └── CustomWorkflowSection: Thực thi quy trình riêng (Allowlist ops only)        |
|                                                                                   |
|  [Hạ tầng tính toán Web Workers]                                                  |
|   ├── validate.worker: Parser nhị phân Excel/CSV, đối soát cấu trúc 6 bước       |
|   ├── clean.worker: Thuật toán ngoại lai MAD log-return, tính Canonical SHA-256  |
|   ├── analysis.worker: Động cơ toán học thuần (17 chỉ số độc lập, zero AI)       |
|   └── plan.worker: Thực thi kế hoạch phân tích riêng từ tập 13 toán tử tĩnh       |
+-----------------------------------------+-----------------------------------------+
                                          |
                      (HTTPS / REST / Tóm tắt số liệu)
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        CỔNG AI SERVERLESS (VERCEL GATEWAY)                        |
|                                                                                   |
|  /api/health: Báo cáo trạng thái cổng, số lượng khóa và mô hình khả dụng          |
|  /api/ai: Cổng trung gian gọi Google Gemini API an toàn                           |
|   ├── Key Rotator: Quản lý 2 slot khóa API, tự động làm mát (cooldown) khi gặp 429|
|   ├── Rate Limiter: Giới hạn 20 req/phút và 300 req/giờ theo IP                   |
|   ├── Schema Guard: Thẩm định nghiêm ngặt payload đầu vào/đầu ra qua Zod           |
|   └── Thinking Level Optimizer: Tối ưu mức suy nghĩ (minimal/low) giảm trễ        |
+-----------------------------------------+-----------------------------------------+
                                          |
                               (Google Gemini API)
                                          v
                               [Google Cloud AI Platform]
```

---

## 2. MA TRẬN TRUY VẾT 7 LUẬT BẤT BIẾN (TRACEABILITY MATRIX)

| # | Luật bất biến | Cơ chế kiến trúc thực thi | Tệp mã nguồn triển khai | Ca kiểm thử tự động xác minh |
|---|---|---|---|---|
| **1** | **AI không tính số** | Toàn bộ 17 chỉ số độc lập và biểu đồ được tính toán bằng các hàm toán học thuần túy (Welford, Welford sample variance, Wilder's RSI, MDD) trong Web Worker. AI chỉ nhận số liệu đã tính để diễn giải văn bản. Động cơ `checkParagraph` đối chiếu mọi con số trong bài viết của AI với danh sách số hợp lệ (dung sai tương đối $10^{-4}$). | `src/core/metrics/calculator.ts`<br>`src/core/metrics/math.ts`<br>`src/core/narrative/check.ts` | `src/core/metrics/metrics.test.ts`<br>`src/core/narrative/narrative.test.ts`<br>`src/tests/e2e_flow.test.ts` |
| **2** | **Hai cổng duyệt bắt buộc của con người** | Máy trạng thái hữu hạn (FSM) quản lý tiến trình nghiêm ngặt: `uploaded` → `cleaning_review` → `clean_approved` (Cổng 1) → `analyzed` → `report_approved` (Cổng 2). `RouteGuard` chặn mọi hành vi truy cập trang tiếp theo nếu cổng trước chưa được duyệt. Nút xuất file Excel/PDF bị khóa cứng cho tới khi Cổng 2 được phê duyệt. | `src/core/state.ts`<br>`src/components/layout/RouteGuard.tsx`<br>`src/services/cleanService.ts`<br>`src/services/reportService.ts` | `src/core/state.test.ts`<br>`src/components/layout/RouteGuard.test.tsx`<br>`src/services/reportService.test.ts`<br>`src/tests/chaos.test.ts` |
| **3** | **Trợ lý chat chỉ-đọc (Read-only)** | Ranh giới kiến trúc cấp mô-đun: Trợ lý Chat chỉ được phép import các hàm từ `src/services/readers.ts` (các hàm chỉ đọc từ `ArtifactStore`). Kiểm thử AST quét cây cú pháp đảm bảo không có import từ `sessionStore.ts` hay các hàm biến đổi dữ liệu. Bộ lọc Guard chặn 35 câu lệnh cố tình tấn công sửa dữ liệu/phê duyệt cổng. | `src/services/readers.ts`<br>`src/agent/chat.ts`<br>`src/core/chat/guard.ts`<br>`src/components/layout/ChatDock.tsx` | `src/core/architecture.test.ts`<br>`src/agent/chat.test.ts`<br>`src/tests/e2e_flow.test.ts` |
| **4** | **Từ chối sớm, nói rõ lý do** | Bộ thẩm định dữ liệu 6 bước (S1-S6) kiểm tra tính hợp lệ của tệp nhị phân ngay tại Web Worker: kiểm tra dung lượng (<= 5MB), số dòng (<= 50.000), cấu trúc cột bắt buộc, kiểu dữ liệu số, tính rõ ràng của định dạng ngày và số phiên tối thiểu. Khi phát hiện lỗi, trả về mã lỗi chuẩn và thông điệp tiếng Việt dễ hiểu kèm chỉ dẫn khắc phục. | `src/core/validator/index.ts`<br>`src/core/validator/header.ts`<br>`src/core/validator/messagesVi.ts`<br>`src/services/uploadService.ts` | `src/core/validator/validator.test.ts`<br>(Bao phủ 34 test cases từ MANIFEST.json) |
| **5** | **Luôn có chế độ dự phòng (Fallback)** | Khi hệ thống chưa được cấu hình khóa API, gặp lỗi mạng, lỗi timeout hoặc lỗi hạn mức HTTP 429/503 từ Google Gemini, hệ thống tự động kích hoạt bộ sinh nhận định dự phòng (`generateFallbackNarrative`). Các đoạn văn dự phòng được điền số liệu từ kết quả phân tích định lượng, đảm bảo kiểm chứng số học đạt 100% mà không phụ thuộc vào kết nối mạng. | `src/core/narrative/templates.ts`<br>`src/agent/narrator.ts`<br>`api/_lib/gemini.ts` | `src/core/narrative/narrative.test.ts`<br>`api/_lib/handler.test.ts`<br>`api/_lib/gemini_thinking.test.ts` |
| **6** | **Khóa API chỉ nằm ở Vercel Gateway** | Khóa API được lưu trữ trong biến môi trường Node.js trên Vercel. Mã nguồn client tuyệt đối không import hay tham chiếu tới `process.env.GEMINI_API_KEY_*`. Giao tiếp giữa Client và Gateway không bao giờ truyền khóa. Bộ kiểm tra bảo mật tự động quét toàn bộ thư mục `dist/` trước khi triển khai để đảm bảo không rò rỉ khóa bí mật. | `api/_lib/gemini.ts`<br>`api/_lib/env.ts`<br>`scripts/check_no_secrets.mjs` | `api/_lib/handler.test.ts`<br>`scripts/check_no_secrets.mjs`<br>`src/core/audit.test.ts` |
| **7** | **Không chạy mã do AI sinh ra (Zero Eval)** | Không sử dụng `eval()`, `new Function()`, hay bất kỳ cơ chế chạy mã động nào. AI chỉ được đề xuất một danh sách các bước từ tập hợp **13 toán tử đại số chuỗi thời gian cố định** (`src/core/plan/ops/`). Trình thẩm định `validatePlan` từ chối các tham số tùy tiện như `expr`. Tiêu đề kế hoạch được sinh hoàn toàn bằng code (`derivePlanTitle`) để triệt tiêu nguy cơ tiêm nhiễm mã độc (Prompt Injection). | `src/core/plan/validate.ts`<br>`src/core/plan/runner.ts`<br>`src/core/plan/ops/*`<br>`src/services/planService.ts` | `src/core/plan/plan.test.ts`<br>`src/services/planService.test.ts`<br>`src/tests/e2e_flow.test.ts` |

---

## 3. BẢO MẬT CHỐNG CÁC DẠNG TẤN CÔNG THỰC TẾ

### 3.1 Tấn công chèn công thức vào tệp bảng tính (CSV/Excel Formula Injection)
- **Rủi ro:** Kẻ tấn công đặt tên mã cổ phiếu hoặc dữ liệu bắt đầu bằng `=cmd|' /C calc'!A0` nhằm ép phần mềm Excel trên máy nạn nhân thực thi mã độc.
- **Biện pháp phòng vệ:** Hàm `sanitizeFormulaString` tự động kiểm tra và thêm ký tự nháy đơn `'` trước các ký tự `=`, `+`, `-`, `@`.
- **Kiểm chứng:** `src/services/exportExcel.test.ts` (test case `sanitizes formula injection prefixes correctly`).

### 3.2 Tấn công làm cạn kiệt tài nguyên (Denial of Service - DoS)
- **Rủi ro:** Tải lên tệp quá lớn gây sập bộ nhớ trình duyệt hoặc gửi hàng loạt yêu cầu gọi AI làm cạn kiệt quota API.
- **Biện pháp phòng vệ:**
  - Giới hạn tệp: Tối đa 5 MB và tối đa 50.000 dòng.
  - Bộ đệm điều tiết yêu cầu Chat (Chat Rate Limiter): Chặn các yêu cầu liên tiếp dưới 2000 ms.
  - Gateway Rate Limiter: Tối đa 20 yêu cầu/phút và 300 yêu cầu/giờ theo IP.

### 3.3 Tấn công Jailbreak & Vượt quyền (Prompt Injection & State Tampering)
- **Rủi ro:** Người dùng ra lệnh cho Chatbot hoặc nhập yêu cầu phân tích riêng nhằm vượt qua 2 Cổng duyệt hoặc thay đổi số liệu trong báo cáo.
- **Biện pháp phòng vệ:**
  - `guard.ts`: Bộ lọc từ khóa độc hại phát hiện 35 mẫu câu tấn công (phân loại thành `mutation`, `gate_bypass`, `code_execution`, `external_data`, `system_prompt_leak`).
  - `derivePlanTitle`: Triệt tiêu chuỗi do AI tự bịa, chỉ dùng chuỗi do code tính toán.
  - `architecture.test.ts`: Đảm bảo về mặt tĩnh rằng module Chat không có quyền ghi.

