# Datify AI Agent 👾

Hệ thống AI Agent phân tích dữ liệu giao dịch chứng khoán (giá và khối lượng) với giao diện mang phong cách Pixel Art hiện đại kết hợp cùng thẻ KPI và biểu đồ chuẩn mực kiểu Microsoft Excel.

> **Giả định về Thương hiệu & Đặt tên:**
> - **Tên thương hiệu hiển thị (Brand Name):** **Datify AI Agent** (dòng phụ: *Trading AI Agent*).
> - **Tên định danh nội bộ (Internal Package & Directory):** Giữ nguyên `pixel-trading-agent` để đảm bảo tương thích hoàn hảo cho các script tự động hóa, quy trình đóng gói và hồ sơ nghiệm thu.

Dự án đồ án tốt nghiệp hướng tới tính ổn định, chặt chẽ, kiểm soát chặt chẽ bằng con người thông qua **2 Cổng duyệt bắt buộc** và cơ chế phòng vệ chống lỗi.

> **Kiến trúc P0.5:** **Browser-First + Vercel Serverless Gateway**. Toàn bộ tính toán và quản lý phiên chạy trực tiếp trong bộ nhớ tab trình duyệt / Web Worker. Vercel chỉ đóng vai trò phân phát trang tĩnh và chạy cổng AI bảo mật (không lộ khóa API, xoay vòng 2 slot khóa).

---

## 1. Yêu cầu hệ thống

- **Hệ điều hành:** Windows 10/11, macOS, hoặc Linux
- **Node.js:** 20 trở lên (khuyên dùng Node 20 LTS, xem `.nvmrc`)
- **Trình quản lý gói:** `npm` 10+
- *(Hoàn toàn không yêu cầu Python, SQLite hay cơ sở dữ liệu bên ngoài)*

---

## 2. Hướng dẫn chạy một lệnh

### Cách 1: Sử dụng script tự động
- **Trên Windows:**
  Nháy đúp vào `start.bat` hoặc chạy trong Command Prompt / PowerShell:
  ```cmd
  start.bat
  ```
  Script sẽ tự động kiểm tra Node.js, cài đặt thư viện (`npm install`) nếu chưa có, build bản phân phối nếu thiếu và khởi chạy ứng dụng tại `http://localhost:8000`, đồng thời tự mở trình duyệt mặc định.

- **Trên Linux/macOS:**
  ```bash
  chmod +x start.sh
  ./start.sh
  ```

### Cách 2: Khởi chạy bằng npm
```bash
# Cài đặt phụ thuộc (lần đầu tiên)
npm install

# Chạy bản xem trước cục bộ (cổng 8000, có mô phỏng cổng AI)
npm start
```

### Chế độ phát triển (Development Mode)
```bash
# Khởi chạy Vite dev server với Hot Module Replacement
npm run dev
```
Truy cập `http://localhost:5173`. Plugin `vercelApiSimulationPlugin` trong `vite.config.ts` sẽ tự động mô phỏng các endpoint `/api/health` và `/api/ai` từ file `.env.local` mà không nhúng khóa vào bundle client.

---

## 3. Cấu hình khóa API AI (Tùy chọn)

Ứng dụng **vẫn hoạt động 100% đầy đủ** ở chế độ dự phòng (Fallback) khi chưa có khóa API.

Để kích hoạt tính năng phân tích bằng AI Gemini:
1. Sao chép `.env.example` thành `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Điền khóa Google Gemini vào một hoặc cả hai slot:
   ```env
   GEMINI_API_KEY_1=AIzaSy...
   GEMINI_API_KEY_2=AIzaSy...
   GEMINI_MODEL=gemini-3.5-flash-lite
   GEMINI_MODEL_FALLBACK=gemini-3.8-flash
   GEMINI_THINKING_LEVEL=minimal
   GEMINI_THINKING_LEVEL_REPORT=low
   ```
3. Khởi động lại `npm start` hoặc `npm run dev`. Cổng AI sẽ tự động kích hoạt chế độ `ai_active`.

---

## 4. Kiểm thử tự động (Automated Verification)

Hệ thống được bảo vệ bởi bộ kiểm thử tự động toàn diện:

### Chạy toàn bộ Unit & Integration Tests (Vitest)
```bash
npm test
```
Chạy 270 bài kiểm tra (35 file test) bao phủ:
- Toàn bộ 55 test cases nạp file (S1 đến S6) khớp `MANIFEST.json`.
- Kiểm tra tính bất biến múi giờ (`npm run test:tz` giữa `Asia/Ho_Chi_Minh` và `America/Los_Angeles`).
- Benchmark hiệu năng nạp file (`npm run bench:upload` cho 10k, 25k, 50k, 100k dòng).
- Toàn bộ 6 thao tác làm sạch dữ liệu, thuật toán MAD phát hiện dị biệt, tính toàn vẹn của mã băm SHA-256 chính quy (`cleaner.test.ts`).
- Bộ giải thích AI cho đề xuất làm sạch với bộ lọc kiểm tra số (number allowlist) và cấm khuyến nghị đầu tư (`cleaningExplainer.test.ts`).
- Giao diện Cổng duyệt 1: Bảng hồ sơ dữ liệu, bảng đối chiếu Trước/Sau, hộp thoại xác nhận duyệt (`CleanPage.test.tsx`).
- Máy trạng thái 6 mức và quy tắc vô hiệu hóa downstream.
- Nhật ký kiểm toán bất biến (monotonic ID, ISO UTC, hash SHA-256).
- Hợp đồng Zod schemas & xử lý lỗi AppError che giấu stack trace.
- Cổng AI Serverless: kiểm tra rate limit, timeout, xoay vòng 2 slot khóa, cooldown 60s khi gặp lỗi 429, fallback model khi 404, schema validation.
- Ranh giới an toàn chỉ-đọc của Trợ lý Chat qua kiểm thử AST tĩnh (`architecture.test.ts`).
- Động cơ thực thi quy trình riêng 13 thao tác thuần túy, thẩm định an toàn và 7 mẫu dựng sẵn (`plan.test.ts`).
- Bảo mật: Quét bundle `dist/` cam kết không rò rỉ khóa bí mật (`check_no_secrets`).
- Điều hướng UI, bảng màu tokens WCAG 2.1 & AAA, các linh kiện Pixel, và trang Nạp Dữ Liệu (`UploadPage.test.tsx`).

### Kiểm tra toàn diện trước khi phát hành (Predeploy Check)
```bash
npm run predeploy
```
Quy trình 6 bước nghiêm ngặt:
1. Kiểm tra không tồn tại file cấm (Python, SQLite, temp).
2. Kiểm tra tính đồng bộ của `package-lock.json`.
3. Kiểm tra kiểu dữ liệu tĩnh (`tsc --noEmit`).
4. Quét bảo mật bundle `dist/` chống rò rỉ khóa API.
5. Thực thi toàn bộ test suite `vitest`.
6. Kiểm tra giới hạn dung lượng bundle.

Khi tất cả đạt yêu cầu, terminal sẽ thông báo:
```
[PREDEPLOY OK] SẴN SÀNG ĐẨY LÊN GIT VÀ DEPLOY VERCEL!
```

---

## 5. Cấu trúc thư mục dự án

```
pixel-trading-agent/
  api/                       # Vercel Serverless Functions
    _lib/                    # Thư viện dùng chung cho serverless gateway
      env.ts                 # Đọc và quản lý 2 slot khóa API
      gemini.ts              # Gọi Gemini REST API, xoay vòng khóa và cooldown
      handler.ts             # Web standard Request/Response handlers
      limits.ts              # Rate limiter, timeout, giới hạn payload 64 KB
      tasks.ts               # Danh mục nhiệm vụ AI (Task Whitelist & JSON schemas)
    ai.ts                    # Serverless endpoint POST /api/ai
    health.ts                # Serverless endpoint GET /api/health
  docs/                      # Tài liệu hệ thống
    CONTRACT.md              # Hợp đồng dữ liệu chung & 7 luật bất biến
    HUONG_DAN_DEPLOY.md      # Hướng dẫn chi tiết triển khai Vercel cho người dùng
    screens/                 # Ảnh chụp màn hình kiểm định (P1, P0.5)
  public/                    # Tài nguyên tĩnh & favicon
  samples/                   # Dữ liệu mẫu kiểm thử giao dịch (.xlsx, .csv)
  scripts/                   # Scripts kiểm tra và khởi chạy
    check_no_secrets.mjs     # Quét bundle dist/ bảo mật
    predeploy_check.mjs      # Kiểm tra 6 bước trước khi deploy
    start_local.mjs          # Khởi chạy preview cục bộ cổng 8000
  src/                       # Mã nguồn ứng dụng (React + TypeScript)
    components/              # UI Kit Pixel Art và linh kiện nghiệp vụ
      layout/                # Topbar, Sidebar, StepperBar, RouteGuard
      pixel/                 # 13 nhóm linh kiện Pixel (Button, Modal, Table...)
    core/                    # Logic thuần (không phụ thuộc React/Network)
      artifacts.ts           # Quản lý artifact dữ liệu lớn trong phiên
      audit.ts               # Nhật ký kiểm toán bất biến
      errors.ts              # AppError và từ điển mã lỗi
      hash.ts                # Hàm băm SHA-256 Web Crypto
      schemas.ts             # Zod schemas khớp CONTRACT.md
      state.ts               # Máy trạng thái 6 mức và ánh xạ trang
    i18n/                    # Toàn bộ văn bản giao diện tiếng Việt
    pages/                   # 8 màn hình chức năng chính
    services/                # Dịch vụ phiên và gọi cổng AI
      aiClient.ts            # Client gọi cổng AI với timeout và parse lỗi
      appConfig.ts           # Cấu hình an toàn phía client
      sessionService.ts      # Quản lý phiên in-memory
      sessionStore.ts        # Lưu trữ phiên tab + cảnh báo beforeunload
    styles/                  # CSS Design tokens & Pixel layout
    types/                   # TypeScript interfaces sinh từ Zod
    workers/                 # Web Worker xử lý tính toán nặng
  .env.example               # Mẫu khai báo biến môi trường
  package.json               # Cấu hình gói và kịch bản npm
  tsconfig.json              # Cấu hình TypeScript nghiêm ngặt
  vercel.json                # Cấu hình triển khai Vercel
  vite.config.ts             # Cấu hình Vite kèm simulator cho API
  README.md                  # Tài liệu hướng dẫn sử dụng
```

---

## 6. Ghi chú kỹ thuật, Thư viện Excel & Benchmark hiệu năng

### 6.1 Lựa chọn mô hình AI (Cập nhật 14/11/2026)
- **Mô hình chính:** **`gemini-3.5-flash-lite`** (Free-tier, hỗ trợ Structured Outputs JSON, tốc độ phản hồi < 1s với `thinking_budget: 0`).
- **Mô hình dự phòng:** **`gemini-3.8-flash`** (Dự phòng khi mô hình chính gặp lỗi 404/503 không phục hồi).
- **Lý do thay đổi:** Theo tài liệu deprecations chính thức từ Google (`ai.google.dev/gemini-api/docs/deprecations`, truy cập 14/11/2026), `gemini-2.0-flash` đã ngừng hoạt động từ ngày 01/06/2026. Do đó hệ thống được nâng cấp lên dòng thế hệ 3 mới nhất với cơ chế chuyển đổi 2 tầng:
  1. *Tầng chuyển đổi mô hình:* Khi mô hình chính trả về 404/Not Found hoặc không tồn tại, gateway tự động gọi mô hình dự phòng trên cùng khóa API.
  2. *Tầng xoay vòng khóa:* Khi gặp mã lỗi HTTP 429 (Rate Limit), khóa hiện tại được đưa vào danh sách cooldown 60 giây và hệ thống chuyển sang khóa slot 2.

### 6.2 Nghiên cứu kỹ thuật thư viện Excel (Kết quả Spike A2)
Hệ thống chạy 100% trong trình duyệt (Web Worker), do đó việc chọn thư viện đọc bảng tính cần thỏa mãn 3 tiêu chí: bảo mật, tốc độ và dung lượng bộ nhớ.
- **Thư viện được chọn:** **`exceljs`** kết hợp với **`fflate`** để quét zip bomb.
- **Lý do không dùng `xlsx` (SheetJS) từ npm:** Gói `xlsx` trên npm công khai đã ngừng cập nhật từ bản 0.18.5, tồn tại nhiều cảnh báo bảo mật CVE (ReDoS, Prototype Pollution), và phiên bản mới yêu cầu cài đặt từ nguồn riêng (`cdn.sheetjs.com`).
- **Cơ chế chống Zip Bomb:** Trước khi chuyển buffer cho `exceljs`, thư viện `fflate` quét nhanh cấu trúc thư mục ZIP bằng hàm `unzipSync(bytes, { filter: () => false })` chỉ đọc header mà không giải nén nội dung vào RAM (chi phí thời gian < 10ms). Nếu tổng dung lượng giải nén vượt quá 200 MB, tệp bị từ chối ngay lập tức với mã lỗi `UPLOAD_CORRUPT` (kèm `details.reason = "zip_bomb"`).

### 6.3 Kết quả Benchmark & Chốt giới hạn an toàn (`npm run bench:upload`)
Đo đạc thực tế trên môi trường máy tính người dùng:
| Kích thước | Tệp CSV (Thời gian) | Tệp XLSX (Thời gian & RAM) |
|---|---|---|
| **10.000 dòng** | 14 ms | 233 ms (+45 MB RAM) |
| **25.000 dòng** | 26 ms | 518 ms (+102 MB RAM) |
| **50.000 dòng** | 46 ms | 1.018 ms (+206 MB RAM) |

**Chốt các giới hạn an toàn cho đồ án:**
- Dung lượng tệp tối đa: `max_file_mb: 5` (5 MB)
- Số dòng tối đa: `max_rows: 50.000` (50.000 dòng giao dịch)
- Số mã tối đa: `max_symbols: 10` (10 mã cổ phiếu)
- Số phiên tối thiểu: `min_sessions: 30` (30 phiên giao dịch)

### 6.4 Chống Formula Injection (CSV Injection)
Trong mọi tác vụ xuất file CSV (báo cáo lỗi thẩm định P2, xuất báo cáo phân tích P5): Bất kỳ ô dữ liệu nào bắt đầu bằng ký tự nguy hiểm (`=`, `+`, `-`, `@`) đều được tự động thêm tiền tố dấu nháy đơn `'` ở phía trước, bảo vệ máy tính hội đồng khi mở tệp bằng Microsoft Excel.

### 6.5 Bảo mật và Riêng tư dữ liệu
- Dữ liệu tài chính chỉ nằm trong bộ nhớ tab của trình duyệt người dùng.
- Khi người dùng đóng hoặc tải lại tab, cảnh báo `beforeunload` sẽ xuất hiện nếu phiên đã có dữ liệu. Sau khi đóng tab, toàn bộ dữ liệu trong bộ nhớ tự động giải phóng hoàn toàn.
- Cổng AI chỉ gửi các đoạn dữ liệu tóm tắt đã được làm sạch và ẩn danh theo task whitelist, tuyệt đối không gửi mã thực thi hay thông tin nhạy cảm.

### 6.6 Hướng dẫn Deploy lên Vercel
Xem hướng dẫn chi tiết từng bước bằng tiếng Việt tại [`docs/HUONG_DAN_DEPLOY.md`](docs/HUONG_DAN_DEPLOY.md).

### 6.7 Bảng Mã Lỗi Cổng AI (LLM Error Codes) & Hướng Dẫn Khắc Phục

Mọi thông báo lỗi liên quan tới Cổng AI đều được hiển thị rõ ràng bằng tiếng Việt kèm mã lỗi kỹ thuật trong dấu ngoặc đơn `(mã LLM_*)`, dòng giải thích nguyên nhân và khuyến nghị xử lý trực quan:

| Mã lỗi | Ý nghĩa | Nguyên nhân | Hướng dẫn khắc phục cho người dùng |
|---|---|---|---|
| **`LLM_NOT_CONFIGURED`** | Chưa cấu hình khóa API | Máy chủ chưa có khóa `GEMINI_API_KEY_1` trong biến môi trường. | Điền khóa vào `.env.local` (chạy máy tính) hoặc Vercel Environment Variables rồi Redeploy. |
| **`LLM_BAD_INPUT`** | Yêu cầu gửi tới AI không hợp lệ | Tham số đầu vào thiếu trường bắt buộc hoặc sai quy cách hợp đồng. | Làm mới trang web (`F5`) để tải cấu trúc mới nhất; kiểm tra danh sách trường lỗi hiển thị trên bảng. |
| **`LLM_BAD_OUTPUT`** | Phản hồi AI không đúng chuẩn | Mô hình AI trả về JSON sai cú pháp hoặc vi phạm kiểm chứng số liệu. | Bấm thử lại; hệ thống tự động thế bằng mẫu câu dự phòng đã kiểm chứng đạt 100%. |
| **`LLM_RATE_LIMITED`** | Vượt quá hạn mức gọi AI | Đạt trần 15 yêu cầu/phút của gói Gemini miễn phí. | Đợi khoảng 60 giây hoặc cấu hình thêm Khóa dự phòng thứ 2 (`GEMINI_API_KEY_2`). |
| **`LLM_TIMEOUT`** | Quá thời gian chờ (50 giây) | AI phản hồi quá chậm do đường truyền hoặc máy chủ Google nghẽn. | Kiểm tra lại Internet hoặc thử lại sau 1-2 phút. |
| **`LLM_MODEL_UNAVAILABLE`** | Mô hình AI không khả dụng | Tên mô hình trong `GEMINI_MODEL` không hỗ trợ hoặc bị ngắt tạm thời. | Kiểm tra lại tên mô hình cấu hình hoặc để hệ thống tự chuyển sang mô hình dự phòng `gemini-3.8-flash`. |
| **`LLM_PAYLOAD_TOO_LARGE`** | Dữ liệu vượt dung lượng (>64 KB) | Gói tin tóm tắt gửi lên vượt quá giới hạn an toàn. | Giảm số lượng mã cổ phiếu chọn cùng lúc hoặc rút ngắn khoảng thời gian khảo sát. |
| **`LLM_UNKNOWN_TASK`** | Tác vụ AI không được hỗ trợ | Tên tác vụ gửi lên không thuộc 5 tác vụ được phép. | Xóa cache trình duyệt hoặc khởi động lại ứng dụng. |
| **`LLM_UPSTREAM_ERROR`** | Sự cố từ máy chủ Google (5xx) | Gián đoạn tạm thời từ hạ tầng Google Cloud / Gemini API. | Đợi 1-2 phút rồi bấm kiểm tra kết nối lại. |

### 6.8 Tối ưu Độ trễ & Mức suy nghĩ (Thinking Config) theo Tài liệu Chính thức Google Gemini

#### 6.8.1 Cơ sở Tài liệu Chính thức từ Google (`ai.google.dev`)
- **Tài liệu tham chiếu:**
  1. *Gemini Thinking Guide:* [https://ai.google.dev/gemini-api/docs/thinking](https://ai.google.dev/gemini-api/docs/thinking)
  2. *Gemini REST API Reference (`generateContent`):* [https://ai.google.dev/api/generate-content](https://ai.google.dev/api/generate-content)
  3. *Gemini Models Reference:* [https://ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)
- **Thời điểm tra cứu:** `15/11/2026`
- **Trích đoạn tài liệu chuẩn:**
  > *"For reasoning-capable Gemini models, internal reasoning depth is controlled via `thinkingConfig` within `generationConfig`. The `thinkingLevel` parameter sets the reasoning intensity (`minimal`, `low`, `medium`, `high`)."*
  > *"When `thinkingLevel` is omitted, models default to `high`, dedicating significant internal deliberation tokens before generating the response text."*
  > *"The numeric `thinking_budget` is deprecated for Gemini 3 series in favor of discrete `thinkingLevel` strings. Do not pass both parameters simultaneously."*
  > *"Response token tracking surfaces internal thinking tokens in `usageMetadata.thoughtsTokenCount` alongside `usageMetadata.candidatesTokenCount`."*

#### 6.8.2 Vị trí JSON và Giá trị Hợp lệ
- **Vị trí trong thân HTTP POST:** `generationConfig.thinkingConfig.thinkingLevel` (lưu ý: phải viết đúng lạc đà `camelCase` theo chuẩn REST Protobuf của Google).
- **Cấu trúc JSON gửi đi:**
  ```json
  {
    "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
    "generationConfig": {
      "temperature": 0.2,
      "maxOutputTokens": 2048,
      "responseMimeType": "application/json",
      "thinkingConfig": {
        "thinkingLevel": "minimal"
      }
    }
  }
  ```
- **Các giá trị hợp lệ:**
  - `"minimal"`: Sử dụng số lượng token suy nghĩ tối thiểu để phản hồi tức thì (near-zero deliberation). Phù hợp nhất cho các tác vụ nhanh: `ping`, `explain_cleaning`, `chat_explain`, `plan_custom`.
  - `"low"`: Quá trình suy nghĩ ngắn, giảm đáng kể độ trễ và chi phí token nhưng vẫn đảm bảo tính chặt chẽ. Áp dụng mặc định cho `write_report`.
  - `"medium"`: Cân bằng giữa độ sâu suy nghĩ và thời gian phản hồi.
  - `"high"`: Mức suy nghĩ sâu tối đa (đây là mức mặc định của Google nếu không cấu hình, chính là lý do ban đầu gây trễ tới 11.3 giây cho lệnh ping).

#### 6.8.3 Biến Môi trường Điều khiển Mức Suy nghĩ
Hệ thống cho phép tùy chỉnh linh hoạt qua biến môi trường:
- `GEMINI_THINKING_LEVEL`: Mặc định là `"minimal"` áp dụng cho 4 tác vụ nhanh (`ping`, `explain_cleaning`, `chat_explain`, `plan_custom`).
- `GEMINI_THINKING_LEVEL_REPORT`: Mặc định là `"low"` áp dụng riêng cho tác vụ sinh nhận định báo cáo (`write_report`).
- **Phòng thủ dữ liệu sai:** Nếu người dùng cấu hình giá trị không hợp lệ (ví dụ gõ sai chính tả), hệ thống sẽ in cảnh báo lúc khởi động (không in khóa API) và tự động rơi về mức mặc định an toàn.
- **Không bao giờ gửi đồng thời:** Hệ thống cam kết không bao giờ gửi đồng thời `thinking_level` và `thinking_budget`, tránh lỗi 400.

#### 6.8.4 Cơ chế Tự Phục Hồi Lỗi (Fault-Tolerance Retry)
Nếu một mô hình trả về lỗi HTTP 400 kèm thông điệp báo không hỗ trợ trường suy nghĩ (ví dụ mô hình cũ không hỗ trợ `thinkingLevel`):
1. Hệ thống tự động bắt lỗi và thử lại **ĐÚNG MỘT LẦN** không kèm khối `thinkingConfig` (giữ nguyên cùng khóa, cùng mô hình).
2. Ghi nhật ký cảnh báo an toàn: `[AI Gateway] Model ... không hỗ trợ trường suy nghĩ. Thử lại đúng một lần không kèm trường suy nghĩ.`
3. Nếu vẫn không thành công, hệ thống tiếp tục cơ chế chuyển mô hình dự phòng (`gemini-3.8-flash`) và chuyển khóa dự phòng (`Key Slot 2`) như bình thường, tuyệt đối không lặp vô hạn.

#### 6.8.5 Bảng Timeout Theo Từng Tác vụ (Task Timeout Policy)
Để đảm bảo trải nghiệm người dùng và không vượt quá giới hạn thực thi `maxDuration: 60s` của Vercel Serverless Function:

| Tác vụ AI | Thời gian chờ mỗi khóa (Key Timeout) | Thời gian chờ tối đa máy chủ (Total Timeout) | Thời gian chờ trình duyệt (Client Timeout) | Mức suy nghĩ mặc định |
|:---|:---:|:---:|:---:|:---:|
| **`ping`** | 15 giây | 25 giây | 28 giây | `minimal` |
| **`chat_explain`** | 15 giây | 25 giây | 28 giây | `minimal` |
| **`explain_cleaning`** | 15 giây | 25 giây | 28 giây | `minimal` |
| **`plan_custom`** | 15 giây | 25 giây | 28 giây | `minimal` |
| **`write_report`** | 35 giây | 55 giây | 58 giây | `low` |

*(Tổng thời gian tối đa trên máy chủ 55 giây hoàn toàn nằm trong giới hạn 60 giây của hàm Vercel Serverless, đảm bảo máy chủ luôn trả về lỗi JSON `LLM_TIMEOUT` có cấu trúc trước khi Vercel ngắt kết nối).*

---

## 7. Quy trình Làm sạch Dữ liệu & Cổng duyệt 1 (Prompt P3)

### 7.1 Toán học phát hiện Điểm dị biệt (MAD - Median Absolute Deviation)
- Chuỗi lợi suất logarit theo thời gian cho từng mã:
  $$r_t = \ln\left(\frac{P_t}{P_{t-1}}\right)$$
- Độ lệch tuyệt đối trung vị (MAD):
  $$\text{MAD} = \text{median}\left(|r_t - \text{median}(r)|\right)$$
- Z-score chuẩn hóa theo phân phối chuẩn:
  $$z_t = \frac{|r_t - \text{median}(r)|}{1.4826 \times \text{MAD}}$$
- **Điều kiện kép phát hiện dị biệt:**
  $$z_t > 6.0 \quad \text{VÀ} \quad |r_t| \ge 10\%$$
  *(Điều kiện kép giúp triệt tiêu hoàn toàn hiện tượng báo động giả trong các giai đoạn cổ phiếu đi ngang có biến động nền cực thấp)*

### 7.2 Danh sách trắng 6 thao tác làm sạch (Allowlist Ops)
1. `drop_exact_duplicates`: Xóa dòng trùng lặp hoàn toàn trên mọi cột, giữ lại dòng đầu tiên.
2. `drop_rows_missing_ohlc`: Xóa dòng thiếu bất kỳ mức giá nào trong bộ Open / High / Low / Close.
3. `fill_missing_volume_zero`: Điền khối lượng bằng 0 cho các ô khối lượng bị khuyết thiếu (NaN).
4. `flag_outliers`: Đánh dấu cờ dị biệt theo thuật toán MAD (không xóa dòng).
5. `drop_flagged_outliers`: Xóa các dòng đã bị đánh dấu dị biệt (mặc định TẮT).
6. `sort_by_symbol_date`: Sắp xếp ổn định theo Mã chứng khoán rồi theo Ngày tăng dần (BẮT BUỘC, luôn chạy).

### 7.3 Ràng buộc sau làm sạch (Post-Clean Constraints)
- **Tối thiểu 30 phiên giao dịch:** Sau khi áp dụng các thao tác đã bật, mỗi mã cổ phiếu còn lại trong tập dữ liệu bắt buộc phải có $\ge 30$ phiên.
- **Bảo vệ Cổng duyệt 1:** Nếu có bất kỳ mã nào còn $< 30$ phiên, hệ thống sẽ hiển thị cảnh báo vi phạm màu đỏ, chỉ rõ thao tác gây vi phạm và **vô hiệu hóa nút Duyệt**, ngăn người dùng vô tình phê duyệt tập dữ liệu không đủ điều kiện phân tích định lượng.

### 7.4 Cổng duyệt 1 & Mã băm chính quy (Canonical SHA-256)
- Phê duyệt Cổng 1 yêu cầu người dùng nhập tên người duyệt (`reviewer_name`).
- Dữ liệu thô gốc `raw` tuyệt đối không bị thay đổi (bảo toàn nguyên vẹn cho tính năng Làm sạch lại).
- Dữ liệu sạch được lưu dưới dạng artifact có phiên bản `clean_v1`, `clean_v2`... kèm mã băm SHA-256 chính quy được tính tuần tự từ `symbols`, `symbol_idx`, `date_days`, `open`, `high`, `low`, `close`, `volume` độc lập với thứ tự key trong JSON hay môi trường chạy.

### 7.5 Hiệu năng làm sạch đo đạc thực tế
- Với **50.000 dòng**: Toàn bộ quá trình tính Hồ sơ + Đề xuất + Diff Pipeline + Băm SHA-256 hoàn thành chỉ trong **665 ms** (chuẩn yêu cầu $< 2.000$ ms).
- RAM tăng: **+12.9 MB** (chuẩn yêu cầu $< 120$ MB).
- Khựng giao diện người dùng (Main-thread long task): **0 ms** nhờ chạy trên Web Worker chuyên biệt.

---

## 8. Phân tích Định lượng, Thẻ KPI & Biểu đồ Excel (Prompt P4)

### 8.1 17 Chỉ số Định lượng Độc lập (Zero AI Calculation)
Mọi chỉ số đều được tính toán 100% bằng code TypeScript trong Web Worker (`src/workers/analysis.worker.ts`):
1. **Số phiên (`sessions`)**: Số phiên giao dịch hợp lệ.
2. **Giá cuối kỳ (`last_close`)**: Giá đóng cửa phiên giao dịch gần nhất.
3. **Lợi suất cả kỳ (`period_return`)**: $(P_{\text{end}} - P_{\text{start}}) / P_{\text{start}}$.
4. **Biến động năm hóa (`ann_vol`)**: $\text{std}(r_t) \times \sqrt{252}$.
5. **Chỉ số Sharpe (`sharpe`)**: $\frac{\text{mean}(r_t) - R_f}{\text{std}(r_t)} \times \sqrt{252}$ với giả định bắt buộc **lãi suất phi rủi ro $R_f = 0$**.
6. **Sụt giảm tối đa (`max_dd`)**: $\min((P_t - \text{peak}_t) / \text{peak}_t)$.
7. **Tỷ lệ phiên tăng (`win_rate`)**: $\frac{\text{Số ngày } r_t > 0}{\text{Tổng số phiên có lợi suất}}$.
8. **Biên độ dao động TB (`avg_range`)**: $\text{mean}\left(\frac{H_t - L_t}{C_t}\right)$.
9. **Khối lượng TB (`avg_volume`)**: Trung bình cộng khối lượng giao dịch.
10. **Số phiên đột biến KL (`volume_spike_days`)**: $V_t > \text{mean}_{20} + 2 \times \text{std}_{20}$ (20 phiên trước đó).
11. **Đường MA20 (`ma20`)**: Giá trung bình 20 phiên gần nhất.
12. **Đường MA50 (`ma50`)**: Giá trung bình 50 phiên gần nhất.
13. **Vị thế MA (`ma_state`)**: Chỉ nhận 1 trong 3 giá trị: `"MA20 trên MA50"`, `"MA20 dưới MA50"`, `"MA20 bằng MA50"`.
14. **Chỉ số RSI 14 (`rsi14`)**: Công thức Wilder RSI chuẩn 14 phiên.
15. **Phiên tăng mạnh nhất (`best_day`)**: $\max(r_t)$.
16. **Phiên giảm mạnh nhất (`worst_day`)**: $\min(r_t)$.
17. **Chỉ số so sánh danh mục đa mã**: `symbol_returns`, `correlation` ($\ge 20$ phiên chung), `normalized_base` (mốc 100), `volume_share`, `risk_return`.

### 8.2 Kiểm chứng Độc lập & Khớp chuẩn Excel 100%
Script kiểm chứng độc lập hoàn toàn tách biệt với mã nguồn ứng dụng:
```bash
npm run verify:metrics
```
Kiểm tra 100% công thức tính toán đối chiếu với công thức chuẩn Microsoft Excel (`AVERAGE`, `STDEV.S`, `COUNTIF`, `SUMPRODUCT`, `MIN`, `MAX`) trên cả 3 mã TMA, TMB, TMC. Chi tiết xem tại [`docs/KIEM_CHUNG_CHI_SO.md`](docs/KIEM_CHUNG_CHI_SO.md).

---

## 9. Nhận định AI, Động cơ Kiểm chứng Số liệu, Cổng duyệt 2 & Xuất File (Prompt P5)

### 9.1 Nguyên tắc Nhận định AI & Nhiệm vụ Vercel AI Gateway (`write_report`)
- **Tuyệt đối không tính toán:** AI không được tự ý tính số mới, không tính tỷ lệ, không làm tròn lệch chuẩn `display`.
- **Cấm hoàn toàn:** Không khuyến nghị đầu tư, không khuyên mua/bán/nắm giữ, không đưa giá mục tiêu, không dự đoán xu hướng tương lai, không giải thích nguyên nhân bằng tin tức/vĩ mô ngoài tập dữ liệu, không dùng tiếng Anh, không dùng cụm từ sáo rỗng.
- **Ràng buộc căn cứ (Evidence Keys):** Mỗi đoạn văn phải khai báo mảng `evidence` chứa các khóa hợp lệ (`m:id:symbol`, `c:id:symbol`). Mọi con số trong lời văn bắt buộc phải có căn cứ trong mảng `evidence` của đoạn văn đó.
- **Cơ chế thử lại kép (Dual Retry):** Khi AI sinh câu văn có số liệu không khớp hoặc vi phạm căn cứ, hệ thống tự động gửi yêu cầu sửa (`fix_issues`) kèm vị trí và lý do lỗi. Nếu sau 1 lần sửa vẫn không đạt chuẩn, hệ thống tự động thế đoạn văn đó bằng mẫu câu dự phòng đã được kiểm chứng đạt chuẩn 100% (`templates.ts`).

### 9.2 Động cơ Kiểm chứng Đối chiếu Số liệu Thuần TypeScript (`src/core/narrative/check.ts`)
- Chạy 100% trong trình duyệt, không phụ thuộc DOM, UI hay LLM.
- Trích xuất tự động mọi số tự nhiên tiếng Việt, số thập phân (dấu phẩy), phần trăm, ngày tháng (`DD/MM/YYYY`).
- So khớp với dung sai tương đối $\le 0.5\%$ hoặc sai số làm tròn số nguyên $\le 1$.
- Các mã lỗi kiểm tra:
  - `NOT_IN_DATA`: Con số không tồn tại trong bất kỳ chỉ số nào của kỳ phân tích (ảo giác số liệu).
  - `NOT_IN_EVIDENCE`: Con số có trong dữ liệu nhưng không được khai báo trong `evidence` của đoạn văn.
  - `BAD_EVIDENCE_KEY`: Khóa căn cứ không có trong danh mục chỉ số hay biểu đồ.
  - `FORBIDDEN_PHRASE`: Chứa từ ngữ cấm (khuyên mua bán, dự đoán, hứa hẹn lợi nhuận...).
  - `EMPTY`: Đoạn văn trống rỗng.

### 9.3 Cổng duyệt 2 của Con người & Mã băm Báo cáo (`report_hash`)
- **Điều kiện mở khóa phê duyệt:**
  1. Người duyệt nhập họ tên hợp lệ ($1 \le \text{length} \le 60$).
  2. Báo cáo có 0 lỗi số liệu (tất cả các đoạn văn đều vượt qua kiểm tra).
  3. Báo cáo không bị cũ (stale) so với kết quả phân tích hiện tại (`report.analysis_hash === analysis.analysis_hash`).
- **Mã băm báo cáo bất biến:** Khi duyệt, hệ thống tính mã băm SHA-256 từ chuỗi JSON chính quy:
  $$\text{report\_hash} = \text{SHA-256}\left(\text{canonicalJson}\left(\{\text{clean\_hash}, \text{analysis\_hash}, \text{narrative}, \text{reviewer\_name}\}\right)\right)$$
- Đóng dấu cao su Pixel Art **"ĐÃ DUYỆT"** kèm thời gian UTC và mở khóa tính năng xuất PDF và Excel.
- Nếu người dùng chỉnh sửa nội dung hoặc phân tích lại, dấu duyệt sẽ tự động được gỡ bỏ và yêu cầu phê duyệt lại tại Cổng 2.

### 9.4 Xuất Tệp Excel (.xlsx) 8 Sheet Kiểm chứng Đối chiếu
Tệp Excel được tạo bởi thư viện `exceljs` bao gồm tối đa 8 sheet:
1. **`Tóm tắt`**: Thông tin tệp nguồn, kỳ phân tích, danh mục mã, trạng thái duyệt, người duyệt, `clean_hash`, `analysis_hash`, `report_hash`, giả định và miễn trừ trách nhiệm.
2. **`Chỉ số`**: Toàn bộ chỉ số của các mã kèm công thức toán và giải thích ý nghĩa.
3. **`Dữ liệu sạch`**: Bảng dữ liệu OHLCV sạch được dùng để tính toán.
4. **`Số liệu biểu đồ`**: Bảng dữ liệu nguồn dạng số cho từng biểu đồ (đáp ứng tiêu chuẩn kiểm định).
5. **`Nhận định`**: Toàn văn các mục nhận định kèm phân loại nguồn (AI, Mẫu câu, Đã sửa) và căn cứ.
6. **`Nhật ký`**: Lịch sử kiểm toán (Audit Trail) của toàn bộ phiên làm việc.
7. **`Kiểm chứng`**: **Trực tiếp chứa các công thức Excel sống** (`AVERAGE`, `STDEV.S`, `SQRT`, `COUNT`, `MIN`, `MAX`) tham chiếu sang sheet *Dữ liệu sạch*, tự động tính lại các chỉ số và có cột *So khớp* bằng công thức sống `=IF(F{r}<=1E-9*MAX(1,ABS(E{r})), "Khớp", "Lệch")` để Hội đồng đối chiếu trực tiếp.
8. **`Phân tích riêng`** *(Tự động xuất hiện khi có quy trình riêng được thực thi)*: Lưu kết quả bảng tính của tối đa 3 quy trình phân tích riêng tùy biến với kiểu số chuẩn và tiêu đề rõ ràng.
- **Phòng thủ chèn công thức (Formula Injection Defense):** Mọi chuỗi ký tự do người dùng nhập hoặc AI sinh bắt đầu bằng `=`, `+`, `-`, `@` đều được thêm dấu nháy đơn `'` ở đầu.

### 9.5 Xuất PDF Chuẩn A4 Qua Bảng Kiểu In (`@media print`)
- Bấm **"Xuất PDF"** sẽ gọi lệnh in chuẩn của trình duyệt (`window.print()`).
- Sử dụng bảng kiểu `@page { size: A4 portrait; margin: 12mm 15mm; }`.
- Tự động ẩn sidebar, thanh bước stepper, chat dock, nút thao tác và ô nhập liệu.
- Hiển thị banner đầu trang in chuyên nghiệp (`PrintHeader.tsx`) kèm con dấu pixel "ĐÃ DUYỆT".
- Biểu đồ ECharts render dạng SVG vector sắc nét trên trang in.
- Phần nhận định văn bản tự động chuyển sang phông chữ trang trọng **Times New Roman** (`--font-analysis`).
- Thiết lập `break-inside: avoid` cho từng bảng thẻ KPI và biểu đồ, tránh hiện tượng gãy đôi trang khi in.

---

## 10. Trợ lý Chat Chỉ-đọc & Ranh giới An toàn Kiến trúc (Prompt P6)

### 10.1 Khung Trợ lý Pixel (`ChatDock.tsx`)
- Nằm cố định ở góc dưới bên phải màn hình, có thể thu gọn hoặc mở rộng với phong cách Pixel Art đặc trưng.
- Đạt chuẩn tương phản cao WCAG, có huy hiệu trạng thái an toàn `CHỈ-ĐỌC`.
- Tự động gợi ý các câu hỏi thông minh theo ngữ cảnh trang hiện tại (Upload, Clean, Analyze, Report, Config).
- Trang bị nút Dừng phản hồi (`Dừng`), nút Xóa lịch sử hội thoại, cơ chế Rate Limit 2 giây giữa các lần gửi và giới hạn tối đa 50 tin nhắn trong một phiên làm việc.

### 10.2 Kiến trúc Xử lý 3 Tầng An toàn
1. **Tầng 1 - Bộ lọc an toàn (Guard):**
   - Chặn tuyệt đối mọi nỗ lực sửa đổi trạng thái: *"đổi giá", "thay đổi dữ liệu", "xóa báo cáo"*.
   - Chặn các câu hỏi dự đoán tương lai, khuyến nghị tài chính, hoặc bẻ khóa vượt quyền (Jailbreak).
   - Từ chối lịch sự, nêu rõ lý do từ chối và hướng dẫn người dùng quay lại các chức năng an toàn.
2. **Tầng 2 - Động cơ phản hồi cục bộ (Local Fast Engine):**
   - Trả lời siêu tốc (< 10ms) không cần kết nối mạng đối với các câu hỏi về:
     - Hướng dẫn sử dụng và định hướng luồng ứng dụng (`appGuide.ts`).
     - Tra cứu công thức, ý nghĩa, và chi tiết các bước tính toán của chỉ số tài chính (`meaning_vi`, `formula_vi`, `calc`).
     - Giải thích nguyên nhân và cách khắc phục khi tệp nạp vào bị từ chối (`last_rejection`).
3. **Tầng 3 - Cổng AI Gemini có kiểm chứng (`chat_explain`):**
   - Khi có cấu hình API key và câu hỏi mang tính phân tích tổng hợp, Cổng AI sẽ giải thích dựa trên ngữ cảnh phiên làm việc.
   - Toàn bộ con số do AI đưa ra đều phải vượt qua bộ kiểm chứng đối chiếu số liệu khắt khe trước khi hiển thị cho người dùng, kèm các chip dẫn chứng có thể bấm để cuộn đến chỉ số tương ứng.

### 10.3 Kiểm thử Ranh giới Kiến trúc Tĩnh (AST Tests)
Kiểm thử `architecture.test.ts` tự động phân tích cây cú pháp Abstract Syntax Tree (AST) của toàn bộ module chat (`src/core/chat/`, `src/agent/chat.ts`, `src/components/layout/ChatDock.tsx`):
- Đảm bảo **100% KHÔNG có import** các hàm ghi dữ liệu (`setState`, `delete`, `setRecord`, `reclean`, `runClean`, v.v.).
- Bảo đảm ranh giới an toàn chỉ-đọc được thực thi bằng kiến trúc hệ thống, không chỉ dựa vào câu lệnh dặn dò prompt (Prompt Engineering).

---

## 11. Quy trình Phân tích Riêng Dùng Một Lần & Động cơ Thực thi (Prompt P6)

### 11.1 Nguyên tắc Không chạy Code AI (Zero Code Execution)
- AI **hoàn toàn không được phép sinh code** (Python, JavaScript, Shell, SQL).
- Ứng dụng **tuyệt đối không sử dụng `eval()`, `Function()`, hay bất kỳ cơ chế chạy mã động nào**.
- AI chỉ được phép lập kế hoạch (`Plan`) bằng cách chọn các bước tuần tự từ **danh mục trắng 13 thao tác** do hệ thống định nghĩa sẵn.

### 11.2 Danh mục 13 Thao tác Cho phép (`src/core/plan/ops/`)
1. `filter_rows`: Lọc dòng theo điều kiện so sánh chuẩn.
2. `sort_rows`: Sắp xếp bảng theo cột (tăng/giảm).
3. `slice_rows`: Lấy các dòng đầu, dòng cuối, hoặc khoảng dòng.
4. `project_columns`: Chọn lọc danh sách cột hiển thị.
5. `add_column_derived`: Thêm cột tính toán theo phép toán số học an toàn (`+`, `-`, `*`, `/`, `abs`, `log`, `sqrt`, `round`).
6. `group_aggregate`: Gom nhóm theo mã hoặc cột và tính tổng hợp (`mean`, `sum`, `min`, `max`, `count`, `std`).
7. `pivot_wider`: Chuyển đổi bảng dạng dọc sang bảng ngang.
8. `compute_rolling`: Tính chỉ số trượt (SMA, Rolling Volatility, v.v.).
9. `compute_cross_stat`: Tính toán tương quan hoặc hiệp phương sai giữa các cặp mã.
10. `compute_drawdown_series`: Tính chuỗi sụt giảm từ đỉnh và Max Drawdown.
11. `rank_symbols`: Xếp hạng các mã cổ phiếu theo tiêu chí định lượng.
12. `make_table`: Thao tác kết thúc tạo bảng kết quả.
13. `make_chart`: Thao tác kết thúc tạo biểu đồ trực quan hóa.

### 11.3 Thẩm định Kế hoạch & Thực thi Cô lập
- **Thẩm định kế hoạch (`validatePlan`):** Bắt buộc kế hoạch phải hợp lệ về cú pháp, có tối đa 8 bước, và bước cuối cùng bắt buộc phải là `make_table` hoặc `make_chart`.
- **7 Mẫu quy trình dựng sẵn (`templates.ts`):** Cung cấp sẵn các mẫu phân tích thông dụng (Lọc top phiên biến động mạnh nhất, So sánh khối lượng trung bình giữa các mã, Tương quan chuỗi lợi suất, v.v.) hoạt động trơn tru ngay cả khi không có AI.
- **Thực thi trong Web Worker (`plan.worker.ts`):** Toàn bộ phép tính trên dữ liệu lớn chạy trong luồng nền Web Worker, truyền kết quả an toàn và hiển thị thanh tiến độ từng bước trực quan.
- **Lưu trữ & Tích hợp Báo cáo:** Lưu tối đa 3 kết quả (`custom_1`, `custom_2`, `custom_3`) trong kho artifact, tự động tích hợp vào trang Báo cáo, bản in A4, và Sheet 8 trong tệp Excel xuất bản.

---

## 12. Bộ công cụ Chẩn đoán AI & Hướng dẫn Kiểm tra AI Thật (Prompt P6)

- **Bảng Chẩn đoán AI 5 Tác vụ (`AiDiagnosticsPanel.tsx`):** Tích hợp trực tiếp tại trang Cấu hình, cho phép kiểm tra độc lập và đồng thời cả 5 tác vụ AI (`ping`, `explain_cleaning`, `write_report`, `chat_explain`, `plan_custom`), hiển thị chi tiết trạng thái, mô hình xử lý, độ trễ và lý do lỗi.
- **Nút Sao chép Báo cáo Chẩn đoán:** Cho phép người dùng một chạm sao chép toàn bộ kết quả chẩn đoán an toàn (không lộ khóa API) để gửi hỗ trợ kỹ thuật.
- **Tài liệu Hướng dẫn Kiểm tra AI Thật trong 10 phút:** Xem chi tiết tại [`docs/KIEM_TRA_AI_THAT.md`](docs/KIEM_TRA_AI_THAT.md).

---

## 13. Bộ Tài Liệu Chuẩn Bị Cho Buổi Bảo Vệ Đồ Án (Prompt P7 - v1.0.0)

Hệ thống tài liệu và hướng dẫn chuyên sâu phục vụ buổi bảo vệ đồ án tốt nghiệp trước Hội đồng:

1. **[Kịch bản Thuyết trình và Demo 15 phút](docs/KICH_BAN_DEMO.md):** Phân bổ thời lượng từng phút, hành động bấm chuột, lời thoại thuyết trình và phương án phòng thủ khi gặp bẫy của Hội đồng.
2. **[Bộ 25+ Câu hỏi và Trả lời Bảo vệ](docs/CAU_HOI_HOI_DONG.md):** Giải đáp chi tiết các khía cạnh về kiến trúc, toán tài chính, bảo mật AI, chuỗi băm mật mã và kiểm thử.
3. **[Kiến trúc và Ma trận Truy vết Bảo mật](docs/KIEN_TRUC_VA_BAO_MAT.md):** Ma trận truy vết chi tiết chứng minh 7 Luật bất biến từ Đặc tả → Kiến trúc → File code → Bài test tự động.
4. **[Danh sách Cần Kiểm tra Trước Ngày Bảo vệ](docs/DANH_SACH_TRUOC_NGAY_BAO_VE.md):** Checklist thiết bị, mạng, khóa API, tệp mẫu và phương án dự phòng (T-24h và T-60m).
5. **[Quy trình Kiểm tra Sau khi Deploy Vercel](docs/KIEM_TRA_SAU_DEPLOY.md):** 10 bước kiểm tra kiểm định chất lượng trên đường link web thực tế.
6. **[Hướng dẫn Đẩy Mã Nguồn lên GitHub và Vercel](docs/HUONG_DAN_DAY_LEN_GIT_VA_VERCEL.md):** Hướng dẫn từng bước dành cho người không chuyên lập trình.
7. **[Tài liệu Bằng chứng và Đối chiếu Số học](docs/BANG_CHUNG.md):** Toàn bộ số liệu đối chiếu 100% độc lập, benchmark hiệu năng và băm SHA-256 ảnh chụp.
8. **[Báo cáo Kiểm toán Giao diện (UI Audit)](docs/UI_AUDIT_REPORT.md):** Kết quả kiểm toán tự động trên 3 viewports và 9 tuyến đường bằng Chrome Headless.
9. **[Hợp đồng Hệ thống Khóa Phát hành](docs/CONTRACT.md):** Hợp đồng nền tảng khóa phiên bản v1.0.0.

---

## 14. Tổng hợp Các Lệnh Kiểm thử và Vận hành (v1.0.0)

| Lệnh npm | Chức năng | Ý nghĩa |
|---|---|---|
| `npm start` | Khởi chạy bản xem trước cục bộ (cổng 8000) | Dùng để chạy thử hoặc demo ngoại tuyến |
| `npm test` | Chạy toàn bộ kiểm thử tự động (Vitest) | 40 tệp, 307 ca kiểm thử ALL PASS |
| `npm run predeploy` | Chạy kiểm tra 9 bước trước khi đẩy Git | Quét tệp cấm, bảo mật, tsc, test, build size |
| `npm run e2e` | Kiểm thử đầu-cuối & chụp 12 ảnh FINAL | Xác minh luồng dữ liệu nghiệp vụ và băm ảnh không trùng |
| `npm run chaos` | Kiểm thử hỗn loạn và độ bền bỉ | Thử nghiệm tệp hỏng, click dồn dập, chế độ offline |
| `npm run ui:audit` | Kiểm toán giao diện đa kích thước | Quét 3 viewports x 9 routes tìm lỗi render |
| `npm run evidence` | Sinh tài liệu bằng chứng `BANG_CHUNG.md` | Đối chiếu độc lập toán học và kiểm toán dữ liệu |
| `npm run check:secrets` | Quét rò rỉ khóa bí mật trong `dist/` | Đảm bảo zero key leaks trước khi phát hành |
| `npm run release` | Đóng gói phát hành bản sạch | Tạo file zip và thư mục phát hành không chứa rác |
| `npm run verify:release` | Thẩm định kiểm thử bản đóng gói | Clone sạch sang thư mục tạm và chạy toàn bộ kiểm thử |

