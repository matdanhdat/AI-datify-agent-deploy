# PROJECT_STATE.md — Trạng thái thực tế của codebase

*Tài liệu lập ngày 19/11/2026 dựa hoàn toàn trên việc đọc mã nguồn hiện tại và kết quả chạy thử trực tiếp tại `c:\Users\ADMIN\Downloads\Antigravity_IDE\pixel-trading-agent` (không dựa trên giả định, không in nội dung `.env` / `.env.local`).*

**Quy ước nhãn kiểm chứng trong tài liệu:**
- **[ĐÃ CHẠY THỬ XÁC NHẬN]**: đã thực thi lệnh, test, benchmark hoặc trình duyệt Chrome thật trên codebase hiện tại.
- **[CHỈ ĐỌC CODE]**: xác nhận qua đọc tệp mã nguồn/cấu hình, chưa chạy riêng lẻ trực tiếp từng nhánh UI.

---

## 1. Cây thư mục và vai trò từng file chính

*(Đã quét trực tiếp cây thư mục thực tế, loại trừ `node_modules/`, `dist/`, `deploy-package/`.)*

```text
pixel-trading-agent/
├── api/                          # Vercel Serverless Functions (Node/Web Fetch API, 2 endpoint)
│   ├── ai.ts                     # Endpoint POST /api/ai (cổng AI duy nhất cho 6 tác vụ)
│   ├── health.ts                 # Endpoint GET /api/health (kiểm tra trạng thái AI, không lộ khóa)
│   └── _lib/
│       ├── env.ts                # Đọc biến môi trường server-side (chỉ chạy trên Node/Vercel)
│       ├── limits.ts             # Giới hạn payload (64 KB), rate limit, timeout theo từng tác vụ AI
│       ├── tasks.ts              # Định nghĩa prompt & schema cho 6 tác vụ AI
│       ├── gemini.ts             # Gọi Gemini REST API, xoay 2 khóa, fallback 2 model, thinkingLevel
│       ├── handler.ts            # Xử lý HTTP request/response, chuẩn hóa lỗi, ẩn khóa API
│       └── *.test.ts             # 4 bộ test gateway (handler, gemini_thinking, ping_repro, taskPayloadAudit)
├── src/
│   ├── main.tsx, App.tsx, router.tsx  # Khởi tạo React, ErrorBoundary, Toast, 9 route & RouteGuard
│   ├── pages/
│   │   ├── HomePage.tsx          # Trang chủ giới thiệu quy trình 5 bước
│   │   ├── UploadPage.tsx        # Bước 1: Form ngữ cảnh + nạp CSV/XLSX (Chứng khoán & Kinh doanh)
│   │   ├── CleanPage.tsx         # Bước 2: Hồ sơ lỗi, đề xuất làm sạch & Cổng duyệt 1
│   │   ├── AnalyzePage.tsx       # Bước 3: Phân tích định lượng (Chứng khoán + Kinh doanh) & nhận định AI
│   │   ├── ReportPage.tsx        # Bước 4: Báo cáo tổng hợp, Cổng duyệt 2, in PDF / xuất Excel (Trading)
│   │   ├── AgentPage.tsx         # Tiến trình Agent (khung ILC) & nhật ký kiểm toán phiên
│   │   ├── HistoryPage.tsx       # Lịch sử phiên trong bộ nhớ tab hiện tại
│   │   ├── ConfigPage.tsx        # Chẩn đoán kết nối AI, thông số cấu hình
│   │   └── UiLibraryPage.tsx     # Thư viện component Pixel UI & bảng màu
│   ├── core/                     # Logic nghiệp vụ thuần TypeScript (không gọi mạng, không dùng storage)
│   │   ├── schemas.ts            # Hợp đồng Zod (Dataset, CleanArtifact, AnalysisResult, ReportArtifact, Plan...)
│   │   ├── state.ts              # Máy trạng thái phiên & điều kiện mở khóa route
│   │   ├── artifacts.ts, audit.ts, hash.ts, errors.ts, businessTable.ts, dataset.ts
│   │   ├── aiTaskSchemas.ts      # Zod input/output cho 6 tác vụ AI (gồm business_insights)
│   │   ├── validator/            # Đọc CSV/XLSX, dò header, kiểm định Trading (55 TC) & Business
│   │   ├── cleaner/              # Làm sạch Trading (pipeline.ts) & Business (businessCleaner.ts)
│   │   ├── metrics/
│   │   │   ├── calculator.ts     # Tính chỉ số Trading (tối ưu single-pass & TypedArray)
│   │   │   ├── charts.ts         # Sinh ChartSpec cho Trading
│   │   │   ├── businessAnalyzer.ts # Động cơ phân tích Kinh doanh O(n), 4 chiều + 4 ChartSpec
│   │   │   └── math.ts, metricSpec.ts, canonicalAnalysisHash.ts
│   │   ├── narrative/
│   │   │   ├── factsBuilder.ts   # Tạo FactsTable < 4 KB, gói nhãn [DATA:...], SHA-256
│   │   │   ├── businessInsights.ts # Kiểm chứng số hậu-AI cho kinh doanh + fallback theo mẫu
│   │   │   └── check.ts, forbidden.ts, templates.ts (kiểm chứng nhận định Trading)
│   │   ├── chat/                 # Bộ lọc chống chèn lệnh (guard.ts), ngữ cảnh chỉ-đọc (context.ts)
│   │   ├── context/              # Chuẩn hóa ngữ cảnh doanh nghiệp & gợi ý câu hỏi (U2)
│   │   └── plan/                 # 13 thao tác định lượng tùy chỉnh cho Trading (runner, validate, ops/)
│   ├── workers/
│   │   ├── workerRunner.ts       # Trình gọi Web Worker có Watchdog (15s im lặng / 30s trần cứng)
│   │   ├── validate.worker.ts    # Worker kiểm định tệp
│   │   ├── clean.worker.ts       # Worker làm sạch dữ liệu
│   │   ├── analysis.worker.ts    # Worker phân tích Trading & Business
│   │   └── plan.worker.ts, calc.worker.ts
│   ├── services/                 # Điều phối phiên trong RAM, gọi Worker, gọi /api/ai, xuất Excel
│   │   ├── sessionStore.ts, sessionService.ts, readers.ts, appConfig.ts
│   │   ├── uploadService.ts, cleanService.ts, analysisService.ts, reportService.ts
│   │   ├── aiClient.ts           # Client gọi /api/health & /api/ai (AbortController <= 25s)
│   │   ├── exportExcel.ts        # Xuất workbook 7 sheet có công thức sống (hiện cho Trading)
│   │   └── planService.ts, demoAnalysis.ts
│   ├── agent/
│   │   ├── businessInsightsAgent.ts # Gọi AI business_insights bất đồng bộ, cache, góp ý Cổng 2
│   │   ├── narrator.ts           # Gọi AI write_report cho Trading
│   │   ├── cleaningExplainer.ts  # Giải thích đề xuất làm sạch
│   │   └── chat.ts               # Trợ lý chat chỉ-đọc
│   ├── components/               # charts/ (PixelChart, buildOption), config/, layout/, pixel/, plan/, report/
│   └── utils/                    # format.ts (cache Intl), navigation.ts, readToken.ts
├── public/samples/               # Tệp mẫu phục vụ trực tiếp trên web (Trading, Business, 55 TC)
├── samples/                      # Bộ dữ liệu thử nghiệm gốc (gồm samples/business/du-lieu-test-ban-le.csv)
├── scripts/                      # 30 script kiểm thử, benchmark, ui:audit, e2e, predeploy, release
├── docs/                         # Đặc tả, bảng chứng, mốc baseline, ảnh chụp kiểm chứng (screens/)
├── deploy-package/               # Bản đóng gói sạch sẵn sàng đẩy Git/Vercel (đã bỏ node_modules/dist/.env*)
├── vercel.json                   # Cấu hình framework Vite, rewrites /api/* & SPA, maxDuration: 60
├── vite.config.ts                # Cấu hình Vite + plugin giả lập /api/health, /api/ai cục bộ + Vitest
├── package.json, package-lock.json, tsconfig.json, start.bat, start.sh, .env.example, .gitignore
```

---

## 2. Tech stack, thư viện và phiên bản

*(Đọc trực tiếp từ [package.json](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/package.json) và kiểm tra runtime qua `node -v`, `npm -v`.)*

- **Môi trường đã chạy thử:** Node.js **`v20.18.0`** (yêu cầu `>=20.0.0`), npm **`10.8.2`**, Windows (PowerShell), Chrome headless cục bộ.
- **Kiến trúc:** Browser-first SPA (100% tính toán dữ liệu trong trình duyệt bằng Web Workers, trạng thái chỉ lưu trong RAM tab, không dùng `localStorage`/`sessionStorage`/`IndexedDB`) + 2 Serverless Functions trên Vercel (`api/ai.ts`, `api/health.ts`) gọi Google Gemini REST API.
- **Dependencies chính (`package.json`):**
  - `react` `^18.3.1`, `react-dom` `^18.3.1`, `react-router-dom` `^6.28.0`
  - `echarts` `^5.5.1` (biểu đồ SVG/Canvas)
  - `exceljs` `^4.4.0` (đọc/xuất `.xlsx` dynamic import)
  - `fflate` `^0.8.3` (giải nén kiểm tra zip bomb `.xlsx`)
  - `zod` `^3.23.8` (kiểm định schema đầu vào/đầu ra)
  - Font cục bộ: `@fontsource/be-vietnam-pro`, `@fontsource/pixelify-sans`, `@fontsource/press-start-2p`, `@fontsource/silkscreen`, `@fontsource/vt323` (`^5.3.0`)
- **DevDependencies:**
  - `typescript` `^5.6.3`, `vite` `^5.4.11` (cài thực tế `5.4.21`), `@vitejs/plugin-react` `^4.3.4`
  - `vitest` `^2.1.8` (cài thực tế `2.1.9`), `jsdom` `^24.1.3`, `@testing-library/react` `^16.1.0`

---

## 3. Cách cài đặt, chạy và biến môi trường

### Cài đặt & khởi chạy

| Mục đích | Lệnh | Ghi chú |
|---|---|---|
| Cài thư viện đúng lockfile | `npm ci` | **[ĐÃ CHẠY THỬ XÁC NHẬN]** trong `deploy-package/`: 367 packages, 7s |
| Chạy dev cục bộ (có giả lập `/api/*`) | `npm run dev` (cổng `5173`) | **[CHỈ ĐỌC CODE]** `vite.config.ts` tự nạp `.env.local` & giả lập `/api/ai`, `/api/health` |
| Khởi chạy nhanh cho người dùng | `npm start` hoặc bấm đúp `start.bat` (Win) / `start.sh` (Unix) | **[CHỈ ĐỌC CODE]** `scripts/start_local.mjs` tự tìm cổng từ `8000` |
| Build production | `npm run build` (`tsc && vite build`) | **[ĐÃ CHẠY THỬ XÁC NHẬN]** xanh, 0 lỗi TS, `dist/` = 6,58 MB (110 tệp) |
| Chạy toàn bộ unit/integration test | `npm test` (`vitest run`) | **[ĐÃ CHẠY THỬ XÁC NHẬN]** 54/54 tệp, 395/395 test PASS |
| Kiểm tra tổng trước khi đẩy Git | `npm run predeploy` | **[ĐÃ CHẠY THỬ XÁC NHẬN]** 9/9 hạng mục PASS (gồm `tsc`, `check:secrets`, `vitest`, `ui:audit`, `evidence`) |
| Kiểm thử E2E + chụp 12 màn hình | `npm run e2e` | **[ĐÃ CHẠY THỬ XÁC NHẬN]** 2/2 test + 12/12 ảnh SHA-256 duy nhất |
| Benchmark phân tích kinh doanh | `npm run bench:analyze` | **[ĐÃ CHẠY THỬ XÁC NHẬN]** 48 dòng `14,81 ms`, 1k dòng `9,35 ms`, 50k dòng `34,50 ms` |

### Biến môi trường cần có (chỉ liệt kê tên biến — đọc từ [api/_lib/env.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/api/_lib/env.ts), [src/services/appConfig.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/services/appConfig.ts), [.env.example](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/.env.example))

- **Server-side (Node cục bộ qua `.env.local` hoặc Vercel Environment Variables; tuyệt đối không gắn tiền tố `VITE_`):**
  - `GEMINI_API_KEY_1` (tùy chọn; thiếu cả 2 khóa thì hệ thống tự chạy chế độ dự phòng bằng mẫu, không lỗi/treo)
  - `GEMINI_API_KEY_2` (tùy chọn; khóa dự phòng xoay vòng khi khóa 1 lỗi 429/timeout)
  - `GEMINI_MODEL` (mặc định `gemini-3.5-flash-lite`)
  - `GEMINI_MODEL_FALLBACK` (mặc định `gemini-3.8-flash`)
  - `GEMINI_THINKING_LEVEL` (mặc định `minimal` cho tác vụ nhanh, gồm `business_insights`)
  - `GEMINI_THINKING_LEVEL_REPORT` (mặc định `low` cho `write_report`)
- **Client-side (tùy chọn):**
  - `VITE_DISABLE_M3_ANALYSIS` (đặt `1` để tắt nhanh động cơ phân tích kinh doanh M3 và quay lui; cũng hỗ trợ query `?legacyAnalyze=1`)

---

## 4. Tính năng ĐÃ CHẠY ĐƯỢC vs lỗi / chưa làm

### Đã chạy được và xác nhận

1. **Toàn bộ chuỗi Trading (Chứng khoán OHLCV):** Nạp CSV/XLSX (55 test-case hợp lệ/từ chối) → Làm sạch + Cổng duyệt 1 → Phân tích chỉ số & biểu đồ (50k dòng chạy `610,1 ms`) → Nhận định AI / mẫu + Cổng duyệt 2 → Xuất Excel 7 sheet có công thức sống (`exportExcel.ts`) → Trợ lý chat chỉ-đọc (35 ca chống chèn lệnh) → Quy trình riêng 13 thao tác (`planService.ts`) → Nhật ký kiểm toán & chuỗi băm SHA-256. **[ĐÃ CHẠY THỬ XÁC NHẬN]** qua `npm test` (395/395 PASS), `npm run predeploy` (9/9 PASS), `npm run e2e` (2/2 + 12/12 ảnh).
2. **Chuỗi Kinh doanh (Business — `du-lieu-test-ban-le.csv`):**
   - Form ngữ cảnh doanh nghiệp + gợi ý câu hỏi bấm được + ô mô hình hoạt động 2.000 ký tự (`UploadPage.tsx`). **[ĐÃ CHẠY THỬ XÁC NHẬN]** qua unit test & `ui:audit`.
   - Nạp & kiểm định bảng kinh doanh (`validator/business.ts`) + làm sạch & Cổng duyệt 1 (`businessCleaner.ts`) ra đúng **48 dòng sạch**. **[ĐÃ CHẠY THỬ XÁC NHẬN]** trong `businessAnalyzer.test.ts` và trên Chrome thật.
   - Bước 3 Phân tích kinh doanh $O(n)$ (`businessAnalyzer.ts` + `analysis.worker.ts` + Watchdog 15s/30s): khớp 100% toàn bộ đáp án chuẩn A6 (tổng doanh thu `1.135.530.000 VND`, lợi nhuận `531.850.000 VND`, biên `46,84%`, `3.342` đơn, AOV `339.775,58 VND`, 3 kênh, 4 tháng, 4 khu vực, 5 sản phẩm), hiển thị 4 biểu đồ trục VND gọn (`0, 100 tr, 200 tr, …`). **[ĐÃ CHẠY THỬ XÁC NHẬN]** qua `businessAnalyzer.test.ts`, `npm run bench:analyze` (`14,81 ms` cho 48 dòng; `34,50 ms` cho 50.000 dòng) và Chrome thật (`codeReadyMs = 167–168 ms`).
   - Bước 3B & Bước 4 Nhận định AI kinh doanh bất đồng bộ (`business_insights`) + kiểm chứng số hậu-AI + nút bằng chứng `[F1..Fn]` bấm soi sự kiện + Cổng duyệt 2 (Phê duyệt / Nhập góp ý quay lại Bước 3 giữ nguyên số liệu) + In/Xuất PDF (`window.print()`). **[ĐÃ CHẠY THỬ XÁC NHẬN]** trên Chrome thật với Gemini live (`AI: 8.723 ms`, tổng `13.827 ms`, huy hiệu `NHẬN ĐỊNH AI (KIỂM CHỨNG SỐ)`, chụp ảnh `docs/screens/M3B/`) và ở chế độ fallback không có khóa (`167 ms`, huy hiệu `NHẬN ĐỊNH TỰ ĐỘNG THEO MẪU`).
3. **Trang Tiến trình Agent (`/tien-trinh`), Lịch sử (`/lich-su`), Cấu hình (`/cau-hinh`), Thư viện UI (`/thu-vien-giao-dien`) & 4 viewport audit:** **[ĐÃ CHẠY THỬ XÁC NHẬN]** qua `npm run ui:audit` (36/36 PASS) và `npm run e2e` (12/12 ảnh).
4. **Gói phát hành sạch `deploy-package/`:** 550 tệp, 0 tệp cấm, 0 chuỗi khóa bí mật; chạy `npm ci` + `npm run build` + `npm test` (395/395 PASS) không cần `.env.local`. **[ĐÃ CHẠY THỬ XÁC NHẬN]**.

### Tính năng chưa làm / mới chỉ hỗ trợ nhánh Chứng khoán (Trading)

1. **Xuất file Excel (`.xlsx`) riêng cho Báo cáo Kinh doanh:** **[CHỈ ĐỌC CODE]** — [ReportPage.tsx](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/pages/ReportPage.tsx#L379-L384) ở nhánh kinh doanh hiện chỉ có nút `In / Xuất PDF` (`window.print()`) và tải ảnh PNG từng biểu đồ; [exportExcel.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/services/exportExcel.ts#L64-L80) được viết cho cấu trúc Trading OHLCV (`analysis.config.symbols`, 7 sheet chứng khoán), chưa có nhánh xuất workbook kinh doanh.
2. **Quy trình phân tích riêng (`Custom Plan` — 13 thao tác):** **[CHỈ ĐỌC CODE]** — [planService.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/services/planService.ts#L33-L40) và `src/core/plan/` hiện chỉ phục vụ bộ dữ liệu chứng khoán OHLCV (`Dataset`), chưa gắn vào `BusinessTable`.
3. **Trợ lý chat chỉ-đọc hiểu sâu bảng chiều kinh doanh:** **[CHỈ ĐỌC CODE]** — [src/core/chat/context.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/core/chat/context.ts#L18-L77) chủ yếu đọc `metrics[]` và bảng thuật ngữ chứng khoán (`METRIC_DEFINITIONS`), chưa đưa toàn bộ `by_channel`/`by_month`/`by_region`/`by_product` của kinh doanh vào ngữ cảnh chat.

---

## 5. Danh sách lỗi / cảnh báo hiện có (kèm log nguyên văn và file/dòng liên quan)

**Lỗi làm hỏng build hoặc test:** **0 lỗi** (`tsc --noEmit` exit `0`, `npm test` 54/54 tệp 395/395 test PASS, `npm run predeploy` 9/9 PASS, `npm run e2e` PASS).

**Các lỗi nhỏ / cảnh báo thực tế ghi nhận được khi chạy thử:**

1. **Upstream Gemini thỉnh thoảng trả `502 LLM_UPSTREAM_ERROR` ở lần gọi đầu tiên trước khi thành công ở lần thử lại / xoay khóa:** **[ĐÃ CHẠY THỬ XÁC NHẬN]**
   - Log nguyên văn khi chạy Chrome thật cho `business_insights` và `npm run e2e` cho `write_report`:
     ```text
     [AI Gateway] Task: business_insights | Status: 502 | Error: LLM_UPSTREAM_ERROR
     [AI Gateway] Task: business_insights | Key Slot: 1 | Model: gemini-3.5-flash-lite | Status: 200 | Latency: 8719ms | Thinking: minimal (thoughts: 0 tokens) | Output: 974 tokens
     [AI Gateway] Task: write_report | Status: 502 | Error: LLM_UPSTREAM_ERROR
     [AI Gateway] Task: write_report | Key Slot: 1 | Model: gemini-3.5-flash-lite | Status: 200 | Latency: 4425ms | Thinking: low (thoughts: 0 tokens) | Output: 1489 tokens
     ```
   - File liên quan: [api/_lib/gemini.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/api/_lib/gemini.ts#L52-L70), [api/_lib/handler.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/api/_lib/handler.ts), [src/agent/businessInsightsAgent.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/agent/businessInsightsAgent.ts#L240-L280) (đã có retry 1 lần và fallback mẫu nên không treo, nhưng cộng thêm ~5s khi xảy ra).

2. **Cảnh báo kích thước chunk > 500 kB khi chạy `vite build`:** **[ĐÃ CHẠY THỬ XÁC NHẬN]**
   - Log nguyên văn từ `npm run build`:
     ```text
     dist/assets/excel-engine-B5U9YJAX.js                               938.75 kB │ gzip: 271.10 kB
     dist/assets/BusinessInsightsPanel-BHZb2FQl.js                    1,198.00 kB │ gzip: 389.69 kB

     (!) Some chunks are larger than 500 kB after minification. Consider:
     - Using dynamic import() to code-split the application
     - Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
     ```
   - File liên quan: [vite.config.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/vite.config.ts#L158-L171) (chưa tách `echarts` vào `manualChunks` nên gom vào chunk dùng chung `BusinessInsightsPanel`).

3. **Tên tệp trên Topbar chưa cập nhật ngay khi dùng query demo `?sample=business`:** **[ĐÃ CHẠY THỬ XÁC NHẬN]** (quan sát trực tiếp trên ảnh chụp `docs/screens/M3B/02_m3b_business_insights_1366x768.png` hiển thị `Tệp: file-mau-chuan.xlsx` cho tới khi chuyển trang sang `/bao-cao`).
   - Nguyên nhân (đọc code): [src/pages/AnalyzePage.tsx](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/pages/AnalyzePage.tsx#L150-L156) ghi `rec.meta.dataset = valRes.meta; sessionStore.setRecord(rec);` nhưng chưa gọi `refreshSession()` ngay sau đó (chỉ ảnh hưởng đường dẫn demo `?sample=business`, luồng upload thật không bị).

4. **Cảnh báo JSDOM / React Router v6 trong output `vitest` (không làm fail test):** **[ĐÃ CHẠY THỬ XÁC NHẬN]**
   - Log nguyên văn khi chạy `npm test`:
     ```text
     ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7.
     Error: Not implemented: HTMLCanvasElement.prototype.getContext (without installing the canvas npm package)
     ```
   - File liên quan: [src/components/charts/PixelChart.tsx](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/components/charts/PixelChart.tsx#L41-L46) (đã bọc `try/catch` nên JSDOM bỏ qua an toàn), các test dùng `MemoryRouter` không bật `future` flags của React Router v6.

5. **Cảnh báo `npm audit` khi cài mới trong `deploy-package/`:** **[ĐÃ CHẠY THỬ XÁC NHẬN]**
   - Log nguyên văn từ `npm ci`:
     ```text
     12 vulnerabilities (8 moderate, 2 high, 2 critical)
     ```
   - Nguyên nhân (đọc log deprecation): các phụ thuộc bắc cầu của `exceljs` (`fstream`, `glob@7`, `rimraf@2`, `inflight`).

---

## 6. Vấn đề đang xử lý dở

**Hiện tại không có tác vụ hay lỗi nào đang bị treo hoặc làm dở trong chuỗi M3.** Chuỗi M3-A → M3-B → M3-C đã hoàn tất đầy đủ và qua toàn bộ 4 cổng kiểm thử (`npm test`, `npm run predeploy`, `npm run ui:audit`, `npm run e2e`).

---

## 7. Việc tồn đọng (Backlog ưu tiên cho giai đoạn sau)

1. **Đẩy Git và Deploy lên Vercel (việc của chủ dự án):** Thư mục [deploy-package/](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/deploy-package) và hướng dẫn [deploy-package/DEPLOY.md](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/deploy-package/DEPLOY.md) đã sẵn sàng; cần chủ dự án tự `git push`, nạp biến môi trường Gemini trên Vercel và chạy danh sách kiểm tra sau deploy (chú ý giới hạn 10s của gói Vercel Hobby nếu chưa bật Fluid Compute).
2. **Bổ sung xuất Excel (`.xlsx`) riêng cho Báo cáo Kinh doanh:** Mở rộng [exportExcel.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/services/exportExcel.ts) và gắn nút tải `.xlsx` trong nhánh Business của [ReportPage.tsx](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/pages/ReportPage.tsx).
3. **Tách chunk `echarts` trong [vite.config.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/vite.config.ts):** Thêm `if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'charts-engine';` để xử lý cảnh báo chunk > 500 kB khi build.
4. **Sửa lỗi hiển thị tên tệp nhỏ ở chế độ demo `?sample=business`:** Gọi `refreshSession()` sau dòng 155 tại [AnalyzePage.tsx](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/pages/AnalyzePage.tsx#L150-L156).
5. **Mở rộng Trợ lý chat chỉ-đọc & Quy trình riêng cho dữ liệu Kinh doanh:** Bổ sung `business_analysis` vào [src/core/chat/context.ts](file:///c:/Users/ADMIN/Downloads/Antigravity_IDE/pixel-trading-agent/src/core/chat/context.ts) và thiết kế bộ thao tác tùy chỉnh cho `BusinessTable` nếu cần dùng cho bảo vệ/thực tế.
6. **Rà soát 12 cảnh báo `npm audit`** liên quan phụ thuộc bắc cầu của `exceljs` khi có kế hoạch nâng cấp thư viện.
