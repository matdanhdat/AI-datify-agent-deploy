# BASELINE BEFORE M3 (Mốc Đối Chiếu Chống Hồi Quy)

- **Thời điểm ghi nhận:** 2026-11-18 (ngay trước khi triển khai chuỗi M3-A → M3-B → M3-C)
- **Bản sao lưu đầy đủ mã nguồn (loại trừ `.env*`, `node_modules`, `dist`):** `../backup-before-M3/` (do máy cục bộ không có `git` trong PATH nên dùng sao lưu thư mục đầy đủ theo quy định).
- **Công tắc hoàn tác nhanh (Feature Flag):** `VITE_DISABLE_M3_ANALYSIS=1` (hoặc `?legacyAnalyze=1`) trong `src/services/appConfig.ts` để quay về hành vi cũ ngay lập tức nếu cần.

---

## 1. Kết quả 4 lệnh kiểm thử tại mốc Baseline (trước M3)

| Lệnh kiểm thử | Kết quả Baseline | Số lượng đạt / hỏng | Ghi chú lỗi sẵn có trước M3 |
| :--- | :---: | :--- | :--- |
| `npm test` | **XANH** | 52/52 file test, **385/385 test PASS** (0 fail) | Không có test đỏ sẵn |
| `npm run predeploy` | **XANH** | **9/9 mục ĐẠT** (`tsc` 0 lỗi, `check:secrets` 108 tệp sạch, `dist` 6,50 MB) | Không có mục đỏ sẵn |
| `npm run ui:audit` | **XANH** | **36/36 lượt ĐẠT** (4 viewport × 9 trang, 0 lỗi render, 0 chuỗi rác) | Không có lỗi sẵn |
| `npm run e2e` | **XANH** | **2/2 test E2E + 12/12 ảnh FINAL** mã băm SHA-256 độc nhất | Không có lỗi sẵn |

---

## 2. Mốc hành vi các bước lân cận (không được phá vỡ)

- **Bước 1 — Nạp dữ liệu (`/nap-du-lieu`, `UploadPage.tsx`):**
  - Form bối cảnh D3/U2 (`extra_info` tối đa 2.000 ký tự, bộ đếm ký tự/từ, cảnh báo < 40 ký tự, tab gợi ý Kinh doanh/Giao dịch/Chung, tối đa 8 câu hỏi).
  - Nạp file CSV/XLSX trong Web Worker, lưu dữ liệu gốc (`raw`) bất biến trong `ArtifactStore`, hỗ trợ nhận diện cả Trading (`RawDataset`) và Business (`BusinessTable`).
- **Bước 2 — Làm sạch & Cổng duyệt 1 (`/lam-sach`, `CleanPage.tsx`):**
  - Hỗ trợ cả Trading (6 đề xuất) và Business (E1: 5 thao tác chuẩn `remove_blank_rows`, `trim_whitespace`, `drop_exact_duplicates`, `fill_blank_dimension_label`, `sort_natural`; 15/15 test `businessCleaner.test.ts` + `cleanService.test.ts` xanh).
  - Watchdog 15s không nhịp tim / 30s trần tối đa. Duyệt Cổng 1 tạo `clean_v1` kèm `clean_hash` SHA-256 bất biến và nhật ký `clean_approved`.
- **Bước 4 — Báo cáo & Cổng duyệt 2 (`/bao-cao`, `ReportPage.tsx`):**
  - Trading: hiển thị 8 thẻ KPI, 12 biểu đồ ECharts, nhận định AI có kiểm chứng số học + fallback mẫu, Cổng duyệt 2 ghi `report_hash` + nhật ký `report_approved`, xuất Excel 7 sheet và in PDF.
  - Business (trước M3): đang bị chặn bởi Soft Gate `"ĐANG HOÀN THIỆN TÍNH NĂNG"` tại `AnalyzePage.tsx` và `ReportPage.tsx`.

---

## 3. Kiểm kê người gọi của các file dùng chung trước khi mở rộng (chỉ thêm, không đổi chữ ký cũ)

| File dùng chung | Các module đang gọi (`grep`) | Cam kết tương thích |
| :--- | :--- | :--- |
| `src/core/schemas.ts` | Toàn bộ `src/` và `api/` | Chỉ thêm trường tùy chọn (`kind?`, `business_analysis?`, `business_insights?`, `feedback_history?`) |
| `src/workers/workerRunner.ts` | `analysisService.ts`, `planService.ts` | Chỉ thêm tham số tùy chọn (`inactivityTimeoutMs?`, `hardTimeoutMs?`, `diagnosticMeta?`) |
| `src/services/analysisService.ts` | `AnalyzePage.tsx`, `ReportPage.tsx`, `e2e_flow.test.ts` | Giữ nguyên chữ ký `runAnalysis`, `getAvailableDatasetMeta`, `getAnalysisResult` |
| `src/services/aiClient.ts` | `chat.ts`, `cleaningExplainer.ts`, `narrator.ts`, `planService.ts`, `ConfigPage.tsx`, tests | Giữ nguyên chữ ký `callAi(task, input, signal?)`, sửa lỗi kết hợp `AbortSignal` + giới hạn timeout ≤ 25s |
| `src/core/aiTaskSchemas.ts` & `api/_lib/tasks.ts` | `handler.ts`, `planService.ts`, `taskPayloadAudit.test.ts` | Giữ nguyên 5 tác vụ cũ; chỉ thêm tác vụ mới `business_insights` |
