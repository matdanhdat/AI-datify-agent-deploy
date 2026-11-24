// src/core/metrics/questionToMetrics.ts
// Bản đồ từ khóa tiếng Việt -> id chỉ số catalog. Chạy không cần mạng, không cần AI.

export type QuestionFlag = 'profit' | 'channel' | 'product' | 'region' | 'time';

export interface KeywordEntry {
  vi: string;
  ascii?: string;
  /** Được phép khớp ở dạng không dấu khi cả câu không có dấu. */
  asciiSafe: boolean;
  ids?: string[];
  /** Chỉ số tổng: bỏ khi câu nhắc tới kênh hoặc sản phẩm. */
  globalIds?: string[];
  flags?: QuestionFlag[];
}

export function normalizeVi(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}
const toned = (text: string): string => text.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

const OVERVIEW_IDS = ['total_revenue', 'total_orders', 'gross_margin', 'revenue_by_channel', 'revenue_by_month'];
const CATALOG_ORDER = [
  'total_revenue', 'total_orders', 'aov', 'gross_profit', 'gross_margin', 'revenue_by_channel',
  'revenue_by_region', 'revenue_by_month', 'revenue_growth', 'revenue_by_product',
  'margin_by_channel', 'margin_by_product', 'channel_product_matrix',
];

export const QUESTION_KEYWORD_MAP: KeywordEntry[] = [
  { vi: 'tổng quan', asciiSafe: true, ids: OVERVIEW_IDS },
  { vi: 'tình hình chung', asciiSafe: true, ids: OVERVIEW_IDS },
  { vi: 'hiệu quả kinh doanh', asciiSafe: true, ids: OVERVIEW_IDS },
  { vi: 'doanh thu', asciiSafe: true, globalIds: ['total_revenue'] },
  { vi: 'doanh số', asciiSafe: true, globalIds: ['total_revenue'] },
  { vi: 'tổng thu', asciiSafe: true, globalIds: ['total_revenue'] },
  { vi: 'bán được bao nhiêu', asciiSafe: true, globalIds: ['total_revenue'] },
  { vi: 'số đơn', asciiSafe: true, globalIds: ['total_orders'] },
  { vi: 'đơn hàng', asciiSafe: true, globalIds: ['total_orders'] },
  { vi: 'lượng đơn', asciiSafe: true, globalIds: ['total_orders'] },
  { vi: 'giá trị đơn', asciiSafe: true, ids: ['aov'] },
  { vi: 'trung bình mỗi đơn', asciiSafe: true, ids: ['aov'] },
  { vi: 'giỏ hàng', asciiSafe: true, ids: ['aov'] },
  { vi: 'aov', asciiSafe: true, ids: ['aov'] },
  { vi: 'biên lợi nhuận', asciiSafe: true, flags: ['profit'], globalIds: ['gross_margin'] },
  { vi: 'lợi nhuận', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'giá vốn', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'lãi nhiều nhất', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'lời nhiều nhất', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'lãi nhất', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'lời nhất', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'sinh lời', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'sinh lãi', asciiSafe: true, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'lãi', asciiSafe: false, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'lời', asciiSafe: false, flags: ['profit'], globalIds: ['gross_profit', 'gross_margin'] },
  { vi: 'biên', asciiSafe: false, flags: ['profit'], globalIds: ['gross_margin'] },
  { vi: 'tỷ suất', asciiSafe: true, flags: ['profit'], globalIds: ['gross_margin'] },
  { vi: 'tỉ suất', asciiSafe: true, flags: ['profit'], globalIds: ['gross_margin'] },
  { vi: 'hiệu quả', asciiSafe: true, flags: ['profit'], globalIds: ['gross_margin'] },
  { vi: 'đẩy mạnh', asciiSafe: true, flags: ['profit'] },
  { vi: 'tiềm năng', asciiSafe: true, flags: ['profit'] },
  { vi: 'ưu tiên', asciiSafe: true, flags: ['profit'] },
  { vi: 'nên tập trung', asciiSafe: true, flags: ['profit'] },
  { vi: 'kênh và sản phẩm', asciiSafe: true, ids: ['channel_product_matrix'], flags: ['channel', 'product'] },
  { vi: 'ma trận', asciiSafe: true, ids: ['channel_product_matrix'], flags: ['channel', 'product'] },
  { vi: 'bán kèm', asciiSafe: true, ids: ['channel_product_matrix'], flags: ['channel', 'product'] },
  { vi: 'combo', asciiSafe: true, ids: ['channel_product_matrix'], flags: ['channel', 'product'] },
  { vi: 'kết hợp', asciiSafe: true, ids: ['channel_product_matrix'], flags: ['channel', 'product'] },
  { vi: 'kênh', asciiSafe: true, ids: ['revenue_by_channel'], flags: ['channel'] },
  { vi: 'khu vực', asciiSafe: true, ids: ['revenue_by_region'], flags: ['region'] },
  { vi: 'địa lý', asciiSafe: true, ids: ['revenue_by_region'], flags: ['region'] },
  { vi: 'thành phố', asciiSafe: true, ids: ['revenue_by_region'], flags: ['region'] },
  { vi: 'vùng', asciiSafe: false, ids: ['revenue_by_region'], flags: ['region'] },
  { vi: 'miền', asciiSafe: false, ids: ['revenue_by_region'], flags: ['region'] },
  { vi: 'tỉnh', asciiSafe: false, ids: ['revenue_by_region'], flags: ['region'] },
  { vi: 'so với tháng trước', asciiSafe: true, ids: ['revenue_growth', 'revenue_by_month'], flags: ['time'] },
  { vi: 'tăng trưởng', asciiSafe: true, ids: ['revenue_growth', 'revenue_by_month'], flags: ['time'] },
  { vi: 'xu hướng', asciiSafe: true, ids: ['revenue_by_month', 'revenue_growth'], flags: ['time'] },
  { vi: 'theo tháng', asciiSafe: true, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'hàng tháng', asciiSafe: true, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'mỗi tháng', asciiSafe: true, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'thời gian', asciiSafe: true, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'theo kỳ', asciiSafe: true, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'mùa vụ', asciiSafe: true, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'tháng', asciiSafe: false, ids: ['revenue_by_month'], flags: ['time'] },
  { vi: 'tăng', asciiSafe: false, ids: ['revenue_growth', 'revenue_by_month'], flags: ['time'] },
  { vi: 'giảm', asciiSafe: false, ids: ['revenue_growth', 'revenue_by_month'], flags: ['time'] },
  { vi: 'sản phẩm', asciiSafe: true, ids: ['revenue_by_product'], flags: ['product'] },
  { vi: 'mặt hàng', asciiSafe: true, ids: ['revenue_by_product'], flags: ['product'] },
  { vi: 'nhóm hàng', asciiSafe: true, ids: ['revenue_by_product'], flags: ['product'] },
];

export const QUESTION_UNSUPPORTED_TOPICS: string[] = [
  'nhân viên', 'khách hàng', 'tồn kho', 'quảng cáo', 'marketing', 'khuyến mãi',
  'hoàn hàng', 'tỷ lệ chuyển đổi', 'tỉ lệ chuyển đổi', 'đối thủ', 'chi phí',
];

const INJECTION_PATTERNS: string[] = [
  'bỏ qua', 'xóa', 'xoá', 'khóa api', 'api key', 'apikey', 'prompt', 'ignore previous',
  'ignore all', 'system prompt', 'mật khẩu', 'tiết lộ',
];

export const MSG_INJECTION = 'Yêu cầu không thuộc phạm vi phân tích.';
export const MSG_NOT_UNDERSTOOD =
  'Chưa hiểu câu hỏi; hãy hỏi về doanh thu, lợi nhuận, kênh, sản phẩm, khu vực hoặc thời gian.';
export const msgUnsupportedTopic = (topic: string): string =>
  `Dữ liệu hiện tại chưa có thông tin về ${topic} nên chưa trả lời được.`;
export const msgPartialNote = (topic: string): string =>
  `Phần về ${topic} chưa trả lời được vì dữ liệu chưa có thông tin này.`;

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function phraseRe(phrase: string, flags = 'u'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc(phrase)}(?![\\p{L}\\p{N}])`, flags);
}

export function sanitizeOne(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export interface QuestionInputInfo {
  questions: string[];
  droppedLines: number;
  truncated: boolean;
}
export function inspectQuestionInput(raw: string): QuestionInputInfo {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const truncated = lines.some((l) => l.length > 200);
  const cleaned = lines.map(sanitizeOne).filter((l) => l.length > 0);
  return { questions: cleaned.slice(0, 3), droppedLines: Math.max(0, cleaned.length - 3), truncated };
}
export function sanitizeQuestions(raw: string): string[] {
  return inspectQuestionInput(raw).questions;
}

interface ScanResult { hits: KeywordEntry[] }
function scan(text: string, useAscii: boolean): ScanResult {
  let rest = text;
  const hits: KeywordEntry[] = [];
  const entries = QUESTION_KEYWORD_MAP
    .filter((k) => !useAscii || k.asciiSafe)
    .map((k) => ({ k, phrase: useAscii ? (k.ascii ?? normalizeVi(k.vi)) : k.vi }))
    .sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { k, phrase } of entries) {
    if (phraseRe(phrase).test(rest)) {
      hits.push(k);
      rest = rest.replace(phraseRe(phrase, 'gu'), ' ');
    }
  }
  return { hits };
}

function findPhrase(list: string[], tonedText: string, asciiText: string, useAscii: boolean): string | null {
  for (const p of list) {
    const phrase = useAscii ? normalizeVi(p) : p;
    if (phraseRe(phrase).test(useAscii ? asciiText : tonedText)) return p;
  }
  return null;
}

export interface FeasibilityInfo { feasible: boolean; reason?: string }
export interface QuestionResult {
  index: number;
  text: string;
  tickIds: string[];
  blockedIds: Array<{ id: string; reason: string }>;
  unanswerable?: string;
  note?: string;
}

export function mapQuestionsToMetrics(
  questions: string[],
  feasibilityById: Record<string, FeasibilityInfo>,
  _labelById: Record<string, string> = {},
): { perQuestion: QuestionResult[]; tickUnion: string[] } {
  const perQuestion: QuestionResult[] = [];
  const union: string[] = [];
  questions.forEach((q, index) => {
    const t = toned(q);
    const a = normalizeVi(q);
    const useAscii = t === a; // cả câu không dấu
    const res: QuestionResult = { index, text: q, tickIds: [], blockedIds: [] };

    if (findPhrase(INJECTION_PATTERNS, t, a, false) || findPhrase(INJECTION_PATTERNS, t, a, true)) {
      res.unanswerable = MSG_INJECTION;
      perQuestion.push(res);
      return;
    }
    const topic = findPhrase(QUESTION_UNSUPPORTED_TOPICS, t, a, useAscii);
    const { hits } = scan(useAscii ? a : t, useAscii);
    const flags = new Set<QuestionFlag>();
    hits.forEach((h) => h.flags?.forEach((f) => flags.add(f)));
    const dropGlobals = flags.has('channel') || flags.has('product');
    const ids = new Set<string>();
    hits.forEach((h) => {
      h.ids?.forEach((i) => ids.add(i));
      if (!dropGlobals) h.globalIds?.forEach((i) => ids.add(i));
    });
    if (flags.has('profit')) {
      if (flags.has('channel') && flags.has('product')) {
        ['channel_product_matrix', 'margin_by_channel', 'margin_by_product'].forEach((i) => ids.add(i));
      } else if (flags.has('channel')) ids.add('margin_by_channel');
      else if (flags.has('product')) ids.add('margin_by_product');
    }
    const ordered = CATALOG_ORDER.filter((i) => ids.has(i));
    ids.forEach((i) => { if (!ordered.includes(i)) ordered.push(i); });

    if (ordered.length === 0) {
      res.unanswerable = topic ? msgUnsupportedTopic(topic) : MSG_NOT_UNDERSTOOD;
      perQuestion.push(res);
      return;
    }
    for (const id of ordered) {
      const f = feasibilityById[id];
      if (f?.feasible) {
        res.tickIds.push(id);
        if (!union.includes(id)) union.push(id);
      } else {
        res.blockedIds.push({ id, reason: f?.reason ?? 'Chỉ số không có trong danh mục.' });
      }
    }
    if (topic) res.note = msgPartialNote(topic);
    perQuestion.push(res);
  });
  return { perQuestion, tickUnion: union };
}

// Re-export backward compatibility aliases for existing app code
export type QuestionMetricResult = QuestionResult;
export type MapQuestionsOutput = { perQuestion: QuestionResult[]; tickUnion: string[] };
