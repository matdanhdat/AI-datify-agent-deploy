import { z } from 'zod';

/**
 * Zod schemas and inferred TypeScript types for Datify AI Agent.
 * Preserves 100% of P0/P1 field names (snake_case) and structures.
 */

// 6.1 Unified Error Response
export const ErrorResponseSchema = z.object({
  code: z.string().describe('Mã lỗi hệ thống (ví dụ: STATE_INVALID, NOT_FOUND)'),
  message_vi: z.string().describe('Thông báo lỗi chi tiết bằng tiếng Việt'),
  details: z.record(z.string(), z.any()).default({}).describe('Chi tiết bổ sung'),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// 6.2 Validation Issue (Used in P2 and beyond)
export const ValidationIssueSchema = z.object({
  code: z.string().describe('Mã lỗi kiểm tra dữ liệu (ví dụ: DATA_BAD_NUMBER)'),
  severity: z.enum(['error', 'warning']).describe('Mức độ nghiêm trọng'),
  sheet: z.string().optional().nullable().describe('Tên bảng tính (sheet)'),
  row: z.number().int().optional().nullable().describe('Chỉ số dòng'),
  column: z.string().optional().nullable().describe('Tên cột nội bộ'),
  value: z.any().optional().nullable().describe('Giá trị gây lỗi'),
  message_vi: z.string().describe('Mô tả lỗi bằng tiếng Việt'),
  fix_vi: z.string().describe('Hướng dẫn khắc phục bằng tiếng Việt'),
  // Optional extension fields for P2
  column_key: z.string().optional().nullable(),
  count: z.number().int().optional().nullable(),
  examples: z.array(z.any()).optional().nullable(),
  details: z.record(z.string(), z.any()).optional().nullable(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// M1: Dataset Kind Profile
export const DatasetKindSchema = z.enum(['trading', 'business']);
export type DatasetKind = z.infer<typeof DatasetKindSchema>;

export const ColumnRoleItemSchema = z.object({
  file_header: z.string(),
  key: z.string(),
  role: z.enum(['id', 'time', 'dimension', 'measure', 'ignored']),
  unit: z.string().optional(),
});
export type ColumnRoleItem = z.infer<typeof ColumnRoleItemSchema>;

// D3 / U2: Business Context & User Analysis Requirements
export const BusinessContextSchema = z.object({
  company_name: z.string().max(80).optional(),
  role: z.string().max(60).optional(),
  extra_info: z.string().max(2000).optional(),
  analysis_questions: z.array(z.string().min(5).max(200)).min(1).max(8),
});
export type BusinessContext = z.infer<typeof BusinessContextSchema>;

// 6.3 Dataset Metadata
export const DatasetMetaSchema = z.object({
  filename: z.string().describe('Tên tệp gốc đã tải lên'),
  rows: z.number().int().describe('Tổng số dòng dữ liệu'),
  symbols: z.array(z.string()).default([]).describe('Danh sách các mã chứng khoán'),
  date_from: z.string().describe('Ngày bắt đầu (ISO 8601 YYYY-MM-DD)'),
  date_to: z.string().describe('Ngày kết thúc (ISO 8601 YYYY-MM-DD)'),
  // M1 Extensions
  kind: DatasetKindSchema.optional(),
  columns_roles: z.array(ColumnRoleItemSchema).optional(),
  time_range: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional()
    .nullable(),
  n_columns: z.number().int().optional(),
  // P2 Extensions
  sha256: z.string().optional().describe('Mã băm SHA-256 của tệp nguồn'),
  source_sheet: z.string().nullable().optional().describe('Tên sheet đã trích xuất'),
  columns_present: z.array(z.string()).optional().describe('Danh sách các cột nhận diện được'),
  optional_columns: z.array(z.string()).optional().describe('Danh sách các cột tùy chọn có mặt'),
  symbol_rows: z.record(z.string(), z.number()).optional().describe('Số dòng theo từng mã'),
  skipped_blank_rows: z.number().int().optional().describe('Số dòng trống đã bỏ qua'),
  warning_count: z.number().int().optional().describe('Tổng số cảnh báo khi nạp'),
});
export type DatasetMeta = z.infer<typeof DatasetMetaSchema>;

// Step definitions
export const StepKeySchema = z.enum(['upload', 'clean', 'review', 'exchange', 'analyze', 'report']);
export type StepKey = z.infer<typeof StepKeySchema>;

export const StepStatusSchema = z.enum(['locked', 'current', 'done']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const StepInfoSchema = z.object({
  key: StepKeySchema,
  label_vi: z.string().describe('Nhãn hiển thị tiếng Việt'),
  status: StepStatusSchema,
});
export type StepInfo = z.infer<typeof StepInfoSchema>;

// Session States
export const SessionStateSchema = z.enum([
  'created',
  'uploaded',
  'cleaning_review',
  'clean_approved',
  'analyzed',
  'report_approved',
]);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const ReportStatusSchema = z.enum(['none', 'draft', 'approved']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

// Session Entity
export const SessionSchema = z.object({
  id: z.string().uuid().describe('UUID v4 của phiên'),
  name: z.string().optional().nullable().describe('Tên gợi nhớ cho phiên'),
  state: SessionStateSchema,
  created_at: z.string().describe('Thời điểm tạo (ISO 8601 UTC)'),
  updated_at: z.string().describe('Thời điểm cập nhật gần nhất (ISO 8601 UTC)'),
  dataset: DatasetMetaSchema.optional().nullable(),
  clean_version: z.number().int().optional().nullable(),
  reviewer_name: z.string().max(60).optional().nullable().describe('Tên người duyệt Cổng 1 / Cổng 2'),
  report_status: ReportStatusSchema.default('none'),
  steps: z.array(StepInfoSchema).min(5).max(6).describe('5 bước quy trình giao dịch hoặc 6 bước kinh doanh'),
  unlocked_pages: z.array(z.string()).describe('Danh sách các trang được phép truy cập'),
  business_context: BusinessContextSchema.optional().nullable(),
  selected_metric_ids: z.array(z.string()).optional().nullable(),
  business_questions: z.array(z.string()).optional().nullable(),
  metric_selection_confirmed: z.boolean().optional().nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

// P3: Cleaning Schemas
export const CleanOpKeySchema = z.enum([
  'drop_exact_duplicates',
  'drop_rows_missing_ohlc',
  'fill_missing_volume_zero',
  'flag_outliers',
  'drop_flagged_outliers',
  'sort_by_symbol_date',
  // Business Cleaning Ops (Prompt E1)
  'remove_blank_rows',
  'trim_whitespace',
  'fill_blank_dimension_label',
  'sort_natural',
]);
export type CleanOpKey = z.infer<typeof CleanOpKeySchema>;

export const CleanProposalSchema = z.object({
  id: z.string().describe('Mã định danh đề xuất (ví dụ: prop_drop_dups)'),
  op: CleanOpKeySchema.describe('Loại thao tác làm sạch trong allowlist'),
  title_vi: z.string().describe('Tiêu đề thao tác bằng tiếng Việt'),
  description_vi: z.string().describe('Mô tả chi tiết và số lượng dòng ảnh hưởng'),
  rows_affected: z.number().int().nonnegative().describe('Số dòng bị ảnh hưởng'),
  affected_symbols: z.array(z.string()).describe('Danh sách mã bị ảnh hưởng'),
  sample_rows: z.array(z.number().int()).max(5).default([]).describe('Tối đa 5 chỉ số dòng gốc'),
  severity: z.enum(['info', 'warn']).default('info'),
  default_enabled: z.boolean().default(true),
  params: z.record(z.string(), z.any()).optional(),
});
export type CleanProposal = z.infer<typeof CleanProposalSchema>;

export const CleaningDecisionsSchema = z.record(CleanOpKeySchema, z.boolean());
export type CleaningDecisions = z.infer<typeof CleaningDecisionsSchema>;

export const SymbolProfileSchema = z.object({
  symbol: z.string(),
  rows: z.number().int(),
  unique_dates: z.number().int(),
  date_from: z.string(),
  date_to: z.string(),
  missing: z.object({
    open: z.number().int().default(0),
    high: z.number().int().default(0),
    low: z.number().int().default(0),
    close: z.number().int().default(0),
    volume: z.number().int().default(0),
  }),
  missing_rate: z.object({
    open: z.number().default(0),
    high: z.number().default(0),
    low: z.number().default(0),
    close: z.number().default(0),
    volume: z.number().default(0),
  }),
  exact_duplicates: z.number().int().default(0),
  duplicate_keys: z.number().int().default(0),
  zero_volume_sessions: z.number().int().default(0),
  long_gaps_count: z.number().int().default(0),
  outliers_count: z.number().int().default(0),
  stats: z.object({
    close_min: z.number(),
    close_median: z.number(),
    close_max: z.number(),
    vol_min: z.number(),
    vol_median: z.number(),
    vol_max: z.number(),
  }),
});
export type SymbolProfile = z.infer<typeof SymbolProfileSchema>;

export const ProfileSchema = z.object({
  total_rows: z.number().int(),
  total_symbols: z.number().int(),
  date_from: z.string(),
  date_to: z.string(),
  total_missing_cells: z.number().int(),
  total_outliers: z.number().int(),
  total_exact_duplicates: z.number().int(),
  by_symbol: z.record(z.string(), SymbolProfileSchema),
});
export type Profile = z.infer<typeof ProfileSchema>;

export interface CleanArtifact {
  dataset?: import('./dataset').RawDataset;
  businessTable?: import('./businessTable').BusinessTable;
  kind?: 'trading' | 'business';
  outlier_flags?: Uint8Array;
  decisions: Record<string, boolean>;
  hash: string;
  approved_at: string;
  reviewer_name: string;
}

export type CleanDataset = import('./dataset').RawDataset;

export const SessionCreateSchema = z.object({
  name: z.string().optional().nullable().describe('Tên gợi nhớ cho phiên (tùy chọn)'),
});
export type SessionCreate = z.infer<typeof SessionCreateSchema>;

// 6.4 Metrics
export const MetricUnitSchema = z.enum(['ratio', 'currency', 'count', 'number', 'date', 'text']);
export type MetricUnit = z.infer<typeof MetricUnitSchema>;

export const MetricStatusSchema = z.enum(['ok', 'insufficient_data']);
export type MetricStatus = z.infer<typeof MetricStatusSchema>;

export const MetricPolaritySchema = z.enum(['higher_better', 'lower_better', 'neutral']);
export type MetricPolarity = z.infer<typeof MetricPolaritySchema>;

export const DeltaMetricSchema = z.object({
  value: z.number().nullable().optional().describe('Giá trị chênh lệch thô'),
  label_vi: z.string().describe("Nhãn tiếng Việt (ví dụ: 'so với kỳ trước')"),
  status: z.enum(['ok', 'insufficient_data']).optional().default('ok'),
});
export type DeltaMetric = z.infer<typeof DeltaMetricSchema>;

export const MetricSchema = z.object({
  id: z.string().describe('Mã định danh chỉ số (ví dụ: period_return)'),
  label_vi: z.string().describe('Tên hiển thị tiếng Việt'),
  symbol: z.string().optional().nullable().describe('Mã cổ phiếu hoặc null nếu là toàn bộ'),
  value: z.number().optional().nullable().describe('Giá trị thô (null nếu thiếu dữ liệu)'),
  unit: MetricUnitSchema,
  status: MetricStatusSchema,
  polarity: MetricPolaritySchema,
  formula_vi: z.string().describe('Công thức tính toán bằng tiếng Việt'),
  inputs: z.array(z.string()).default([]).describe('Các biến đầu vào cấu thành'),
  delta: DeltaMetricSchema.optional().nullable(),
  // P4 Extensions
  period: z.object({ from: z.string(), to: z.string() }).optional(),
  calc: z
    .array(
      z.object({
        label_vi: z.string(),
        value: z.union([z.number(), z.string()]),
        unit: z.string().optional(),
      })
    )
    .optional(),
  reason_vi: z.string().optional(),
  text: z.string().optional(),
  meaning_vi: z.string().optional(),
  excel_hint: z.string().optional(),
});
export type Metric = z.infer<typeof MetricSchema>;

// 6.5 Charts
export const ChartKindSchema = z.enum([
  'line',
  'candlestick_volume',
  'column',
  'histogram',
  'area',
  'combo',
  'bar',
  'scatter',
  'pie',
  'heatmap',
]);
export type ChartKind = z.infer<typeof ChartKindSchema>;

export const ChartTableSchema = z.object({
  columns: z.array(z.string()).describe('Danh sách tên cột'),
  rows: z.array(z.array(z.any())).describe('Ma trận các dòng dữ liệu thô'),
});
export type ChartTable = z.infer<typeof ChartTableSchema>;

export const ChartSpecSchema = z.object({
  id: z.string().describe('Mã định danh biểu đồ'),
  title_vi: z.string().describe('Tiêu đề biểu đồ tiếng Việt'),
  kind: ChartKindSchema,
  symbols: z.array(z.string()).default([]).describe('Các mã hiển thị'),
  data: z.record(z.string(), z.any()).default({}).describe('Dữ liệu vẽ biểu đồ'),
  table: ChartTableSchema,
  // P4 Extensions
  subtitle_vi: z.string().optional(),
  aria_vi: z.string().optional(),
  empty_reason_vi: z.string().optional(),
});
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

// P4 Analysis Configuration & Results
export const AnalysisPresetSchema = z.enum(['all', '6m', '3m', '1m', 'custom']);
export type AnalysisPreset = z.infer<typeof AnalysisPresetSchema>;

export const AnalysisConfigSchema = z.object({
  symbols: z.array(z.string()).min(1).max(10).describe('Danh sách mã phân tích (1-10 mã)'),
  date_from: z.string().describe('Ngày bắt đầu kỳ (YYYY-MM-DD UTC)'),
  date_to: z.string().describe('Ngày kết thúc kỳ (YYYY-MM-DD UTC)'),
  preset: AnalysisPresetSchema.default('all'),
});
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

export const AnalysisAssumptionsSchema = z.object({
  trading_days: z.number().int().default(252),
  risk_free_rate: z.number().default(0),
  ma_windows: z.array(z.number().int()).default([20, 50]),
  rsi_window: z.number().int().default(14),
  volume_spike_rule: z.string().default('volume > mean20 + 2*std20'),
  return_type: z.literal('simple_close').default('simple_close'),
});
export type AnalysisAssumptions = z.infer<typeof AnalysisAssumptionsSchema>;

export const AnalysisResultSchema = z.object({
  kind: DatasetKindSchema.optional(),
  config: AnalysisConfigSchema,
  created_at: z.string().describe('Thời điểm tính toán (ISO 8601 UTC)'),
  clean_hash: z.string().describe('Mã băm SHA-256 chính quy của dữ liệu sạch đã dùng'),
  analysis_hash: z.string().describe('Mã băm SHA-256 chính tắc của danh sách chỉ số'),
  metrics: z.array(MetricSchema),
  charts: z.array(ChartSpecSchema),
  assumptions: AnalysisAssumptionsSchema,
  warnings: z.array(z.string()).default([]),
  business_analysis: z.any().optional().describe('Tóm tắt phân tích dữ liệu kinh doanh (M3-A)'),
  selected_analysis: z.any().optional().describe('Kết quả tính chọn lọc 13 chỉ số theo catalog (1D-1/1D-2)'),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AnalysisArtifact = AnalysisResult;

// P5 Narrative, Verification, and Report Artifacts
export const NumberCheckReasonSchema = z.enum([
  'NOT_IN_EVIDENCE',
  'NOT_IN_DATA',
  'BAD_EVIDENCE_KEY',
  'FORBIDDEN_PHRASE',
  'EMPTY',
]);
export type NumberCheckReason = z.infer<typeof NumberCheckReasonSchema>;

export const NumberCheckIssueSchema = z.object({
  token: z.string().describe('Chuỗi số hoặc từ vi phạm trong văn bản'),
  reason: NumberCheckReasonSchema,
  detail_vi: z.string(),
});
export type NumberCheckIssue = z.infer<typeof NumberCheckIssueSchema>;

export const NarrativeParagraphSourceSchema = z.enum(['ai', 'template', 'edited']);
export type NarrativeParagraphSource = z.infer<typeof NarrativeParagraphSourceSchema>;

export const NarrativeParagraphSchema = z.object({
  id: z.string(),
  text: z.string().max(700),
  evidence: z.array(z.string()),
  source: NarrativeParagraphSourceSchema,
  original_text: z.string().optional(),
  check_issues: z.array(NumberCheckIssueSchema).default([]),
});
export type NarrativeParagraph = z.infer<typeof NarrativeParagraphSchema>;

export const NarrativeSectionIdSchema = z.enum([
  'overview',
  'trend',
  'volume',
  'risk',
  'comparison',
  'watch',
  'limits',
]);
export type NarrativeSectionId = z.infer<typeof NarrativeSectionIdSchema>;

export const NarrativeSectionSourceSchema = z.enum(['ai', 'template', 'mixed']);
export type NarrativeSectionSource = z.infer<typeof NarrativeSectionSourceSchema>;

export const NarrativeSectionSchema = z.object({
  id: NarrativeSectionIdSchema,
  title_vi: z.string(),
  source: NarrativeSectionSourceSchema,
  paragraphs: z.array(NarrativeParagraphSchema).min(1).max(3),
});
export type NarrativeSection = z.infer<typeof NarrativeSectionSchema>;

export const NarrativeModeSchema = z.enum(['ai', 'template', 'mixed']);
export type NarrativeMode = z.infer<typeof NarrativeModeSchema>;

export const NarrativeSchema = z.object({
  generated_at: z.string(),
  analysis_hash: z.string(),
  mode: NarrativeModeSchema,
  sections: z.array(NarrativeSectionSchema),
  disclaimer_vi: z.string().default('Nội dung mang tính phân tích dữ liệu, không phải khuyến nghị đầu tư.'),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const ReportArtifactStatusSchema = z.enum(['draft', 'approved']);
export type ReportArtifactStatus = z.infer<typeof ReportArtifactStatusSchema>;

export const ReportArtifactSchema = z.object({
  narrative: NarrativeSchema,
  analysis_hash: z.string(),
  status: ReportArtifactStatusSchema,
  reviewer_name: z.string().max(60).nullable().optional(),
  approved_at: z.string().nullable().optional(),
  report_hash: z.string().nullable().optional(),
});
export type ReportArtifact = z.infer<typeof ReportArtifactSchema>;

// 6.6 Audit Entry
export const AuditActorSchema = z.enum(['system', 'ai', 'user']);
export type AuditActor = z.infer<typeof AuditActorSchema>;

export const AuditEntrySchema = z.object({
  id: z.number().int().describe('ID tăng tự động'),
  ts: z.string().describe('Thời gian xảy ra (ISO 8601 UTC)'),
  step: z.string().describe('Bước diễn ra sự kiện'),
  actor: AuditActorSchema,
  action: z.string().describe('Tên hành động'),
  detail: z.string().describe('Chi tiết hành động'),
  data_hash: z.string().optional().nullable().describe('Mã băm dữ liệu liên quan'),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// 6.7 App Configuration
export const AppConfigSchema = z.object({
  app_name: z.string(),
  llm_provider: z.literal('gemini').default('gemini'),
  llm_model: z.string(),
  llm_model_fallback: z.string().nullable().optional(),
  llm_key_configured: z.boolean(),
  llm_key_slots: z.number().int().min(0).max(2).default(0).describe('Số khóa Gemini đã cấu hình (0-2)'),
  min_sessions: z.number().int().default(30),
  strict_mode: z.boolean().default(true),
  trading_days: z.number().int().default(252),
  max_file_mb: z.number().int().default(5),
  max_rows: z.number().int().default(50000),
  max_symbols: z.number().int().default(10),
  ai_mode: z.enum(['ai', 'fallback']),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

// 6.8 Health Response
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  app_name: z.string(),
  version: z.string().default('0.2.0'),
  ai_mode: z.enum(['ai', 'fallback']),
  llm_provider: z.literal('gemini').default('gemini'),
  llm_model: z.string(),
  llm_model_fallback: z.string().nullable().optional(),
  llm_key_slots: z.number().int().min(0).max(2).default(0),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Operational Responses
export const DeleteResponseSchema = z.object({
  deleted: z.boolean().default(true),
});
export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;

export const DevEventRequestSchema = z.object({
  event: z.string().describe('Tên sự kiện cần kích hoạt'),
  actor: AuditActorSchema.default('user'),
  detail: z.string().default('Kích hoạt thủ công từ dev tool'),
});
export type DevEventRequest = z.infer<typeof DevEventRequestSchema>;

// -------------------------------------------------------------
// P6 SCHEMAS: Chat Assistant & Custom One-Off Workflow
// -------------------------------------------------------------

export const ChatMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(['ai', 'user', 'system']),
  text: z.string(),
  time: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  source: z.enum(['local', 'ai', 'system']).default('local'),
  intent: z.string().optional(),
  targetPage: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatAnswerSchema = z.object({
  intent: z.enum([
    'explain_metric',
    'explain_result',
    'how_to',
    'explain_error',
    'off_topic',
    'change_request',
  ]),
  answer_vi: z.string().max(900),
  evidence: z.array(z.string()).default([]),
});
export type ChatAnswer = z.infer<typeof ChatAnswerSchema>;

export const PlanStepSchema = z.object({
  op: z.string(),
  params: z.record(z.string(), z.any()),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  title_vi: z.string(),
  steps: z.array(PlanStepSchema).max(8),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlanTableSchema = z.object({
  id: z.string(),
  title_vi: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
});
export type PlanTable = z.infer<typeof PlanTableSchema>;

export const PlanResultSchema = z.object({
  id: z.string(),
  title_vi: z.string(),
  steps_text: z.array(z.string()),
  tables: z.array(PlanTableSchema),
  charts: z.array(ChartSpecSchema),
  summary_lines: z.array(z.string()),
  created_at: z.string().optional(),
});
export type PlanResult = z.infer<typeof PlanResultSchema>;

export interface Frame {
  symbols: string[];
  symbol_idx: Uint16Array;
  date_days: Int32Array;
  columns: Record<string, Float64Array | number[]>;
  n: number;
}

