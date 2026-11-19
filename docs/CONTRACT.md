# HỢP ĐỒNG HỆ THỐNG VÀ KIẾN TRÚC DỮ LIỆU CHUNG (CONTRACT.md)

> **LƯU Ý QUAN TRỌNG:** Đây là hợp đồng nền tảng của dự án **Pixel Trading Agent**. Mọi prompt tiếp theo (P1 đến P7) PHẢI đọc và tuân thủ nghiêm ngặt các quy ước, cấu trúc và luật bất biến trong tài liệu này.
> **Quy tắc sửa đổi:** Tuyệt đối KHÔNG được đổi tên hoặc xóa các trường/hằng số đã có; chỉ được phép mở rộng hoặc bổ sung trường mới. Mọi bổ sung phải được ghi lại ở mục *9. Nhật ký thay đổi hợp đồng*.

---

## 1. Tóm tắt sản phẩm & 7 Luật bất biến

### 1.1 Bức tranh sản phẩm
**Pixel Trading Agent** là ứng dụng web phân tích dữ liệu giao dịch chứng khoán (giá và khối lượng) theo kiến trúc **Browser-First + Vercel Serverless Gateway**.
- **Xử lý phía Trình duyệt (Client-side):** Toàn bộ việc nạp file, kiểm tra định dạng, làm sạch dữ liệu, tính toán định lượng và trực quan hóa biểu đồ chạy trực tiếp trong bộ nhớ tab trình duyệt (hỗ trợ Web Worker cho tác vụ tính toán nặng). Dữ liệu tồn tại trong phiên làm việc của tab hiện tại, bảo mật và riêng tư, không lưu trữ đĩa hay database trung gian.
- **Cổng AI Serverless (Vercel):** Đóng vai trò proxy bảo mật gọi Google Gemini API mà không để lộ khóa API. Hỗ trợ cơ chế xoay vòng 2 slot khóa API (`GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`), giới hạn tải 64 KB, kiểm soát tần suất (20 req/phút, 300 req/giờ), và tự động chuyển sang chế độ dự phòng (fallback) khi chưa có khóa.
- **Giao diện:** Phong cách Pixel Art hoài cổ; riêng biểu đồ và bảng thẻ KPI trình bày chuẩn mực theo phong cách Microsoft Excel.
- **Luồng nghiệp vụ:**
  1. Nhập file Excel/CSV → Kiểm tra cấu hình và định dạng (sai thì từ chối sớm, nói rõ lý do).
  2. Làm sạch dữ liệu đề xuất → **[CỔNG DUYỆT 1: Người dùng phê duyệt]** → Lưu phiên bản sạch `clean_vN`.
  3. Tính toán các chỉ số định lượng thuần bằng code → Dựng biểu đồ và bảng KPI.
  4. AI viết nhận định phân tích (đã đối chiếu số) → **[CỔNG DUYỆT 2: Người dùng phê duyệt]** → Bản báo cáo hoàn chỉnh.
  5. Xuất bản và phân phối (xem trực tiếp trên web, tải PDF, Excel).

### 1.2 7 Luật bất biến (Đóng đinh vào kiến trúc)
1. **AI không tính số:** Toàn bộ con số, tỷ lệ, chỉ số tài chính do code TypeScript thuần tính toán (chạy phía client / Web Worker). AI chỉ diễn giải nhận định từ số đã có và lập kế hoạch từ danh sách thao tác cho phép.
2. **Hai cổng duyệt của con người là bắt buộc:**
   - **Cổng 1:** Phê duyệt dữ liệu đã làm sạch (`cleaning_review` → `clean_approved`).
   - **Cổng 2:** Phê duyệt báo cáo nhận định (`analyzed` → `report_approved`).
   - Không được duyệt thì không được chuyển bước tiếp theo, không được xuất bản. Máy trạng thái thực thi qua `requireState()`, bảo vệ điều hướng qua `RouteGuard`.
3. **Trợ lý chat chỉ-đọc (Read-only):** Được bảo vệ bằng ranh giới kiến trúc mã nguồn. Không cấp công cụ ghi hay quyền sửa đổi trạng thái cho chat.
4. **Từ chối sớm, nói rõ lý do:** Khi tệp dữ liệu hoặc yêu cầu sai cấu hình, từ chối ngay lập tức kèm thông điệp tiếng Việt rõ ràng, chỉ rõ dòng/cột/nguyên nhân và cách khắc phục.
5. **Luôn có chế độ dự phòng (Fallback):** Khi API AI bị gián đoạn, hết hạn mức hoặc chưa cấu hình khóa, hệ thống tự động chuyển sang chế độ fallback dựa trên mẫu luật có sẵn để buổi demo không bao giờ chết.
6. **Khóa API chỉ nằm ở Vercel Serverless Gateway (backend):** Tuyệt đối không gửi khóa API xuống frontend, không ghi vào log kiểm toán (audit log) hay bộ nhớ trình duyệt.
7. **Không chạy mã do AI sinh ra:** Chỉ thực thi các thao tác nằm trong danh sách trắng (allowlist) được định nghĩa trước.

---

## 2. Tên cột nội bộ (Internal Schema Keys)

Dùng thống nhất trong toàn bộ DataFrame của pandas và các đối tượng JSON. Không thay đổi ở bất kỳ prompt nào:

| Khóa nội bộ (`key`) | Nhãn tiếng Việt (`label_vi`) | Kiểu dữ liệu | Bắt buộc | Mô tả |
|---|---|---|---|---|
| `date` | Ngày | Chuỗi ISO 8601 / Date | **Có** | Ngày giao dịch (`YYYY-MM-DD`) |
| `symbol` | Mã | Chuỗi (String) | **Có** | Mã cổ phiếu (viết hoa, ví dụ: `TMA`) |
| `open` | Giá mở | Số thực (Float) | **Có** | Giá mở cửa phiên giao dịch |
| `high` | Giá cao | Số thực (Float) | **Có** | Giá cao nhất trong phiên |
| `low` | Giá thấp | Số thực (Float) | **Có** | Giá thấp nhất trong phiên |
| `close` | Giá đóng | Số thực (Float) | **Có** | Giá đóng cửa phiên giao dịch |
| `volume` | Khối lượng | Số nguyên (Integer/Float) | **Có** | Tổng khối lượng khớp lệnh |
| `trade_value` | Giá trị giao dịch | Số thực (Float) | Không | Tổng giá trị giao dịch (VND) |
| `sector` | Ngành | Chuỗi (String) | Không | Nhóm ngành của doanh nghiệp |
| `exchange` | Sàn | Chuỗi (String) | Không | Sàn niêm yết (`HOSE`, `HNX`, `UPCOM`) |

---

## 3. Các mô hình dữ liệu (Data Models)

### 3.1 Mô hình lỗi API thống nhất (`ErrorResponse`)
Mọi phản hồi lỗi từ backend đều tuân thủ cấu trúc:
```json
{
  "code": "STATE_INVALID",
  "message_vi": "Bạn cần duyệt dữ liệu sạch trước khi phân tích.",
  "details": {
    "current_state": "uploaded",
    "required_state": "clean_approved"
  }
}
```

### 3.2 `ValidationIssue` (Kiểm định dữ liệu)
```json
{
  "code": "DATA_BAD_NUMBER",
  "severity": "error",
  "sheet": "DuLieu",
  "row": 14,
  "column": "close",
  "value": "abc",
  "message_vi": "Giá đóng cửa không phải là số hợp lệ.",
  "fix_vi": "Vui lòng nhập số dương hoặc để trống nếu cho phép nội suy."
}
```

### 3.3 `Session` (Thực thể phiên làm việc)
```json
{
  "id": "7f8b9a12-34cd-56ef-a012-3456789abcde",
  "name": "Phân tích TMA tháng 11/2026",
  "state": "created",
  "created_at": "2026-11-13T08:30:00Z",
  "updated_at": "2026-11-13T08:30:00Z",
  "dataset": {
    "filename": "TMA_history.xlsx",
    "rows": 250,
    "symbols": ["TMA"],
    "date_from": "2025-11-01",
    "date_to": "2026-11-01"
  },
  "clean_version": null,
  "report_status": "none",
  "steps": [
    { "key": "upload", "label_vi": "Dữ liệu", "status": "current" },
    { "key": "clean", "label_vi": "Làm sạch", "status": "locked" },
    { "key": "review", "label_vi": "Duyệt", "status": "locked" },
    { "key": "analyze", "label_vi": "Phân tích", "status": "locked" },
    { "key": "report", "label_vi": "Báo cáo", "status": "locked" }
  ],
  "unlocked_pages": ["home", "upload", "agent", "history", "config"]
}
```

### 3.4 `Metric` (Chỉ số định lượng)
```json
{
  "id": "period_return",
  "label_vi": "Lợi suất cả kỳ",
  "symbol": "TMA",
  "value": 0.1234,
  "unit": "ratio",
  "status": "ok",
  "polarity": "higher_better",
  "formula_vi": "(Giá đóng cuối kỳ - Giá đóng đầu kỳ) / Giá đóng đầu kỳ",
  "inputs": ["close đầu kỳ", "close cuối kỳ"],
  "delta": {
    "value": 0.012,
    "label_vi": "so với kỳ trước"
  }
}
```

### 3.5 `ChartSpec` (Đặc tả biểu đồ)
Backend chỉ gửi dữ liệu số và metadata, frontend tự định kiểu cấu hình Apache ECharts:
```json
{
  "id": "chart_candle",
  "title_vi": "Diễn biến giá và khối lượng TMA",
  "kind": "candlestick_volume",
  "symbols": ["TMA"],
  "data": {
    "dates": ["2026-11-01", "2026-11-02"],
    "candles": [[100.0, 105.0, 99.0, 104.0]],
    "volumes": [1500000]
  },
  "table": {
    "columns": ["Ngày", "Mở", "Cao", "Thấp", "Đóng", "Khối lượng"],
    "rows": [["2026-11-01", 100.0, 105.0, 99.0, 104.0, 1500000]]
  }
}
```

### 3.6 `AuditEntry` (Nhật ký kiểm toán)
```json
{
  "id": 1,
  "ts": "2026-11-13T08:30:00Z",
  "step": "upload",
  "actor": "system",
  "action": "session:created",
  "detail": "Khởi tạo phiên làm việc mới",
  "data_hash": null
}
```

### 3.7 `AppConfig` (Cấu hình an toàn gửi cho Frontend)
```json
{
  "app_name": "Pixel Trading Agent",
  "llm_provider": "gemini",
  "llm_model": "gemini-2.0-flash",
  "llm_key_configured": false,
  "llm_key_slots": 0,
  "min_sessions": 30,
  "strict_mode": true,
  "trading_days": 252,
  "max_file_mb": 5,
  "max_rows": 50000,
  "max_symbols": 10,
  "ai_mode": "fallback"
}
```
*Ghi chú P0.5:* `llm_key_slots` biểu thị số lượng khóa API Gemini đã được thiết lập trên Vercel Serverless Gateway (giá trị: `0`, `1`, hoặc `2`). Tuyệt đối không để lộ giá trị thật của các khóa API.

### 3.8 `RawDataset` & `ValidationOutcome` (Định dạng Dữ liệu Thô và Kết quả Thẩm định P2)

Trong kiến trúc Browser-First, toàn bộ tập dữ liệu thô sau khi được Web Worker thẩm định thành công được lưu trữ dưới dạng Columnar Typed Arrays (`RawDataset`) trong `ArtifactStore` in-memory nhằm tối ưu hiệu năng và truyền không sao chép (Zero-copy Transferable ArrayBuffers):

```typescript
export interface RawDataset {
  symbols: string[];
  symbol_idx: Uint16Array;
  date_days: Int32Array;   // Số ngày tính từ 1970-01-01 UTC (bất biến múi giờ)
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  trade_value?: Float64Array;
  sector?: (string | null)[];
  exchange?: (string | null)[];
  source_row?: Int32Array;
}
```

Kết quả thẩm định tệp (`ValidationOutcome`):
```typescript
export type ValidationOutcome =
  | {
      ok: true;
      dataset: RawDataset;
      meta: DatasetMeta;
      issues: ValidationIssue[]; // Chỉ chứa warning (nếu có)
      transferable_buffers: ArrayBuffer[];
    }
  | {
      ok: false;
      issues: ValidationIssue[]; // Danh sách lỗi và cảnh báo (tối đa 500 issues)
      total_errors: number;
      total_warnings: number;
      truncated: boolean;
      filename: string;
    };
```

Trường `DatasetMeta` mở rộng trong P2:
```typescript
export interface DatasetMeta {
  filename: string;
  rows: number;
  symbols: string[];
  date_from: string; // YYYY-MM-DD UTC
  date_to: string;   // YYYY-MM-DD UTC
  sha256?: string;
  source_sheet?: string;
  columns_present?: string[];
  optional_columns?: string[];
  symbol_rows?: Record<string, number>;
  skipped_blank_rows?: number;
  warning_count?: number;
}
```

### 3.9 Mô hình Làm sạch Dữ liệu & Cổng duyệt 1 (P3 Extension)

Thực hiện 100% trong trình duyệt (Web Worker), dữ liệu thô gốc `raw` là bất biến. Mọi đề xuất nằm trong danh sách trắng 6 thao tác cho phép:

```typescript
export type CleanOpKey =
  | 'drop_exact_duplicates'
  | 'drop_rows_missing_ohlc'
  | 'fill_missing_volume_zero'
  | 'flag_outliers'
  | 'drop_flagged_outliers'
  | 'sort_by_symbol_date';

export interface CleanProposal {
  id: string;               // Ví dụ: prop_drop_exact_duplicates
  op: CleanOpKey;           // Thao tác allowlist tương ứng
  title_vi: string;         // Tiêu đề tiếng Việt
  description_vi: string;   // Mô tả số dòng bị tác động
  rows_affected: number;    // Số dòng tác động (>= 0)
  affected_symbols: string[];
  sample_rows: number[];    // Tối đa 5 chỉ số dòng gốc (1-based)
  severity: 'info' | 'warn';
  default_enabled: boolean;
  params?: Record<string, any>;
}

export type CleaningDecisions = Record<string, boolean>;

export interface CleanArtifact {
  version: number;          // clean_v1, clean_v2...
  approved_at: string;      // ISO 8601 UTC
  reviewer_name: string;    // Bắt buộc (không được rỗng)
  hash: string;             // SHA-256 chính quy (Canonical SHA-256)
  decisions: CleaningDecisions;
  stats: {
    before_rows: number;
    after_rows: number;
    dropped_rows: number;
    filled_volume_rows: number;
    outlier_flagged_rows: number;
    symbols: Record<string, number>; // Số phiên hợp lệ từng mã (>= 30)
  };
}

export interface ConstraintViolation {
  symbol: string;
  sessions_remaining: number;
  sessions_required: number;
  causing_op: CleanOpKey;
  message_vi: string;
}
```

Nhiệm vụ AI `explain_cleaning` tại cổng `/api/ai`:
- Đầu vào: Số liệu hồ sơ tóm tắt và danh sách tối đa 12 đề xuất (tuyệt đối KHÔNG gửi dòng dữ liệu thô).
- Đầu ra: `{ why_vi: string, risk_vi: string }` cho từng đề xuất.
- Bộ lọc phòng vệ: Kiểm tra number allowlist (mọi số AI nhắc tới phải có trong số liệu đầu vào hoặc ngày tháng) và cấm mọi lời khuyên đầu tư tài chính. Nếu vi phạm, tự động rơi về mẫu giải thích dự phòng (Fallback Templates).

### 3.10 Nhận định AI, Báo cáo & Cổng duyệt 2 (P5 Extension)

- **`NarrativeParagraph` / `NarrativeSection` / `Narrative`:** Cấu trúc nhận định phân tích gồm 4 phần (`overview`, `price_movement`, `risk_assessment`, `technical_summary`), mỗi đoạn văn gắn với các chỉ số căn cứ (`evidences: string[]`).
- **Khóa căn cứ chuẩn mực (`evidenceKey`):** `metric:{id}:{symbol}` hoặc `chart:{id}`.
- **Động cơ kiểm chứng số liệu (`checkNumbers`):** Thuật toán so khớp số nghiêm ngặt, đối chiếu mọi con số trong văn bản do AI sinh ra với bảng chỉ số do code tính. Bất kỳ sai số nào không nằm trong danh mục chỉ số hoặc ngữ cảnh tham số đều bị gắn cảnh báo hoặc kích hoạt mẫu dự phòng.
- **Mã băm báo cáo chính quy (`report_hash`):** `SHA-256(canonical(report))` đảm bảo tính toàn vẹn và bất biến sau khi được người dùng duyệt tại Cổng duyệt 2.

### 3.11 Trợ lý Chat Chỉ-đọc & Ranh giới An toàn Kiến trúc (P6 Extension)

- **Ranh giới an toàn chỉ-đọc (Read-Only Guard):**
  - Chặn bằng kiến trúc thông qua kiểm thử AST tĩnh (`architecture.test.ts`): Cấm hoàn toàn module Chat nhập các hàm ghi hoặc hàm chuyển trạng thái của `sessionStore`, `artifacts`, `analysisService`, `uploadService`.
  - Phân loại 3 tầng truy vấn (`Guard -> Local Fast Answer -> AI Verified Answer`):
    - Tầng 1 (Guard): Chặn mọi yêu cầu biến đổi dữ liệu ("sửa giá", "thay đổi", "xóa"), yêu cầu dự đoán tương lai / khuyến nghị mua bán tài chính, hoặc tấn công vượt quyền (Jailbreak / Prompt Injection).
    - Tầng 2 (Local Engine): Trả lời ngay lập tức không cần gọi mạng cho các câu hỏi về: hướng dẫn sử dụng app, tra cứu công thức/ý nghĩa chỉ số (`meaning_vi`, `formula_vi`, `calc`), giải thích nguyên nhân tệp bị từ chối gần nhất (`last_rejection`).
    - Tầng 3 (AI Gateway `chat_explain`): Giải thích phân tích chuyên sâu khi có cấu hình API key, kèm bộ kiểm chứng số liệu nghiêm ngặt và chip dẫn chứng bấm được.
- **Hợp đồng giao diện Chat (`ChatMessage`, `ChatAnswer`):**
```typescript
export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
  sources?: string[]; // Danh sách ID chỉ số hoặc biểu đồ dẫn chứng
  suggested_actions?: string[];
  refusal_reason?: 'state_mutation' | 'financial_advice' | 'jailbreak';
}

export interface ChatAnswer {
  content: string;
  evidences?: string[];
  suggested_actions?: string[];
}
```

### 3.12 Quy trình Phân tích Riêng Dùng Một Lần & Động cơ Thực thi (P6 Extension)

- **Nguyên tắc bất biến: AI không bao giờ viết code và không bao giờ chạy code.** AI chỉ đề xuất kế hoạch gồm các bước khai báo thuộc danh sách trắng 13 thao tác thuần túy.
- **Danh sách trắng 13 thao tác (`src/core/plan/ops/`):**
  1. `filter_rows`: Lọc dòng theo biểu thức điều kiện an toàn (`col op val`).
  2. `sort_rows`: Sắp xếp bảng theo cột (tăng/giảm dần).
  3. `slice_rows`: Cắt lấy `head(N)`, `tail(N)` hoặc khoảng dòng `[offset, limit]`.
  4. `project_columns`: Chọn danh sách cột cần hiển thị.
  5. `add_column_derived`: Thêm cột tính toán theo công thức toán an toàn (`+`, `-`, `*`, `/`, `abs`, `log`, `sqrt`, `round`).
  6. `group_aggregate`: Gom nhóm theo cột và tính hàm tổng hợp (`mean`, `sum`, `min`, `max`, `count`, `std`).
  7. `pivot_wider`: Chuyển đổi bảng dọc sang ngang theo giá trị cột.
  8. `compute_rolling`: Tính chỉ số trượt (SMA, Rolling Volatility, v.v.) với cửa sổ $2 \le N \le 60$.
  9. `compute_cross_stat`: Tính toán tương quan cặp hoặc ma trận thống kê chéo.
  10. `compute_drawdown_series`: Tính chuỗi sụt giảm drawdown từ đỉnh và Max Drawdown.
  11. `rank_symbols`: Xếp hạng các mã theo chỉ số tính toán.
  12. `make_table`: Thao tác kết thúc (Terminal Op) đóng gói bảng kết quả hiển thị.
  13. `make_chart`: Thao tác kết thúc (Terminal Op) sinh đặc tả biểu đồ trực quan hóa.
- **Cấu trúc kế hoạch (`Plan`) và kết quả thực thi (`PlanResult`):**
```typescript
export interface PlanStep {
  id: string;
  op: PlanOpKey;
  params: Record<string, unknown>;
  why_vi: string;
}

export interface Plan {
  id: string;
  title_vi: string;
  intent_vi: string;
  steps: PlanStep[]; // Tối đa 8 bước, bắt buộc kết thúc bằng make_table hoặc make_chart
  is_template?: boolean;
}

export interface PlanTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface PlanResult {
  id: string;
  plan_id: string;
  title_vi: string;
  intent_vi: string;
  steps_executed: number;
  duration_ms: number;
  table?: PlanTable;
  chart?: ChartSpec;
  summary_vi: string;
  created_at: string;
}
```
- **Thực thi cô lập (Web Worker):** Chạy trong `src/workers/plan.worker.ts`, giao tiếp qua `postMessage` báo cáo tiến độ từng bước, bảo vệ giao diện chính không bị đơ hoặc lag khi xử lý lượng lớn dữ liệu.

### 3.13 Mở rộng Kho Artifacts & Mã băm Báo cáo Chính quy (P6 Extension)

- **Bộ nhớ lưu trữ kết quả phân tích riêng:** Lưu tối đa 3 kết quả thực thi vào `ArtifactStore` theo các khóa `custom_1`, `custom_2`, `custom_3`.
- **Dọn dẹp đồng bộ:** Khi người dùng nạp tệp mới (`upload_ok`) hoặc yêu cầu làm sạch lại (`reclean`), toàn bộ các slot `custom_*` được tự động xóa sạch đồng bộ với `clean_vN` và `metrics`.
- **Mã băm báo cáo chính quy (`report_hash`):**
  - Mở rộng để đóng gói cả danh sách `custom_workflows` (đã chuẩn hóa thuộc tính) vào hàm băm `SHA-256`.
  - Mọi thay đổi trong quy trình phân tích riêng đều được phản ánh vào `report_hash`, đảm bảo báo cáo xuất bản có thể kiểm chứng toàn vẹn 100%.
- **Xuất tệp Excel Sheet 8 (`Phân tích riêng`):** Bổ sung bảng tính và chỉ số của các quy trình riêng với công thức định dạng số chuẩn và lớp phòng vệ Formula Injection nghiêm ngặt.

---

## 4. Máy trạng thái phiên & Ánh xạ quyền truy cập

### 4.1 Bảng trạng thái & Ý nghĩa
- `created`: Phiên mới tạo, chưa có dữ liệu nạp.
- `uploaded`: Đã nạp file dữ liệu hợp lệ, có dữ liệu gốc.
- `cleaning_review`: Đã sinh đề xuất làm sạch, chờ người dùng duyệt (CỔNG DUYỆT 1).
- `clean_approved`: Đã duyệt dữ liệu sạch, có ít nhất một phiên bản `clean_vN`.
- `analyzed`: Đã tính chỉ số và có bản nháp báo cáo, chờ người dùng duyệt (CỔNG DUYỆT 2).
- `report_approved`: Báo cáo nhận định đã được phê duyệt chính thức (CỔNG DUYỆT 2).

### 4.2 Bảng chuyển trạng thái hợp lệ
Mọi thao tác chuyển trạng thái thực thi thông qua hàm `transition(session_id, event, actor, detail)`:

| Từ trạng thái | Sự kiện (`event`) | Đến trạng thái | Hành vi đi kèm |
|---|---|---|---|
| `created` | `upload_ok` | `uploaded` | Ghi nhận dữ liệu gốc |
| `uploaded` | `proposals_ready` | `cleaning_review` | Sinh các đề xuất xử lý bất thường |
| `cleaning_review` | `clean_approved` | `clean_approved` | **Vượt Cổng 1**, lưu `clean_vN` |
| `clean_approved` | `analysis_done` | `analyzed` | Hoàn thành tính chỉ số & dự thảo báo cáo |
| `analyzed` | `report_approved` | `report_approved` | **Vượt Cổng 2**, mở khóa xuất bản |
| `report_approved` | `report_edited` | `analyzed` | Chỉnh sửa bản báo cáo đã duyệt |
| Bất kỳ (trừ `created`) | `upload_ok` | `uploaded` | **Dọn sạch phía sau**: Xóa sạch toàn bộ kết quả phân tích & clean |
| `clean_approved`, `analyzed`, `report_approved` | `reclean` | `cleaning_review` | Giữ lịch sử `clean_vN`, xóa kết quả phân tích & báo cáo phía sau |

### 4.3 Ánh xạ trạng thái sang Quy trình (`steps`) và Trang mở khóa (`unlocked_pages`)
Hàm duy nhất `build_session_view(session_row)` thực hiện ánh xạ:

| Trạng thái (`state`) | Thứ tự 5 bước (`upload / clean / review / analyze / report`) | Các trang mở khóa thêm (ngoài `home, upload, agent, history, config`) |
|---|---|---|
| `created` | current / locked / locked / locked / locked | *(không có)* |
| `uploaded` | done / current / locked / locked / locked | `clean` |
| `cleaning_review` | done / done / current / locked / locked | `clean` |
| `clean_approved` | done / done / done / current / locked | `clean`, `analyze` |
| `analyzed` | done / done / done / done / current | `clean`, `analyze`, `report` |
| `report_approved` | done × 5 (tất cả hoàn thành) | `clean`, `analyze`, `report` |

---

## 5. Quy ước đặt tên & Định dạng

### 5.1 Quy ước đặt tên
- **Code:** Tiếng Anh.
  - Python & JSON keys: `snake_case` (ví dụ: `period_return`, `date_from`).
  - TypeScript variables & functions: `camelCase` (ví dụ: `formatDateTime`, `createNewSession`).
  - TypeScript Types / Interfaces / React Components: `PascalCase` (ví dụ: `ValidationIssue`, `ConfigPage`).
- **Giao diện người dùng:** 100% tiếng Việt có dấu đầy đủ, chỉ khai báo tại `frontend/src/i18n/vi.ts`.

### 5.2 Định dạng số và thời gian
- **API truyền tải:**
  - Thời gian: ISO 8601 UTC (`2026-11-13T08:30:00Z`).
  - Số liệu: Số thô (`1234.56`). Tỷ lệ dạng thập phân (`0.1234` nghĩa là `12,34%`).
- **Frontend hiển thị:**
  - Định dạng chuẩn Việt Nam (`vi-VN`): Dấu phẩy phân tách thập phân, dấu chấm phân cách nghìn (`1.234,56`).
  - Tỷ lệ phần trăm: `12,34%`.
  - Ngày tháng: `13/11/2026`.
  - Thời gian: Giờ Việt Nam `Asia/Ho_Chi_Minh` (UTC+7), ví dụ: `14/11/2026 00:30`.

---

## 6. Danh mục mã lỗi và tiền tố (Error Codes)

### 6.1 Bảng mã lỗi tổng quát

| Tiền tố | Lĩnh vực | Mã lỗi cụ thể | Ý nghĩa / Ví dụ |
|---|---|---|---|
| `UPLOAD_*` | Thao tác và tệp tải lên | `UPLOAD_NO_FILE`, `UPLOAD_EXTENSION_UNSUPPORTED`, `UPLOAD_XLS_LEGACY`, `UPLOAD_TOO_LARGE`, `UPLOAD_EMPTY`, `UPLOAD_CORRUPT`, `UPLOAD_PASSWORD_PROTECTED`, `UPLOAD_CONTENT_MISMATCH`, `UPLOAD_ENCODING`, `UPLOAD_NO_HEADER`, `UPLOAD_NO_DATA` | Tệp vượt quá 5MB, sai định dạng (.csv, .xlsx), magic bytes giả mạo, zip bomb (UPLOAD_CORRUPT kèm details.reason='zip_bomb'), lỗi parse hoặc không có dữ liệu |
| `SCHEMA_*` | Kiểm tra cấu trúc cột và bảng | `SCHEMA_MISSING_COLUMN`, `SCHEMA_DUPLICATE_COLUMN`, `SCHEMA_UNKNOWN_COLUMN`, `SCHEMA_SHEET_FALLBACK`, `SCHEMA_HEADER_ROW_MOVED` | Cấu trúc cột/bảng tính: thiếu cột bắt buộc, trùng lặp cột, cột không rõ (cảnh báo) |
| `DATA_*` | Kiểm định nội dung dữ liệu | `DATA_BAD_NUMBER`, `DATA_BAD_DATE`, `DATA_DATE_AMBIGUOUS`, `DATA_MIXED_NUMBER_FORMAT`, `DATA_EMPTY_KEY`, `DATA_TOO_MANY_MISSING`, `DATA_NONPOSITIVE_PRICE`, `DATA_NEGATIVE_VOLUME`, `DATA_OHLC_INCONSISTENT`, `DATA_CONFLICT_DUPLICATE`, `DATA_BAD_SYMBOL`, `DATA_TOO_MANY_ROWS`, `DATA_TOO_MANY_SYMBOLS`, `DATA_SYMBOL_TOO_FEW_SESSIONS`, `DATA_NO_USABLE_SYMBOL`, `DATA_MISSING_VALUES`, `DATA_EXACT_DUPLICATE`, `DATA_AMBIGUOUS_NUMBER`, `DATA_TIME_PART_DROPPED`, `DATA_FUTURE_DATE`, `DATA_LARGE_MOVE`, `DATA_LONG_GAP`, `DATA_SYMBOLS_DROPPED`, `DATA_NUMBER_OVERFLOW` | Giá trị dữ liệu không hợp lệ: số âm, OHLC vô lý, trùng lặp xung đột, ngày tương lai (cảnh báo), số mập mờ (cảnh báo), tràn số ngoài giới hạn |
| `STATE_*` | Vi phạm máy trạng thái | `STATE_INVALID`, `STATE_LOCKED` | Chưa đạt trạng thái yêu cầu theo quy trình |
| `LLM_*` | Kết nối hoặc phản hồi AI | `LLM_NOT_CONFIGURED` | Chưa cấu hình khóa API Gemini nào trên gateway |
| | | `LLM_RATE_LIMITED` | Cả 2 slot khóa đều bị giới hạn tần suất (HTTP 429) |
| | | `LLM_TIMEOUT` | Quá thời gian chờ phản hồi AI (20s/key, 45s tổng) |
| | | `LLM_UPSTREAM_ERROR` | Lỗi máy chủ Google Gemini (5xx, không phục hồi) |
| | | `LLM_BAD_OUTPUT` | Kết quả AI không khớp schema JSON của nhiệm vụ |
| | | `LLM_PAYLOAD_TOO_LARGE` | Kích thước dữ liệu gửi lên cổng AI vượt quá 64 KB |
| | | `LLM_UNKNOWN_TASK` | Nhiệm vụ AI không nằm trong danh mục cho phép |
| | | `LLM_BAD_INPUT` | Tham số đầu vào nhiệm vụ AI không hợp lệ |
| | | `LLM_MODEL_UNAVAILABLE`| Mô hình Gemini đã ngừng hoạt động (HTTP 404/503) |
| `NOT_FOUND` | Tài nguyên không tồn tại | `NOT_FOUND` | Không tìm thấy phiên làm việc |
| `INTERNAL` | Lỗi không mong muốn | `INTERNAL` | Lỗi ngoại lệ hệ thống (tuyệt đối không lộ stack trace) |

### 6.2 Cơ chế chống Formula Injection (CSV Injection)
Trong mọi tác vụ xuất file CSV (báo cáo lỗi thẩm định P2, báo cáo phân tích P5): Bất kỳ ô dữ liệu nào bắt đầu bằng ký tự nguy hiểm (`=`, `+`, `-`, `@`) đều được tự động thêm tiền tố dấu nháy đơn `'` ở phía trước. Điều này ngăn chặn Microsoft Excel hoặc Google Sheets vô tình thực thi lệnh macro độc hại khi người dùng mở tệp.

---

## 7. Danh mục Endpoint và Dịch vụ (P0.5 & P2: Browser-First + Vercel Gateway)

Trong kiến trúc mới, toàn bộ quản lý phiên, xác thực và tính toán được thực thi cục bộ trong bộ nhớ tab trình duyệt (`src/services/sessionService.ts`, `src/services/uploadService.ts`, `src/workers/validate.worker.ts`), trong khi Vercel chỉ triển khai 2 serverless endpoints bảo mật:

### 7.1 Vercel Serverless Gateway Endpoints
| Phương thức | Đường dẫn | Chức năng | Phản hồi chính |
|---|---|---|---|
| `GET` | `/api/health` | Kiểm tra trạng thái AI Gateway, số slot khóa, mô hình chính & fallback, giới hạn rate limit | `HealthResponse` |
| `POST` | `/api/ai` | Proxy bảo mật gọi Gemini API theo task whitelist (JSON schema nghiêm ngặt) | `AiResponse<T>` |

### 7.2 Local Client Services (`sessionService.ts`, `uploadService.ts`)
Các hàm TypeScript cục bộ thực thi đầy đủ hợp đồng P0/P2 trên bộ nhớ phiên:
- **`sessionService.ts`**:
  - `createSession(name?: string): Promise<Session>`
  - `getSession(id: string): Promise<Session>`
  - `listSessions(): Promise<Session[]>` (sắp xếp mới nhất trước)
  - `deleteSession(id: string): Promise<DeleteResponse>`
  - `getLog(id: string): Promise<AuditEntry[]>` (sắp xếp cũ nhất trước)
  - `getAppConfig(): Promise<AppConfig>`
  - `devForceEvent(id: string, event: SessionEvent): Promise<Session>` (chỉ khả dụng trong môi trường dev/test)
- **`uploadService.ts`**:
  - `precheckFile(file: File): { ok: boolean; error_code?: string; message_vi?: string }` (kiểm tra nhanh < 10ms đồng bộ)
  - `runUpload(file: File, sessionId: string, onProgress?: (percent: number, stage: string) => void): Promise<ValidationOutcome>` (chuyển sang Web Worker xử lý toàn bộ S1-S6)
  - `recordRejection(sessionId: string, outcome: ValidationOutcome): Promise<void>` (lưu lịch sử từ chối và ghi audit log `upload_rejected` mà không đổi state)
  - `buildErrorCsv(outcome: Extract<ValidationOutcome, { ok: false }>): string` (tạo CSV lỗi có UTF-8 BOM và chống Formula Injection)
  - `getSchemaInfo(): { required: ColumnSpec[]; optional: ColumnSpec[]; limits: ... }`

---

## 8. Bảng biến màu và khoảng cách CSS (Tokens)

Khai báo tại `frontend/src/styles/tokens.css`, cấm đổi tên biến:

```css
:root {
  --bg: #CFE6F7;          /* Màu nền chính ứng dụng (Pixel Blue pastel) */
  --panel: #EAF0F6;       /* Màu nền panel / container */
  --ink: #14214D;         /* Màu chữ chính (Deep Navy) */
  --ink-soft: #3C4A78;    /* Màu chữ phụ / viền nhẹ */
  --accent: #F26B21;      /* Màu nhấn cam cổ điển */
  --accent-d: #B8470F;    /* Màu nhấn cam đậm khi hover/active */
  --blue: #3B7BD1;        /* Màu xanh liên kết & điểm nhấn */
  --good: #1E9E4A;        /* Màu thành công / trạng thái tốt */
  --bad: #D93025;         /* Màu lỗi / cảnh báo đỏ */
  --warn: #F5A524;        /* Màu cảnh báo vàng */
  --white: #FFFFFF;       /* Màu trắng */
  --chart-bg: #FFFFFF;    /* Màu nền biểu đồ */
  --chart-grid: #D9D9D9;  /* Đường lưới biểu đồ */
  --chart-axis: #BFBFBF;  /* Trục biểu đồ */
  --chart-text: #595959;  /* Chữ chú thích biểu đồ */
  --excel-blue: #4472C4;  /* Màu xanh phong cách Excel */
  --excel-orange: #ED7D31;/* Màu cam phong cách Excel */
  --excel-gray: #A5A5A5;  /* Màu xám phong cách Excel */
  --excel-gold: #FFC000;  /* Màu vàng kim phong cách Excel */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Bổ sung trong P1: Phông chữ và tỷ lệ tương phản chuẩn WCAG 2.1 */
  --font-pixel: 'VT323', monospace;
  --font-content: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-analysis: 'Times New Roman', Times, serif;
  --accent-text: #14214D; /* Đạt tỷ lệ 5.09:1 trên nền cam --accent */
  --warn-text: #14214D;   /* Đạt tỷ lệ 7.60:1 trên nền vàng --warn */
  --clip-sm: 2px;
  --clip-md: 4px;
  --clip-lg: 6px;

  /* Bổ sung trong P2 (Phần A7): Tương phản cao WCAG AAA cho PixelBadge và trạng thái */
  --good-d: #136932;      /* Xanh đậm đạt tỷ lệ 7.8:1 trên nền sáng */
  --good-bg: #E3F8EA;     /* Nền xanh nhạt */
  --blue-d: #1A54A4;      /* Xanh dương đậm đạt tỷ lệ 8.2:1 */
  --blue-bg: #E5F0FD;     /* Nền xanh dương nhạt */
  --warn-bg: #FEF3D6;     /* Nền cảnh báo nhạt */
}
```

---

## 9. Nhật ký thay đổi hợp đồng (Contract Change Log)

*Quy tắc: Mỗi khi bước tiếp theo bổ sung endpoint hoặc thuộc tính mới, hãy ghi tiếp vào bảng dưới đây. Không được sửa hay xóa các định nghĩa cũ.*

| Ngày | Prompt | Tác nhân | Thay đổi | Lý do |
|---|---|---|---|---|
| 2026-11-13 | **P0** | Full-stack Engineer | Khởi tạo tài liệu hợp đồng chung ban đầu | Nền móng hệ thống Pixel Trading Agent |
| 2026-11-13 | **P1** | Full-stack Engineer | Bổ sung biến CSS: `--font-pixel`, `--font-content`, `--font-analysis`, `--accent-text`, `--warn-text`, `--clip-sm/md/lg`. Bổ sung route `/thu-vien-giao-dien`. Bảo toàn 100% hợp đồng dữ liệu, endpoint, mã lỗi P0. | Hoàn thiện hệ thống thiết kế Pixel Art, tuân thủ tương phản WCAG 2.1, hỗ trợ trang thư viện linh kiện mẫu. |
| 2026-11-14 | **P0.5** | Full-stack Engineer | Chuyển kiến trúc sang Browser-First + Vercel Serverless Gateway. Toàn bộ quản lý phiên, xác thực, làm sạch và tính toán chạy in-memory trong trình duyệt / Web Worker. Bổ sung trường `llm_key_slots` (0..2) trong `AppConfig`. Chuẩn hóa mã lỗi `LLM_*` (`LLM_NOT_CONFIGURED`, `LLM_RATE_LIMITED`, `LLM_TIMEOUT`, `LLM_UPSTREAM_ERROR`, `LLM_BAD_OUTPUT`, `LLM_PAYLOAD_TOO_LARGE`, `LLM_UNKNOWN_TASK`, `LLM_BAD_INPUT`). Giữ nguyên 100% hình dạng dữ liệu P0 và giao diện P1. | Phù hợp triển khai tĩnh trên Vercel không cần server Python riêng, bảo mật API key qua Vercel Serverless Gateway. |
| 2026-11-14 | **P2** | Full-stack Engineer | Bổ sung giao diện dữ liệu thô `RawDataset` (columnar typed arrays), `ValidationOutcome`, mở rộng `DatasetMeta` (`sha256`, `source_sheet`, `columns_present`, `optional_columns`, `symbol_rows`, `skipped_blank_rows`, `warning_count`). Bổ sung danh mục mã lỗi thẩm định S1-S6 (`UPLOAD_*`, `DATA_*`), cơ chế chống Formula Injection khi xuất CSV, dịch vụ nạp tệp `uploadService.ts` chạy Web Worker, cập nhật model `gemini-3.5-flash-lite` và fallback `gemini-3.8-flash`, bổ sung token màu WCAG AAA (`--good-d`, `--good-bg`, `--blue-d`, `--blue-bg`, `--warn-bg`). | Hoàn thiện cổng nạp dữ liệu và kiểm tra tệp 100% client-side bằng Web Worker, đảm bảo an toàn, bảo mật và hiệu năng cao. |
| 2026-11-14 | **P3** | Full-stack Engineer | Bổ sung module làm sạch dữ liệu phía client (`src/core/cleaner/`), Web Worker `clean.worker.ts`, giao diện đề xuất làm sạch (`CleanProposal`), quyết định làm sạch (`CleaningDecisions`), artifact dữ liệu sạch có phiên bản (`CleanArtifact`, `clean_vN`), thuật toán phát hiện điểm dị biệt MAD log-return (z > 6, return > 10%), mã băm chính quy (Canonical SHA-256), ràng buộc sau làm sạch tối thiểu 30 phiên/mã, nhiệm vụ AI `explain_cleaning` tại `/api/ai` với bộ lọc kiểm tra số (number allowlist) và cấm khuyến nghị đầu tư, các hành động audit `clean_profile_computed`, `clean_diff_calculated`, `clean_approved`, `clean_reclean_requested`, giao diện Cổng duyệt 1 (`CleanPage.tsx`). | Hoàn thiện bước Làm sạch dữ liệu và Cổng duyệt 1 của con người, đảm bảo dữ liệu sạch chính xác và minh bạch trước khi phân tích. |
| 2026-11-14 | **P4** | Full-stack Engineer | Bổ sung phân tích định lượng thuần túy (zero AI): 17 chỉ số độc lập mỗi mã (`MetricSchema` mở rộng `calc`, `period`, `reason_vi`, `text`, `meaning_vi`, `excel_hint`), các chỉ số so sánh đa mã (`symbol_returns`, `correlation`, `normalized_base`, `volume_share`, `risk_return`), 12 quy cách biểu đồ Excel (`ChartSpecSchema` mở rộng `subtitle_vi`, `aria_vi`, `empty_reason_vi`, `table`), Web Worker phân tích `analysis.worker.ts`, bộ dịch vụ `analysisService.ts`, dịch vụ truy vấn chỉ-đọc `readers.ts` đảm bảo ranh giới an toàn cho AI/Chat Assistant, bộ linh kiện giao diện biểu đồ chuẩn Excel không mã hex cứng (`ExcelCard`, `PixelChart`, `KpiTile`, `MetricCalcModal`, `CorrelationHeatmap`), trang Cấu hình phân tích (`AnalyzePage.tsx`), trang Báo cáo định lượng (`ReportPage.tsx`), tài liệu kiểm chứng công thức toán và Excel `docs/KIEM_CHUNG_CHI_SO.md`, script kiểm chứng độc lập `scripts/verify_metrics.mjs` (`npm run verify:metrics`). | Hoàn thiện bước 4 phân tích định lượng, biểu đồ và thẻ KPI chuẩn Excel trong bộ khung Pixel Art, sẵn sàng tích hợp AI Narrator tại P5. |
| 2026-11-14 | **P5** | Full-stack Engineer | Bổ sung phần Nhận định AI, Cổng duyệt 2 và Xuất báo cáo: Các cấu trúc dữ liệu (`NarrativeParagraph`, `NarrativeSection`, `Narrative`, `NumberCheckIssue`, `ReportArtifact`), khóa căn cứ chuẩn mực (`metricKey`, `chartKey`, `parseEvidenceKey`, `chartBackingMetrics`), động cơ kiểm chứng đối chiếu số liệu thuần TypeScript (`src/core/narrative/check.ts`) phòng chống ảo giác, phát hiện từ cấm (`forbidden.ts`), động cơ tạo nhận định dự phòng 100% kiểm chứng đạt (`templates.ts`), nhiệm vụ Vercel AI Gateway `write_report` với cơ chế thử lại kép `fix_issues` và chuyển tiếp theo từng mục (section fallback), dịch vụ duyệt báo cáo Cổng 2 và chỉnh sửa (`src/services/reportService.ts`) gắn mã băm xác thực `report_hash = SHA-256(...)`, dịch vụ xuất tệp Excel 7 sheet có công thức sống kiểm chứng đối chiếu (`src/services/exportExcel.ts`) phòng thủ injection, bộ quy tắc in `@media print` khổ A4 và con dấu pixel "ĐÃ DUYỆT" (`ApprovedStamp.tsx`). | Hoàn thiện toàn bộ quy trình AI viết nhận định, kiểm chứng số liệu chặt chẽ, Cổng duyệt 2 của con người và xuất file báo cáo (PDF & Excel) sẵn sàng bảo vệ trước hội đồng. |
| 2026-11-15 | **P6** | Full-stack Engineer | Bổ sung Trợ lý Chat chỉ-đọc và Quy trình phân tích riêng dùng một lần: (1) Sửa triệt để dung sai đối chiếu số học chính xác tuyệt đối, quy tắc ngữ cảnh tham số (14, 20, 50, 252, v.v.), công thức kiểm chứng Excel `=IF(F{r}<=1E-9*MAX(1,ABS(E{r})), "Khớp", "Lệch")`, định dạng giờ Việt Nam `Asia/Ho_Chi_Minh`. (2) Trợ lý Chat chỉ-đọc (`ChatDock.tsx`) chặn đột biến bằng AST test (`architecture.test.ts`), xử lý 3 tầng (`Guard -> Local -> AI chat_explain`), chip gợi ý theo ngữ cảnh trang, nút dừng, xóa lịch sử, rate limit 2s, trần 50 tin nhắn. (3) Quy trình phân tích riêng 100% không chạy code AI, chỉ nhận kế hoạch từ danh sách 13 thao tác cho phép (`src/core/plan/ops/`), thẩm định tối đa 8 bước (`validatePlan`), 7 mẫu dựng sẵn (`templates.ts`), thực thi trong Web Worker (`plan.worker.ts`), lưu tối đa 3 kết quả (`custom_1..3`) trong `ArtifactStore` và tự xóa khi nạp mới/reclean, tích hợp trang Báo cáo và in A4, xuất tệp Excel Sheet 8 (`Phân tích riêng`), mã băm `report_hash` bao gồm `custom_workflows`. (4) Công cụ Chẩn đoán AI 5 tác vụ (`AiDiagnosticsPanel.tsx`) tại trang Cấu hình và tài liệu kiểm tra AI thật `docs/KIEM_TRA_AI_THAT.md`. | Hoàn thiện đầy đủ các tính năng cuối cùng của đặc tả hệ thống, nâng cao trải nghiệm người dùng, đảm bảo tính an toàn kiến trúc tuyệt đối và sẵn sàng kết nối khóa API thật. |
| 2026-11-15 | **Hotfix P6.1** | Full-stack Engineer | Sửa lỗi "Yêu cầu gửi tới dịch vụ AI không hợp lệ" ở nút "Kiểm tra kết nối AI": (1) Loại bỏ trường `thinking_config` trong `generationConfig` tại `api/_lib/gemini.ts` gây lỗi HTTP 400 Bad Request từ Protobuf validator của Google Gemini REST API. (2) Xây dựng `src/core/aiTaskSchemas.ts` làm nguồn sự thật duy nhất (Single Source of Truth) cho schemas đầu vào/đầu ra của cả 5 tác vụ AI (`ping`, `explain_cleaning`, `write_report`, `chat_explain`, `plan_custom`). (3) Mở rộng `chat_explain` hỗ trợ sender `assistant` và `plan_custom` tự động chuẩn hóa `date_from`/`date_to`/`date_range`. (4) Chuẩn hóa thông điệp lỗi tiếng Việt dễ hiểu kèm mã trong ngoặc `(mã LLM_*)`, gợi ý khắc phục và danh sách trường sai không lộ giá trị (`src/core/aiErrors.ts`). (5) Ghi log an toàn tại server không lộ khóa hay nội dung prompt. (6) Bổ sung 17 bài kiểm tra payload audit toàn diện `api/_lib/taskPayloadAudit.test.ts` và 2 bài kiểm tra hồi quy `api/_lib/ping_repro.test.ts`. | Khắc phục triệt để lỗi kết nối AI, đảm bảo tính ổn định và đồng bộ dữ liệu giữa client và gateway cho người dùng cuối. |
| 2026-11-15 | **Hotfix P6.2** | Full-stack Engineer | Tối ưu độ trễ Gemini và mức suy nghĩ (Thinking Config): (1) Đọc tài liệu chính thức Google Gemini (ai.google.dev), chuẩn hóa cấu trúc `generationConfig.thinkingConfig.thinkingLevel`. (2) Bổ sung biến môi trường `GEMINI_THINKING_LEVEL` (mặc định 'minimal' cho tác vụ nhanh: ping, explain_cleaning, chat_explain, plan_custom) và `GEMINI_THINKING_LEVEL_REPORT` (mặc định 'low' cho write_report). (3) Chịu lỗi: tự động thử lại đúng một lần không kèm trường suy nghĩ nếu Google trả về 400 không hỗ trợ trường suy nghĩ. (4) Tối ưu timeout theo tác vụ (15s/25s cho tác vụ nhanh, 35s/55s cho báo cáo, client timeout 28s/58s, maxDuration Vercel 60s). (5) Ghi log an toàn kèm thinking level, thought tokens, output tokens, latency. (6) Cập nhật bảng chẩn đoán AI (`AiDiagnosticsPanel.tsx`) thêm 2 cột: "Mức suy nghĩ" và "Token suy nghĩ". (7) Bổ sung bộ kiểm thử `api/_lib/gemini_thinking.test.ts` (8 tests). | Khắc phục hiện tượng trễ 11.3s do model rơi về mức suy nghĩ cao nhất, tối ưu tốc độ phản hồi và chi phí token cho người dùng. |
| 2026-11-15 | **P7** | Lead Architect | **KHÓA HỢP ĐỒNG PHÁT HÀNH v1.0.0**: (1) Hoàn thiện trang Tiến trình Agent (`/tien-trinh`) với khung ILC 3 khối (Intent, Logic, Context/Control), bảng thẩm định chuỗi băm mật mã toàn vẹn, bảng nhật ký kiểm toán lọc theo actor/step, phân trang và tải CSV chống Formula Injection. (2) Bổ sung cột Người duyệt tại trang Lịch sử (`/lich-su`). (3) Hiển thị phiên bản ứng dụng v1.0.0 và cẩm nang hướng dẫn tại trang Cấu hình (`/cau-hinh`). (4) Triệt tiêu tham số tự do `expr`, chuẩn hóa sinh tiêu đề kế hoạch thuần code (`derivePlanTitle`), kiểm soát chặt chẽ ngữ cảnh số tham số (14, 20, 50, 252). (5) Chuẩn hóa start.bat (100% ASCII, CRLF) chạy nháy đúp Windows mượt mà. (6) Xây dựng bộ công cụ kiểm thử toàn diện: `evidence_report.mjs` (sinh `BANG_CHUNG.md`), `ui_audit.mjs` (kiểm toán 3 viewports x 9 routes), `e2e_full.mjs` (luồng dữ liệu toàn vẹn & 12 ảnh chụp màn hình FINAL không trùng lặp), `chaos.mjs` (chịu lỗi & offline), `predeploy_check.mjs` (9 bước kiểm tra động). (7) Bộ tài liệu bảo vệ đồ án: Kịch bản demo 15 phút, Bộ 25+ câu hỏi hội đồng, Ma trận kiến trúc & bảo mật, Danh sách kiểm tra trước ngày bảo vệ, Kiểm tra sau deploy và Hướng dẫn đẩy Git/Vercel. (8) Đóng gói phát hành `make_release.mjs` và thẩm định bản sạch `verify_release.mjs`. | Đạt tiêu chuẩn chất lượng cao nhất cho buổi bảo vệ đồ án tốt nghiệp, hoàn thiện 100% mục tiêu của chuỗi P0 đến P7. |
| 2026-11-16 | **D1a** | UI/UX Lead | Sửa lỗi giao diện thanh trên và nạp dữ liệu: (1) Khắc phục nút lặp ở Topbar: loại bỏ badge trạng thái trùng lặp, chuẩn hóa đúng thứ tự `Huy hiệu AI -> + Phiên mới -> Xóa sạch`, bổ sung ConfirmDialog cảnh báo mất dữ liệu khi tạo phiên mới từ phiên đang có dữ liệu dở dang. (2) Khắc phục chữ bị đè ở trang Nạp dữ liệu: loại bỏ text-shadow khỏi mọi chữ < 40px (chỉ hero banner >= 40px được dùng), thay thế toàn bộ emoji trong giao diện bằng PixelIcon, mở rộng PixelButton hỗ trợ prop `font="content"` (Be Vietnam Pro, >= 13px, letter-spacing bình thường). Bổ sung kiểm toán tự động trong `ui_audit.mjs` và bộ kiểm thử `Topbar.test.tsx`. | Khắc phục triệt để lỗi hiển thị, bảo đảm tính công thái học và chuẩn thẩm mỹ Pixel Art cho người dùng. |
| 2026-11-16 | **D1b** | Brand & UI Lead | Đại tu nhận diện thương hiệu Datify AI Agent và tông màu sáng (Light Pixel Art Theme): (1) Đổi tên hiển thị sang **Datify AI Agent** (Trading AI Agent) trên toàn bộ sidebar, `<title>`, AppConfig, `/api/health`, trang Cấu hình, tiêu đề báo cáo, in PDF, sheet Tóm tắt Excel. Giữ nguyên định danh gói nội bộ `pixel-trading-agent`. (2) Logo voxel nguyên bản `FACE_ANALYST` (48x48) qua component `PixelFace` render SVG tối ưu gộp ô liền kề, cập nhật favicon. (3) Tông màu sáng: `--bg: #F4F7FA`, `--panel: #FFFFFF`, `--panel-sub: #EEF3F8`, `--sidebar-bg: #D5E2EF`, `--grid-line: #E2EAF1`, `--circuit: #D0DFEE`, `--page-2: #E8EEF5`, `--cream: #FFF8E7`. Kiểm thử tương phản WCAG 2.1 AAA (>= 7:1). (4) Thiết kế lại Hero banner trang chủ với khẩu hiệu khối 3D `SỐ LIỆU ĐÁNG TIN, / AGENT CHÍNH XÁC`, 3 cam kết chuẩn, 5 thẻ quy trình phân tích chặt chẽ loại bỏ hoàn toàn chữ Python. | Nâng tầm thẩm mỹ hiện đại, chuyên nghiệp, tạo ấn tượng mạnh mẽ cho buổi bảo vệ đồ án. |
| 2026-11-16 | **D1c** | UI/UX Lead | Thiết kế lại nút Chat nổi hình mặt bot xanh lá và bong bóng thoại: (1) Ma trận voxel bot `FACE_BOT` và `FACE_BOT_BLINK` trong `src/brand/sprites.ts` kèm đèn ăng-ten cam. (2) Component `ChatLauncher` khối vuông 64x64px, viền 4px, bóng cứng 4px 4px 0, chuẩn phím Enter/Space/Esc và aria-expanded/aria-controls. (3) Bong bóng thoại "Tôi có thể giúp gì cho bạn?" nền `--cream` có nút X ghi nhớ trong phiên tab, tự ẩn sau 12s hoặc khi cuộn/mở chat, co gọn trên màn hình < 900px. (4) Chuẩn hóa thang z-index: `--z-launcher: 9999`, `--z-modal: 10000`, `--z-toast: 10001` bảo đảm modal và toast luôn nằm trên nút chat. Bảo toàn nguyên vẹn kiến trúc chỉ-đọc và 3 tầng xử lý của chat P6. | Tạo điểm nhấn tương tác sinh động, thân thiện và trực quan theo phong cách game voxel. |






