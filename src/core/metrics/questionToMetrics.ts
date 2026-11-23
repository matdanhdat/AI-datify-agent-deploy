/**
 * Question to Metrics Deterministic Mapper (Prompt 5B).
 * Maps user questions to business catalog metric IDs via keyword rules.
 * Pure logic, zero network, zero Gemini dependency.
 */

import { BUSINESS_METRIC_CATALOG } from './businessCatalog';

export interface KeywordMetricRule {
  readonly keywords: readonly string[];
  readonly metricIds: readonly string[];
}

export const QUESTION_KEYWORD_MAP: readonly KeywordMetricRule[] = [
  {
    keywords: ['doanh thu', 'doanh so', 'tong thu', 'ban duoc bao nhieu'],
    metricIds: ['total_revenue'],
  },
  {
    keywords: ['don hang', 'so don', 'luong don'],
    metricIds: ['total_orders'],
  },
  {
    keywords: ['gia tri don', 'trung binh moi don', 'aov', 'gio hang'],
    metricIds: ['aov'],
  },
  {
    keywords: ['loi nhuan'],
    metricIds: ['gross_profit', 'gross_margin'],
  },
  {
    keywords: ['lai', 'loi'],
    metricIds: ['gross_profit', 'gross_margin'],
  },
  {
    keywords: ['bien', 'ty suat', 'hieu qua'],
    metricIds: ['gross_margin'],
  },
  {
    keywords: ['kenh'],
    metricIds: ['revenue_by_channel'],
  },
  {
    keywords: ['khu vuc', 'vung', 'mien', 'dia ly', 'tinh', 'thanh pho'],
    metricIds: ['revenue_by_region'],
  },
  {
    keywords: ['thang', 'thoi gian', 'xu huong', 'theo ky', 'mua vu'],
    metricIds: ['revenue_by_month', 'revenue_growth'],
  },
  {
    keywords: ['tang truong', 'tang', 'giam', 'so voi thang truoc'],
    metricIds: ['revenue_growth', 'revenue_by_month'],
  },
  {
    keywords: ['san pham', 'mat hang', 'nhom hang'],
    metricIds: ['revenue_by_product'],
  },
  {
    keywords: ['ma tran', 'ket hop', 'ban kem', 'combo', 'kenh va san pham'],
    metricIds: ['channel_product_matrix'],
  },
  {
    keywords: ['tong quan', 'tinh hinh chung', 'hieu qua kinh doanh'],
    metricIds: [
      'total_revenue',
      'total_orders',
      'gross_margin',
      'revenue_by_channel',
      'revenue_by_month',
    ],
  },
] as const;

export interface UnsupportedTopic {
  readonly keyword: string;
  readonly raw: string;
}

export const QUESTION_UNSUPPORTED_TOPICS: readonly UnsupportedTopic[] = [
  { keyword: 'nhan vien', raw: 'nhân viên' },
  { keyword: 'khach hang', raw: 'khách hàng' },
  { keyword: 'ton kho', raw: 'tồn kho' },
  { keyword: 'chi phi quang cao', raw: 'chi phí quảng cáo' },
  { keyword: 'marketing', raw: 'marketing' },
  { keyword: 'khuyen mai', raw: 'khuyến mãi' },
  { keyword: 'hoan hang', raw: 'hoàn hàng' },
  { keyword: 'ty le chuyen doi', raw: 'tỷ lệ chuyển đổi' },
  { keyword: 'doi thu', raw: 'đối thủ' },
] as const;

export const PROFIT_EFFICIENCY_KEYWORDS: readonly string[] = [
  'lai',
  'loi nhuan',
  'loi',
  'bien',
  'hieu qua',
  'day',
  'tiem nang',
  'uu tien',
] as const;

export const CHANNEL_ENTITY_KEYWORDS: readonly string[] = ['kenh'] as const;

export const PRODUCT_ENTITY_KEYWORDS: readonly string[] = [
  'san pham',
  'mat hang',
  'nhom hang',
  'hang hoa',
] as const;

export const PROMPT_INJECTION_KEYWORDS: readonly string[] = [
  'bo qua huong dan',
  'xoa du lieu',
  'in ra khoa',
  'api key',
  'system prompt',
  'drop table',
] as const;

/**
 * Normalizes Vietnamese text: lowercase, remove diacritics (including đ->d), collapse whitespaces.
 */
export function normalizeVi(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
    .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
    .replace(/ì|í|ị|ỉ|ĩ/g, 'i')
    .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
    .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
    .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches keyword within text with word boundary matching.
 */
function containsKeyword(normalizedText: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
  return regex.test(normalizedText);
}

export interface SanitizeResult {
  questions: string[];
  hasWarnings: boolean;
  warningMessage?: string;
}

/**
 * Sanitizes raw user input:
 * - splits by line
 * - removes empty lines
 * - strips HTML tags, control chars, and brackets <>{}[]
 * - caps at 3 questions
 * - truncates each question to max 200 chars
 */
export function sanitizeQuestions(raw: string): SanitizeResult {
  if (!raw || typeof raw !== 'string') {
    return { questions: [], hasWarnings: false };
  }

  const rawLines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let hasWarnings = false;
  if (rawLines.length > 3) {
    hasWarnings = true;
  }

  const cleanedLines: string[] = [];
  const linesToProcess = rawLines.slice(0, 3);

  for (const line of linesToProcess) {
    // Strip HTML tags
    let cleaned = line.replace(/<[^>]*>/g, '');
    // Strip control characters and brackets <>{}[]
    cleaned = cleaned.replace(/[\x00-\x1F\x7F<>{}[\]]/g, '');
    cleaned = cleaned.trim();

    if (cleaned.length > 200) {
      hasWarnings = true;
      cleaned = cleaned.slice(0, 200).trim();
    }

    if (cleaned.length > 0) {
      cleanedLines.push(cleaned);
    }
  }

  return {
    questions: cleanedLines,
    hasWarnings,
    warningMessage: hasWarnings
      ? 'Chỉ nhận tối đa 3 câu, mỗi câu tối đa 200 ký tự'
      : undefined,
  };
}

export interface QuestionMetricResult {
  index: number;
  text: string;
  tickIds: string[];
  blockedIds: Array<{ id: string; reason: string }>;
  unanswerable?: string;
  note?: string;
}

export interface MapQuestionsOutput {
  perQuestion: QuestionMetricResult[];
  tickUnion: string[];
}

/**
 * Pure mapping function from user questions to catalog metric IDs.
 * Evaluates feasibility and produces detailed per-question and union results.
 */
export function mapQuestionsToMetrics(
  questions: string[],
  feasibilityById: Record<string, { feasible: boolean; reason?: string }>,
  _labelById?: Record<string, string>
): MapQuestionsOutput {
  const perQuestion: QuestionMetricResult[] = [];
  const unionSet = new Set<string>();

  // Set of all legitimate catalog metric IDs
  const validCatalogIds = new Set(BUSINESS_METRIC_CATALOG.map((m) => m.id));

  questions.forEach((qText, idx) => {
    const norm = normalizeVi(qText);

    // 1. Check prompt injection
    const hasInjection = PROMPT_INJECTION_KEYWORDS.some((kw) =>
      containsKeyword(norm, kw)
    );
    if (hasInjection) {
      perQuestion.push({
        index: idx,
        text: qText,
        tickIds: [],
        blockedIds: [],
        unanswerable: 'Yêu cầu không thuộc phạm vi phân tích',
      });
      return;
    }

    // Check entity presence
    const hasChannel = CHANNEL_ENTITY_KEYWORDS.some((kw) =>
      containsKeyword(norm, kw)
    );
    const hasProduct = PRODUCT_ENTITY_KEYWORDS.some((kw) =>
      containsKeyword(norm, kw)
    );
    const hasEntity = hasChannel || hasProduct;

    // Check explicit "loi nhuan"
    const hasLoiNhuanNoun = containsKeyword(norm, 'loi nhuan');

    // 2. Identify matched metrics
    const matchedMetricIds = new Set<string>();

    for (const rule of QUESTION_KEYWORD_MAP) {
      // If rule is standalone 'lai' or 'loi' (without 'loi nhuan') and an entity (channel/product) is present,
      // it specifies entity margin (margin_by_channel / margin_by_product), so skip adding aggregate gross_profit/gross_margin
      if (
        hasEntity &&
        !hasLoiNhuanNoun &&
        rule.keywords.length === 2 &&
        rule.keywords.includes('lai') &&
        rule.keywords.includes('loi')
      ) {
        continue;
      }

      // If rule is 'bien', 'ty suat', 'hieu qua' and an entity is present, entity profit efficiency handles it
      if (
        hasEntity &&
        rule.keywords.length === 3 &&
        rule.keywords.includes('bien') &&
        rule.keywords.includes('hieu qua')
      ) {
        continue;
      }

      const matched = rule.keywords.some((kw) => containsKeyword(norm, kw));
      if (matched) {
        for (const mId of rule.metricIds) {
          if (validCatalogIds.has(mId)) {
            matchedMetricIds.add(mId);
          }
        }
      }
    }

    // Profit-efficiency entity rule:
    const hasProfitEfficiency = PROFIT_EFFICIENCY_KEYWORDS.some((kw) =>
      containsKeyword(norm, kw)
    );
    if (hasProfitEfficiency) {
      if (hasChannel) {
        matchedMetricIds.add('margin_by_channel');
      }
      if (hasProduct) {
        matchedMetricIds.add('margin_by_product');
      }
      if (hasChannel && hasProduct) {
        matchedMetricIds.add('channel_product_matrix');
      }
    }

    // 3. Identify unsupported topics
    const matchedUnsupported = QUESTION_UNSUPPORTED_TOPICS.find((topic) =>
      containsKeyword(norm, topic.keyword)
    );

    // 4. Handle unsupported topics without metrics
    if (matchedUnsupported && matchedMetricIds.size === 0) {
      perQuestion.push({
        index: idx,
        text: qText,
        tickIds: [],
        blockedIds: [],
        unanswerable: `Dữ liệu hiện tại chưa có thông tin về ${matchedUnsupported.raw} nên chưa trả lời được.`,
      });
      return;
    }

    // 5. Handle unrecognizable questions
    if (matchedMetricIds.size === 0) {
      perQuestion.push({
        index: idx,
        text: qText,
        tickIds: [],
        blockedIds: [],
        unanswerable:
          'Chưa hiểu câu hỏi; hãy hỏi về doanh thu, lợi nhuận, kênh, sản phẩm, khu vực hoặc thời gian.',
      });
      return;
    }

    // 6. Split matched metrics into tickIds (feasible) and blockedIds (unfeasible)
    const tickIds: string[] = [];
    const blockedIds: Array<{ id: string; reason: string }> = [];

    for (const mId of matchedMetricIds) {
      const feas = feasibilityById[mId];
      if (feas && feas.feasible) {
        tickIds.push(mId);
        unionSet.add(mId);
      } else {
        const reason = feas?.reason || 'Chưa đủ điều kiện dữ liệu để tính.';
        blockedIds.push({ id: mId, reason });
      }
    }

    let note: string | undefined = undefined;
    if (matchedUnsupported) {
      note = `Dữ liệu hiện tại chưa có thông tin về ${matchedUnsupported.raw} nên chưa trả lời được phần này.`;
    }

    perQuestion.push({
      index: idx,
      text: qText,
      tickIds,
      blockedIds,
      note,
    });
  });

  return {
    perQuestion,
    tickUnion: Array.from(unionSet),
  };
}
