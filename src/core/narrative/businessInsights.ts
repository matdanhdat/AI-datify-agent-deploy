/**
 * Business Insights Verification & Deterministic Template Fallback (Prompt M3-B3, B4 & 3B).
 * Enforces strict two-tier post-AI guardrails:
 * - Tier 1 (Summary): max 3 sentences summarizing overall performance.
 * - Tier 2 (By Metric): max 2 sentences per selected metric, each with valid refs [F#].
 * 1. Safe JSON parsing & Zod validation
 * 2. Every ref must exist in FactsTable and belong to the metric
 * 3. Every numeric token in AI text must match a value in the cited facts
 * 4. Plain-text sanitization (zero HTML, markdown links stripped)
 * 5. Strict rejection of forbidden keywords based on has_* flags
 * 6. Deterministic template fallback when AI fails, times out, or produces invalid items.
 */

import type { FactsTable, FactItem } from './factsBuilder';
import { sanitizeDataLabel } from './factsBuilder';
import {
  evaluateInsightRules,
  ALLOWED_CHECK_AFTER,
  type InsightFinding,
  type InsightActionPriority,
  type CheckAfterOption,
} from './insightRules';
import { BUSINESS_METRIC_CATALOG } from '../metrics/businessCatalog';

export type InsightConfidence = 'cao' | 'vừa' | 'thấp';

export interface BusinessInsightItem {
  title: string;
  statement: string;
  evidence_ids: string[];
  confidence: InsightConfidence;
}

export interface BusinessRecommendationItem {
  action: string;
  rationale: string;
  evidence_ids: string[];
  expected_effect_note: string;
  risk: string;
}

export interface ByMetricSentence {
  text: string;
  refs: string[];
}

export interface BusinessInsightsReport {
  source: 'ai' | 'template';
  model: string;
  facts_hash: string;
  latency_ms: number;
  rejected_count: number;
  rejected_reasons: string[];
  feedback_applied?: string;
  generated_at: string;
  // Prompt 5A: 4-Layer Findings & Action Priority
  findings: InsightFinding[];
  priority_actions: InsightActionPriority[];
  key_takeaways: string[];
  // Two-tier fields (Prompt 3B)
  summary: string[];
  by_metric: Record<string, ByMetricSentence[]>;
  followups?: string[];
  // Backward compatibility fields
  insights: BusinessInsightItem[];
  recommendations: BusinessRecommendationItem[];
  limitations: string[];
}

export interface RawAiBusinessInsightsPayload {
  // Prompt 5A fields
  findings?: unknown[];
  key_takeaways?: unknown[];
  priority_actions?: unknown[];
  // New two-tier fields
  summary?: unknown[];
  by_metric?: Record<string, unknown[]>;
  followups?: unknown[];
  // Legacy fields
  insights?: Array<{
    title?: unknown;
    statement?: unknown;
    evidence_ids?: unknown;
    confidence?: unknown;
  }>;
  recommendations?: Array<{
    action?: unknown;
    rationale?: unknown;
    evidence_ids?: unknown;
    expected_effect_note?: unknown;
    risk?: unknown;
  }>;
  limitations?: unknown[];
}

export interface VerifyInsightsMeta {
  model: string;
  latency_ms: number;
  feedback_applied?: string;
  flags?: {
    has_margin?: boolean;
    has_orders?: boolean;
    has_product?: boolean;
    has_channel?: boolean;
    has_region?: boolean;
    has_time?: boolean;
  };
  metricEventMap?: Record<string, string[]>;
}

/**
 * Strips HTML tags, script payloads, markdown links and control chars so text is strictly plain text.
 */
export function sanitizePlainText(input: unknown, maxLen = 450): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Checks for forbidden keywords when specific flags are false.
 */
export function hasForbiddenKeyword(
  text: string,
  flags?: {
    has_margin?: boolean;
    has_orders?: boolean;
    has_product?: boolean;
    has_channel?: boolean;
    has_region?: boolean;
    has_time?: boolean;
  }
): string | null {
  if (!flags) return null;
  const lower = text.toLowerCase();
  if (flags.has_margin === false && /(^|[^a-zA-Z0-9_\u00C0-\u1EF9])(biên|lợi nhuận|giá vốn|lãi)([^a-zA-Z0-9_\u00C0-\u1EF9]|$)/i.test(lower)) {
    return 'Chứa từ khóa biên/lợi nhuận/giá vốn/lãi trong khi dữ liệu không có';
  }
  if (flags.has_orders === false && /(^|[^a-zA-Z0-9_\u00C0-\u1EF9])(đơn|aov|trung bình mỗi đơn)([^a-zA-Z0-9_\u00C0-\u1EF9]|$)/i.test(lower)) {
    return 'Chứa từ khóa số đơn/AOV trong khi dữ liệu không có';
  }
  if (flags.has_product === false && /(^|[^a-zA-Z0-9_\u00C0-\u1EF9])(sản phẩm|mặt hàng)([^a-zA-Z0-9_\u00C0-\u1EF9]|$)/i.test(lower)) {
    return 'Chứa từ khóa sản phẩm trong khi dữ liệu không có';
  }
  if (flags.has_channel === false && /(^|[^a-zA-Z0-9_\u00C0-\u1EF9])(kênh)([^a-zA-Z0-9_\u00C0-\u1EF9]|$)/i.test(lower)) {
    return 'Chứa từ khóa kênh bán trong khi dữ liệu không có';
  }
  if (flags.has_region === false && /(^|[^a-zA-Z0-9_\u00C0-\u1EF9])(khu vực|địa lý|miền|tỉnh|thành phố)([^a-zA-Z0-9_\u00C0-\u1EF9]|$)/i.test(lower)) {
    return 'Chứa từ khóa khu vực/địa lý trong khi dữ liệu không có';
  }
  if (flags.has_time === false && /(^|[^a-zA-Z0-9_\u00C0-\u1EF9])(tháng|tăng trưởng|xu hướng)([^a-zA-Z0-9_\u00C0-\u1EF9]|$)/i.test(lower)) {
    return 'Chứa từ khóa tháng/thời gian/tăng trưởng trong khi dữ liệu không có';
  }
  return null;
}

const FORBIDDEN_CERTAINTY_WORDS = [
  'tuyệt đối',
  'hoàn toàn',
  'nghiêm ngặt',
  'hoàn hảo',
  'xuất sắc',
  'toàn diện',
  'đã vá đúng',
  'đạt chuẩn',
];

export function hasForbiddenCertaintyWords(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (/100\s*%/.test(lower) && !/(tỷ lệ|tỷ trọng|chiếm)\s*100\s*%/.test(lower)) {
    return true;
  }
  if (/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(text)) {
    return true;
  }
  return FORBIDDEN_CERTAINTY_WORDS.some((w) => lower.includes(w));
}

export const FORBIDDEN_CAUSAL_PHRASES = [
  'chi phí hoa hồng',
  'ngân sách tiếp thị',
  'chưa được phân bổ đủ nguồn lực',
  'tập khách hàng trung thành',
  'bão hòa',
  'tính thời vụ',
  'khuyến mại',
  'sự kiện',
  'chuỗi cung ứng',
  'tồn kho',
  'chiết khấu',
  'chi phí vận hành',
  'chi phí phân phối',
  'ngay lập tức',
  'bền chặt',
  'chắc chắn',
  'nguyên nhân là',
  'do vì',
];

export function hasForbiddenCausalPhrases(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return FORBIDDEN_CAUSAL_PHRASES.some((p) => lower.includes(p));
}

export function computeJaccardWordSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extracts numeric tokens from Vietnamese prose while ignoring fact IDs (F1, F12),
 * year-month identifiers (2026-10), and structural list counts like "Top 1"/"Top 3".
 */
export function extractNumbersFromVietnameseText(text: string): Array<{ raw: string; parsed: number }> {
  const masked = text
    .replace(/\bF\d+\b/gi, ' ') // Fact IDs (F1, F12)
    .replace(/\b20\d{2}[-/](?:0?[1-9]|1[0-2])(?:[-/](?:0?[1-9]|[12]\d|3[01]))?\b/g, ' ') // Dates / YYYY-MM
    .replace(/\b(?:tháng|quý|năm)\s+\d{1,4}\b/gi, ' ') // "tháng 10", "năm 2026"
    .replace(/\btop\s*[1-5]\b/gi, ' ') // "Top 1", "Top 3"
    .replace(/\bcổng\s*[12]\b/gi, ' ') // "Cổng 1", "Cổng 2"
    .replace(/\bbước\s*[1-5]\b/gi, ' ') // "Bước 1", "Bước 2"
    .replace(/\bcâu\s*\d+\b/gi, ' '); // "Câu 1", "Câu 2"

  const matches = masked.match(/\d+(?:[.,]\d+)*/g) || [];
  const results: Array<{ raw: string; parsed: number }> = [];

  for (const raw of matches) {
    const parsed = parseVietnameseNumberToken(raw);
    if (parsed !== null && Number.isFinite(parsed)) {
      results.push({ raw, parsed });
    }
  }
  return results;
}

/**
 * Normalizes both Vietnamese ("1.135.530.000", "46,84", "339.775,58") and standard ("46.84") numeric tokens.
 */
export function parseVietnameseNumberToken(token: string): number | null {
  const s = token.trim();
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  let normalized = s;
  if (hasDot && hasComma) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      normalized = s.replace(',', '.');
    } else if (parts.length > 2) {
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s;
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Checks if a parsed number from AI text matches ANY allowed number from the cited facts.
 */
function numberMatchesAllowed(val: number, allowedValues: number[]): boolean {
  for (const rawAllowed of allowedValues) {
    const target = Math.abs(rawAllowed);
    const v = Math.abs(val);

    if (target === 0 && v === 0) return true;

    // Exact or rounding match
    const diff = Math.abs(v - target);
    const relTol = Math.max(0.06, target * 0.005);
    if (diff <= relTol) return true;

    // Unit shorthand conversions (triệu / tỷ / nghìn)
    for (const div of [1e3, 1e6, 1e9]) {
      const scaled = target / div;
      if (scaled >= 0.05 && Math.abs(v - scaled) <= Math.max(0.06, scaled * 0.015)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collects all numeric values allowed by a given list of evidence_ids in FactsTable.
 */
function collectAllowedNumbersForEvidence(
  evidenceIds: string[],
  factMap: Map<string, FactItem>
): number[] {
  const nums: number[] = [];
  for (const id of evidenceIds) {
    const f = factMap.get(id);
    if (!f) continue;
    for (const n of f.raw_numbers) {
      nums.push(n);
    }
    for (const tok of extractNumbersFromVietnameseText(f.display)) {
      nums.push(tok.parsed);
    }
  }
  return nums;
}

/**
 * Builds deterministic, verified template insights with two-tier structure.
 */
export function buildTemplateBusinessInsights(
  factsTable: FactsTable,
  options?: {
    latency_ms?: number;
    rejected_count?: number;
    rejected_reasons?: string[];
    feedback_applied?: string;
  }
): BusinessInsightsReport {
  const byCategory = (cat: FactItem['category']) => factsTable.facts.filter((f) => f.category === cat);
  const fTotal = byCategory('total');
  const fChannels = byCategory('channel');
  const fMonths = byCategory('month');
  const fProducts = byCategory('product');
  const fRegions = byCategory('region');

  const summary: string[] = [];
  const by_metric: Record<string, ByMetricSentence[]> = {};
  const followups: string[] = [];

  const revFact = fTotal.find((f) => f.label_vi.includes('Tổng doanh thu'));
  const profFact = fTotal.find((f) => f.label_vi.includes('Tổng lợi nhuận'));
  const marginFact = fTotal.find((f) => f.label_vi.includes('Biên lợi nhuận'));
  const orderFact = fTotal.find((f) => f.label_vi.includes('Tổng số đơn'));

  // -----------------------------------------------------------
  // Tier 1: Summary (max 3 sentences)
  // -----------------------------------------------------------
  if (revFact && profFact && marginFact) {
    summary.push(
      `Tổng doanh thu kỳ ghi nhận đạt ${revFact.display}, tạo ra lợi nhuận gộp ${profFact.display} với biên lợi nhuận bình quân ${marginFact.display}${orderFact ? ` trên tổng ${orderFact.display}` : ''}.`
    );
  } else if (revFact) {
    summary.push(`Tổng doanh thu kỳ ghi nhận đạt ${revFact.display}${orderFact ? ` trên tổng ${orderFact.display}` : ''}.`);
  }

  // Summary sentence 2: Distribution / Ties
  if (fChannels.length > 0) {
    const topCh = fChannels[0];
    const isChannelTied = fChannels.length > 1 && fChannels[0].value === fChannels[1].value;
    if (isChannelTied) {
      summary.push(
        `${topCh.label_vi.replace(/\[DATA:|\]/g, '')} và ${fChannels[1].label_vi.replace(/\[DATA:|\]/g, '')} đồng hạng doanh thu đạt ${topCh.display}.`
      );
    } else {
      summary.push(`${topCh.label_vi.replace(/\[DATA:|\]/g, '')} dẫn đầu cơ cấu doanh thu với ${topCh.display}.`);
    }
  } else if (fRegions.length > 0) {
    const topRg = fRegions[0];
    const isRegionTied = fRegions.length > 1 && fRegions[0].value === fRegions[1].value;
    if (isRegionTied) {
      summary.push(
        `${topRg.label_vi.replace(/\[DATA:|\]/g, '')} và ${fRegions[1].label_vi.replace(/\[DATA:|\]/g, '')} đồng hạng doanh thu đạt ${topRg.display}.`
      );
    } else {
      summary.push(`${topRg.label_vi.replace(/\[DATA:|\]/g, '')} dẫn đầu đóng góp khu vực với ${topRg.display}.`);
    }
  }

  // Summary sentence 3: Stability / Quality
  const momFact = fMonths.find((f) => f.label_vi.includes('Biến động tháng') || f.label_vi.includes('Tăng trưởng'));
  if (momFact) {
    summary.push(`Biến động doanh thu ghi nhận ${momFact.display} trong kỳ khảo sát.`);
  } else {
    summary.push(`Số liệu phản ánh đầy đủ ${factsTable.period} với các chiều phân loại tương ứng.`);
  }

  // -----------------------------------------------------------
  // Tier 2: By Metric (up to 2 sentences per selected metric)
  // -----------------------------------------------------------
  // Helper to ensure by_metric array
  const addMetricSentence = (metricId: string, text: string, refs: string[]) => {
    if (!by_metric[metricId]) by_metric[metricId] = [];
    if (by_metric[metricId].length < 2) {
      by_metric[metricId].push({ text, refs });
    }
  };

  // 1. total_revenue
  if (revFact) {
    addMetricSentence('total_revenue', `Tổng doanh thu đạt ${revFact.display}.`, [revFact.id]);
    if (orderFact) {
      addMetricSentence('total_revenue', `Quy mô doanh thu được tạo ra từ tổng số ${orderFact.display}.`, [revFact.id, orderFact.id]);
    }
  }

  // 2. total_orders
  if (orderFact) {
    addMetricSentence('total_orders', `Tổng số đơn hàng thực hiện trong kỳ đạt ${orderFact.display}.`, [orderFact.id]);
  }

  // 3. aov
  const aovFact = fTotal.find((f) => f.label_vi.includes('AOV') || f.label_vi.includes('trung bình mỗi đơn'));
  if (aovFact) {
    addMetricSentence('aov', `Giá trị trung bình mỗi đơn hàng đạt ${aovFact.display}.`, [aovFact.id]);
  }

  // 4. gross_profit
  if (profFact) {
    addMetricSentence('gross_profit', `Tổng lợi nhuận gộp ghi nhận ${profFact.display}.`, [profFact.id]);
  }

  // 5. gross_margin
  if (marginFact) {
    addMetricSentence('gross_margin', `Biên lợi nhuận gộp toàn kỳ đạt ${marginFact.display}.`, [marginFact.id]);
  }

  // 6. revenue_by_channel
  if (fChannels.length > 0) {
    const ch0 = fChannels[0];
    const isChannelTied = fChannels.length > 1 && fChannels[0].value === fChannels[1].value;
    if (isChannelTied) {
      addMetricSentence(
        'revenue_by_channel',
        `${ch0.label_vi.replace(/\[DATA:|\]/g, '')} và ${fChannels[1].label_vi.replace(/\[DATA:|\]/g, '')} đồng hạng với doanh thu ${ch0.display}.`,
        [ch0.id, fChannels[1].id]
      );
    } else {
      addMetricSentence('revenue_by_channel', `${ch0.label_vi.replace(/\[DATA:|\]/g, '')} có doanh thu cao nhất đạt ${ch0.display}.`, [ch0.id]);
    }
    if (fChannels.length > 1 && !isChannelTied) {
      const chLast = fChannels[fChannels.length - 1];
      addMetricSentence('revenue_by_channel', `${chLast.label_vi.replace(/\[DATA:|\]/g, '')} đạt mức doanh thu ${chLast.display}.`, [chLast.id]);
    }
  }

  // 7. revenue_by_region
  if (fRegions.length > 0) {
    const rg0 = fRegions[0];
    const isRegionTied = fRegions.length > 1 && fRegions[0].value === fRegions[1].value;
    if (isRegionTied) {
      addMetricSentence(
        'revenue_by_region',
        `${rg0.label_vi.replace(/\[DATA:|\]/g, '')} và ${fRegions[1].label_vi.replace(/\[DATA:|\]/g, '')} đồng hạng với doanh thu ${rg0.display}.`,
        [rg0.id, fRegions[1].id]
      );
    } else {
      addMetricSentence('revenue_by_region', `${rg0.label_vi.replace(/\[DATA:|\]/g, '')} đạt doanh thu cao nhất với ${rg0.display}.`, [rg0.id]);
    }
    if (fRegions.length > 1 && !isRegionTied) {
      const rgLast = fRegions[fRegions.length - 1];
      addMetricSentence('revenue_by_region', `${rgLast.label_vi.replace(/\[DATA:|\]/g, '')} ghi nhận doanh thu ${rgLast.display}.`, [rgLast.id]);
    }
  }

  // 8. revenue_by_month
  if (fMonths.length > 0) {
    const bestM = fMonths.find((f) => f.label_vi.includes('cao nhất')) || fMonths[0];
    addMetricSentence('revenue_by_month', `${bestM.label_vi.replace(/\[DATA:|\]/g, '')} đạt doanh thu ${bestM.display}.`, [bestM.id]);
    const worstM = fMonths.find((f) => f.label_vi.includes('thấp nhất'));
    if (worstM && worstM.id !== bestM.id) {
      addMetricSentence('revenue_by_month', `${worstM.label_vi.replace(/\[DATA:|\]/g, '')} đạt ${worstM.display}.`, [worstM.id]);
    }
  }

  // 9. revenue_growth
  if (momFact) {
    addMetricSentence('revenue_growth', `Tăng trưởng doanh thu tháng gần nhất ghi nhận ${momFact.display}.`, [momFact.id]);
  }

  // 10. revenue_by_product
  if (fProducts.length > 0) {
    const pr0 = fProducts.find((f) => f.label_vi.includes('cao nhất')) || fProducts[0];
    addMetricSentence('revenue_by_product', `${pr0.label_vi.replace(/\[DATA:|\]/g, '')} đạt ${pr0.display}.`, [pr0.id]);
  }

  // 11. margin_by_channel
  const fMarginCh = factsTable.facts.filter((f) => f.label_vi.includes('Biên LN Kênh') || (f.category === 'channel' && f.unit === '%'));
  if (fMarginCh.length > 0) {
    const mCh0 = fMarginCh[0];
    addMetricSentence('margin_by_channel', `${mCh0.label_vi.replace(/\[DATA:|\]/g, '')} đạt biên lợi nhuận ${mCh0.display}.`, [mCh0.id]);
  }

  // 12. margin_by_product
  const fMarginPr = factsTable.facts.filter((f) => f.label_vi.includes('Biên LN SP') || (f.category === 'product' && f.unit === '%'));
  if (fMarginPr.length > 0) {
    const mPr0 = fMarginPr[0];
    addMetricSentence('margin_by_product', `${mPr0.label_vi.replace(/\[DATA:|\]/g, '')} đạt ${mPr0.display}.`, [mPr0.id]);
  }

  // 13. channel_product_matrix
  const fMatrix = factsTable.facts.filter((f) => f.label_vi.includes('Ma trận'));
  if (fMatrix.length > 0) {
    addMetricSentence('channel_product_matrix', `${fMatrix[0].label_vi.replace(/\[DATA:|\]/g, '')} đạt ${fMatrix[0].display}.`, [fMatrix[0].id]);
  }

  // Followups
  followups.push('Theo dõi định kỳ chỉ số doanh thu để phát hiện biến động sớm.');

  // Legacy mappings for backward compatibility
  const legacyInsights: BusinessInsightItem[] = [];

  // 1. Overall
  if (revFact) {
    const ev = [revFact.id];
    if (profFact) ev.push(profFact.id);
    if (marginFact) ev.push(marginFact.id);
    legacyInsights.push({
      title: 'Doanh thu và biên lợi nhuận gộp',
      statement: summary[0] || `Tổng doanh thu kỳ ghi nhận đạt ${revFact.display}.`,
      evidence_ids: ev,
      confidence: 'cao',
    });
  }

  // 2. Channel
  if (fChannels.length > 0) {
    const isChannelTied = fChannels.length > 1 && fChannels[0].value === fChannels[1].value;
    const stmt = isChannelTied
      ? `${fChannels[0].label_vi.replace(/\[DATA:|\]/g, '')} và ${fChannels[1].label_vi.replace(/\[DATA:|\]/g, '')} đồng hạng/hòa nhau doanh thu đạt ${fChannels[0].display}.`
      : `${fChannels[0].label_vi.replace(/\[DATA:|\]/g, '')} dẫn đầu cơ cấu doanh thu với ${fChannels[0].display}.`;
    legacyInsights.push({
      title: 'Cơ cấu theo kênh bán hàng',
      statement: stmt,
      evidence_ids: fChannels.slice(0, 2).map((f) => f.id),
      confidence: 'cao',
    });
  } else {
    legacyInsights.push({
      title: 'Cơ cấu theo kênh bán hàng',
      statement: 'Dữ liệu không phân tách theo kênh bán hàng.',
      evidence_ids: factsTable.facts.slice(0, 1).map((f) => f.id),
      confidence: 'vừa',
    });
  }

  // 3. Month
  if (fMonths.length > 0) {
    legacyInsights.push({
      title: 'Xu hướng theo tháng',
      statement: `Ghi nhận số liệu qua ${fMonths.length} mốc thời gian, duy trì hoạt động bán hàng liên tục.`,
      evidence_ids: fMonths.slice(0, 2).map((f) => f.id),
      confidence: 'cao',
    });
  } else {
    legacyInsights.push({
      title: 'Xu hướng theo thời gian',
      statement: `Dữ liệu tập trung trong kỳ ${factsTable.period}.`,
      evidence_ids: factsTable.facts.slice(0, 1).map((f) => f.id),
      confidence: 'vừa',
    });
  }

  // 4. Product
  if (fProducts.length > 0) {
    legacyInsights.push({
      title: 'Top sản phẩm đóng góp',
      statement: `${fProducts[0].label_vi.replace(/\[DATA:|\]/g, '')} ghi nhận đóng góp ${fProducts[0].display}.`,
      evidence_ids: [fProducts[0].id],
      confidence: 'cao',
    });
  } else {
    legacyInsights.push({
      title: 'Danh mục sản phẩm',
      statement: 'Hoạt động kinh doanh ghi nhận trên các mặt hàng cung cấp.',
      evidence_ids: factsTable.facts.slice(0, 1).map((f) => f.id),
      confidence: 'vừa',
    });
  }

  // 5. Region (if exists)
  if (fRegions.length > 0) {
    const isRegionTied = fRegions.length > 1 && fRegions[0].value === fRegions[1].value;
    const stmt = isRegionTied
      ? `${fRegions[0].label_vi.replace(/\[DATA:|\]/g, '')} và ${fRegions[1].label_vi.replace(/\[DATA:|\]/g, '')} đồng hạng đạt ${fRegions[0].display}.`
      : `${fRegions[0].label_vi.replace(/\[DATA:|\]/g, '')} dẫn đầu khu vực với ${fRegions[0].display}.`;
    legacyInsights.push({
      title: 'Phân bố theo khu vực',
      statement: stmt,
      evidence_ids: fRegions.slice(0, 2).map((f) => f.id),
      confidence: 'cao',
    });
  }

  const hasMargin = Boolean(marginFact);
  const legacyRecs: BusinessRecommendationItem[] = [
    {
      action: 'Tập trung tối ưu kênh bán hàng chủ lực',
      rationale: hasMargin
        ? 'Dựa trên kết quả biên lợi nhuận gộp thực tế và hiệu quả doanh thu các kênh.'
        : 'Dựa trên hiệu quả doanh thu đóng góp từ các kênh bán hàng.',
      evidence_ids: fChannels.length > 0 ? [fChannels[0].id] : factsTable.facts.slice(0, 1).map((f) => f.id),
      expected_effect_note: hasMargin ? 'Bảo toàn biên lợi nhuận gộp và tối ưu chi phí.' : 'Thúc đẩy tăng trưởng doanh số bán hàng.',
      risk: '',
    },
    {
      action: 'Tiếp tục theo dõi và kiểm soát chi phí hoạt động',
      rationale: `Dựa trên kết quả thực tế kỳ ${factsTable.period}.`,
      evidence_ids: factsTable.facts.slice(0, 1).map((f) => f.id),
      expected_effect_note: 'Duy trì đà tăng trưởng ổn định.',
      risk: '',
    },
  ];

  const legacyLimits: string[] = [
    'Dữ liệu hiện tại chỉ bao gồm doanh thu, giá vốn và lợi nhuận gộp; các chi phí marketing khác không có số liệu theo dõi.',
    `Phân tích phản ánh dữ liệu trong kỳ ${factsTable.period}.`,
  ];

  const engineOutput = evaluateInsightRules(factsTable);
  const findings = engineOutput.findings;
  const priority_actions = engineOutput.priority_actions;
  const key_takeaways = engineOutput.key_takeaways.length > 0 ? engineOutput.key_takeaways : summary;

  return {
    source: 'template',
    model: 'template-local',
    facts_hash: factsTable.hash,
    latency_ms: options?.latency_ms ?? 0,
    rejected_count: options?.rejected_count ?? 0,
    rejected_reasons: options?.rejected_reasons ?? [],
    feedback_applied: options?.feedback_applied ? sanitizeDataLabel(options.feedback_applied, 200) : undefined,
    generated_at: new Date().toISOString(),
    findings,
    priority_actions,
    key_takeaways,
    summary,
    by_metric,
    followups,
    insights: legacyInsights,
    recommendations: legacyRecs,
    limitations: legacyLimits,
  };
}

/**
 * Verifies raw AI JSON payload strictly against FactsTable.
 * Enforces Prompt 5A 4-Layer Requirements + Prompt 3B Two-Tier Guardrails:
 * - Findings: rule_id match, number consistency, kpi_metric_id catalog check,
 *   check_after validation, forbidden certainty words check, meaning Jaccard < 0.8.
 * - Per-finding fallback: any rejected finding falls back to code template for that finding.
 * - Summary: max 3 sentences, valid numbers against facts.
 * - By Metric: max 2 sentences per metric, non-empty refs matching facts.
 */
export function verifyBusinessInsightsOutput(
  rawPayload: unknown,
  factsTable: FactsTable,
  meta: VerifyInsightsMeta
): BusinessInsightsReport {
  const factMap = new Map<string, FactItem>(factsTable.facts.map((f) => [f.id, f]));
  const allFactNums = collectAllowedNumbersForEvidence(Array.from(factMap.keys()), factMap);
  const rejectedReasons: string[] = [];
  let rejectedCount = 0;

  const templateReport = buildTemplateBusinessInsights(factsTable, {
    latency_ms: meta.latency_ms,
    feedback_applied: meta.feedback_applied,
  });

  if (!rawPayload || typeof rawPayload !== 'object') {
    return buildTemplateBusinessInsights(factsTable, {
      latency_ms: meta.latency_ms,
      rejected_count: 1,
      rejected_reasons: ['Phản hồi AI không phải đối tượng JSON hợp lệ.'],
      feedback_applied: meta.feedback_applied,
    });
  }

  const payload = rawPayload as RawAiBusinessInsightsPayload;
  const flags = meta.flags;
  const KNOWN_METRIC_IDS = new Set(BUSINESS_METRIC_CATALOG.map((m) => m.id));

  // -----------------------------------------------------------
  // Verify 4-Layer Findings (Prompt 5A)
  // -----------------------------------------------------------
  const verifiedFindings: InsightFinding[] = [];
  const rawFindings = Array.isArray(payload.findings) ? payload.findings : [];
  let hasAiFindingAccepted = false;

  for (const tmplFinding of templateReport.findings) {
    const rawMatch = rawFindings.find(
      (rf: any) => rf && typeof rf === 'object' && rf.rule_id === tmplFinding.rule_id
    ) as Record<string, any> | undefined;

    if (!rawMatch) {
      verifiedFindings.push(tmplFinding);
      continue;
    }

    const title = sanitizePlainText(rawMatch.title, 200);
    const evidence = sanitizePlainText(rawMatch.evidence, 450);
    const meaning = sanitizePlainText(rawMatch.meaning, 450);
    const oppRisk = sanitizePlainText(rawMatch.opportunity_risk, 450);
    const action = sanitizePlainText(rawMatch.action, 450);
    const kpiMetricId = String(rawMatch.kpi_metric_id || '').trim();
    const checkAfter = String(rawMatch.check_after || '').trim() as CheckAfterOption;
    const rawRefs: string[] = Array.isArray(rawMatch.source_refs) ? rawMatch.source_refs.map(String) : [];
    const validRefs = rawRefs.filter((r) => factMap.has(r));

    let findingValid = true;
    let failReason = '';

    if (
      !title ||
      !evidence ||
      !meaning ||
      !oppRisk ||
      !action ||
      validRefs.length === 0 ||
      rawRefs.some((r) => !factMap.has(r))
    ) {
      findingValid = false;
      failReason = `Thiếu nội dung hoặc mã refs không tồn tại trong finding ${tmplFinding.rule_id}`;
    }

    if (findingValid) {
      const allowedNums = [
        ...collectAllowedNumbersForEvidence(validRefs, factMap),
        ...allFactNums,
      ];
      const evTokens = [
        ...extractNumbersFromVietnameseText(evidence),
        ...extractNumbersFromVietnameseText(title),
      ];
      const badTokens = evTokens.filter((t) => !numberMatchesAllowed(t.parsed, allowedNums));
      if (badTokens.length > 0) {
        findingValid = false;
        failReason = `Số liệu lạ không khớp refs trong finding ${tmplFinding.rule_id}: ${badTokens.map((b) => b.raw).join(', ')}`;
      }
    }

    if (findingValid && !KNOWN_METRIC_IDS.has(kpiMetricId)) {
      findingValid = false;
      failReason = `kpi_metric_id "${kpiMetricId}" không nằm trong danh mục BUSINESS_METRIC_CATALOG`;
    }

    if (findingValid && !ALLOWED_CHECK_AFTER.includes(checkAfter)) {
      findingValid = false;
      failReason = `check_after "${checkAfter}" không hợp lệ (phải là 1 trong: ${ALLOWED_CHECK_AFTER.join(', ')})`;
    }

    if (
      findingValid &&
      (hasForbiddenCertaintyWords(title) ||
        hasForbiddenCertaintyWords(meaning) ||
        hasForbiddenCertaintyWords(oppRisk) ||
        hasForbiddenCertaintyWords(action))
    ) {
      findingValid = false;
      failReason = `Chứa từ ngữ khẳng định tuyệt đối hoặc emoji trong finding ${tmplFinding.rule_id}`;
    }

    if (
      findingValid &&
      (hasForbiddenCausalPhrases(title) ||
        hasForbiddenCausalPhrases(meaning) ||
        hasForbiddenCausalPhrases(oppRisk) ||
        hasForbiddenCausalPhrases(action))
    ) {
      findingValid = false;
      failReason = `Chứa từ ngữ khẳng định nguyên nhân không có trong dữ liệu trong finding ${tmplFinding.rule_id}`;
    }

    const isCodeOnlyFinding =
      tmplFinding.rule_id === 'R-NO-MARGIN' ||
      tmplFinding.rule_id === 'R-FEW-ROWS' ||
      tmplFinding.rule_id === 'R-UNLABELED';
    if (findingValid && !isCodeOnlyFinding && factsTable.metrics_result) {
      const feasibleSet = new Set(
        Object.entries(factsTable.metrics_result)
          .filter(([_, m]) => m && m.feasible)
          .map(([id]) => id)
      );
      if (feasibleSet.size > 0 && kpiMetricId && !feasibleSet.has(kpiMetricId)) {
        findingValid = false;
        failReason = `kpi_metric_id "${kpiMetricId}" không thuộc tập chỉ số tính được trong finding ${tmplFinding.rule_id}`;
      }
    }

    if (
      findingValid &&
      (hasForbiddenKeyword(title, flags) ||
        hasForbiddenKeyword(meaning, flags) ||
        hasForbiddenKeyword(oppRisk, flags) ||
        hasForbiddenKeyword(action, flags))
    ) {
      findingValid = false;
      failReason = `Vi phạm cờ đại lượng (has_*) trong finding ${tmplFinding.rule_id}`;
    }

    if (findingValid) {
      const jaccard = computeJaccardWordSimilarity(meaning, evidence);
      if (jaccard >= 0.8) {
        findingValid = false;
        failReason = `Tầng ý nghĩa chỉ nhắc lại số liệu của evidence (độ tương đồng Jaccard = ${jaccard.toFixed(2)} >= 0.8)`;
      }
    }

    if (findingValid) {
      verifiedFindings.push({
        rule_id: tmplFinding.rule_id,
        title,
        evidence,
        meaning,
        opportunity_risk: oppRisk,
        action,
        kpi_metric_id: kpiMetricId,
        check_after: checkAfter,
        source_refs: validRefs,
        isQuestionRelated: tmplFinding.isQuestionRelated,
      });
      hasAiFindingAccepted = true;
    } else {
      rejectedCount++;
      rejectedReasons.push(failReason);
      verifiedFindings.push(tmplFinding);
    }
  }

  // Key takeaways verification (max 3)
  const validTakeaways: string[] = [];
  const rawTakeaways = Array.isArray(payload.key_takeaways) ? payload.key_takeaways : [];
  for (const t of rawTakeaways.slice(0, 3)) {
    const text = sanitizePlainText(t, 350);
    if (text && !hasForbiddenCertaintyWords(text) && !hasForbiddenKeyword(text, flags)) {
      validTakeaways.push(text);
    }
  }
  const key_takeaways = validTakeaways.length > 0 ? validTakeaways : templateReport.key_takeaways;

  // Derive Priority Actions from verifiedFindings (max 3, unique kpi_metric_id)
  const priority_actions: InsightActionPriority[] = [];
  const seenKpiActions = new Set<string>();
  for (const f of verifiedFindings) {
    if (priority_actions.length >= 3) break;
    if (!seenKpiActions.has(f.kpi_metric_id)) {
      seenKpiActions.add(f.kpi_metric_id);
      priority_actions.push({
        action: f.action,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
      });
    }
  }

  // -----------------------------------------------------------
  // Verify Two-Tier (Prompt 3B backward compatibility)
  // -----------------------------------------------------------
  const validSummary: string[] = [];
  const rawSummary = Array.isArray(payload.summary) ? payload.summary : [];

  for (let i = 0; i < rawSummary.length && validSummary.length < 3; i++) {
    const rawSentence = rawSummary[i];
    const text = sanitizePlainText(rawSentence, 350);
    if (!text) continue;

    const kwErr = hasForbiddenKeyword(text, flags);
    if (kwErr) {
      rejectedCount++;
      rejectedReasons.push(`Loại câu tóm tắt #${i + 1}: ${kwErr}.`);
      continue;
    }

    const tokens = extractNumbersFromVietnameseText(text);
    const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allFactNums));
    if (badTokens.length > 0) {
      rejectedCount++;
      rejectedReasons.push(
        `Loại câu tóm tắt #${i + 1}: số liệu lạ không có trong bảng sự kiện (${badTokens.map((b) => b.raw).join(', ')}).`
      );
      continue;
    }

    validSummary.push(text);
  }

  const validByMetric: Record<string, ByMetricSentence[]> = {};
  const rawByMetric = payload.by_metric && typeof payload.by_metric === 'object' ? payload.by_metric : {};

  for (const [metricId, rawSentences] of Object.entries(rawByMetric)) {
    if (!Array.isArray(rawSentences)) continue;
    const allowedMetricEvents = meta.metricEventMap?.[metricId];
    const metricSentences: ByMetricSentence[] = [];

    for (let i = 0; i < rawSentences.length && metricSentences.length < 2; i++) {
      const item = rawSentences[i] as any;
      const text = sanitizePlainText(item?.text, 350);
      const refsRaw: string[] = Array.isArray(item?.refs) ? item.refs.map(String) : [];
      const validRefs = refsRaw.filter((r: string) => factMap.has(r));
      const hasInvalidRef = refsRaw.some((r: string) => !factMap.has(r));

      if (!text || validRefs.length === 0 || hasInvalidRef) {
        rejectedCount++;
        rejectedReasons.push(`Loại câu chỉ số "${metricId}" #${i + 1}: thiếu nội dung hoặc mã refs không tồn tại.`);
        continue;
      }

      if (allowedMetricEvents && allowedMetricEvents.length > 0) {
        const foreignRef = validRefs.find((r: string) => !allowedMetricEvents.includes(r));
        if (foreignRef) {
          rejectedCount++;
          rejectedReasons.push(`Loại câu chỉ số "${metricId}" #${i + 1}: refs ${foreignRef} không thuộc chỉ số này.`);
          continue;
        }
      }

      const kwErr = hasForbiddenKeyword(text, flags);
      if (kwErr) {
        rejectedCount++;
        rejectedReasons.push(`Loại câu chỉ số "${metricId}" #${i + 1}: ${kwErr}.`);
        continue;
      }

      const allowedNumsForRefs = collectAllowedNumbersForEvidence(validRefs, factMap);
      const tokens = extractNumbersFromVietnameseText(text);
      const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allowedNumsForRefs));
      if (badTokens.length > 0) {
        rejectedCount++;
        rejectedReasons.push(
          `Loại câu chỉ số "${metricId}" #${i + 1}: phát hiện số liệu lạ không khớp refs (${badTokens.map((b) => b.raw).join(', ')}).`
        );
        continue;
      }

      metricSentences.push({ text, refs: validRefs });
    }

    if (metricSentences.length > 0) {
      validByMetric[metricId] = metricSentences;
    }
  }

  // -----------------------------------------------------------
  // Verify Legacy format (Prompt M3-B backward compatibility)
  // -----------------------------------------------------------
  const validLegacyInsights: BusinessInsightItem[] = [];
  const validLegacyRecs: BusinessRecommendationItem[] = [];

  if (Array.isArray(payload.insights) && payload.insights.length > 0) {
    for (const item of payload.insights.slice(0, 5)) {
      const title = sanitizePlainText(item?.title, 140);
      const statement = sanitizePlainText(item?.statement, 450);
      const evRaw = Array.isArray(item?.evidence_ids) ? item.evidence_ids.map(String) : [];
      const validEv = evRaw.filter((id) => factMap.has(id));
      if (!title || !statement || validEv.length === 0 || evRaw.some((id) => !factMap.has(id))) {
        rejectedCount++;
        continue;
      }
      const allowedNums = collectAllowedNumbersForEvidence(validEv, factMap);
      const tokens = extractNumbersFromVietnameseText(statement);
      const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allowedNums));
      if (badTokens.length > 0) {
        rejectedCount++;
        continue;
      }
      validLegacyInsights.push({ title, statement, evidence_ids: validEv, confidence: 'cao' });
    }

    if (Array.isArray(payload.recommendations)) {
      for (const item of payload.recommendations.slice(0, 5)) {
        const action = sanitizePlainText(item?.action, 200);
        const rationale = sanitizePlainText(item?.rationale, 350);
        const evRaw = Array.isArray(item?.evidence_ids) ? item.evidence_ids.map(String) : [];
        const validEv = evRaw.filter((id) => factMap.has(id));
        if (!action || !rationale || validEv.length === 0 || evRaw.some((id) => !factMap.has(id))) {
          rejectedCount++;
          continue;
        }
        const allowedNums = collectAllowedNumbersForEvidence(validEv, factMap);
        const tokens = [
          ...extractNumbersFromVietnameseText(action),
          ...extractNumbersFromVietnameseText(rationale),
          ...extractNumbersFromVietnameseText(String((item as any)?.expected_effect_note || '')),
        ];
        const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allowedNums));
        if (badTokens.length > 0) {
          rejectedCount++;
          continue;
        }
        validLegacyRecs.push({
          action,
          rationale,
          evidence_ids: validEv,
          expected_effect_note: sanitizePlainText(item?.expected_effect_note, 200),
          risk: sanitizePlainText(item?.risk, 200),
        });
      }
    }
  }

  const totalSentences = validSummary.length + Object.values(validByMetric).reduce((sum, s) => sum + s.length, 0);

  // Complete fallback check: if no findings, no two-tier sentences, and no legacy insights survived
  if (!hasAiFindingAccepted && totalSentences === 0 && validLegacyInsights.length === 0) {
    return buildTemplateBusinessInsights(factsTable, {
      latency_ms: meta.latency_ms,
      rejected_count: rejectedCount,
      rejected_reasons: rejectedReasons.length > 0 ? rejectedReasons : ['Toàn bộ câu nhận định không đạt yêu cầu kiểm chứng.'],
      feedback_applied: meta.feedback_applied,
    });
  }

  // Prepend rejected count summary if any items were rejected
  if (rejectedCount > 0) {
    rejectedReasons.unshift(`Đã loại ${rejectedCount} câu không đạt kiểm tra.`);
  }

  const legacyInsights: BusinessInsightItem[] =
    validLegacyInsights.length > 0
      ? validLegacyInsights
      : (validSummary.length > 0 ? validSummary : templateReport.summary).map((text, i) => ({
          title: `Tóm tắt ${i + 1}`,
          statement: text,
          evidence_ids: factsTable.facts.slice(0, 2).map((f) => f.id),
          confidence: 'cao' as InsightConfidence,
        }));

  const followupsRaw = Array.isArray(payload.followups)
    ? payload.followups.map((f) => sanitizePlainText(f, 200)).filter(Boolean).slice(0, 2)
    : templateReport.followups || [];

  const isAiReport = hasAiFindingAccepted || totalSentences > 0 || validLegacyInsights.length > 0;

  return {
    source: isAiReport ? 'ai' : 'template',
    model: isAiReport ? meta.model : 'template-local',
    facts_hash: factsTable.hash,
    latency_ms: meta.latency_ms,
    rejected_count: rejectedCount,
    rejected_reasons: rejectedReasons,
    feedback_applied: meta.feedback_applied ? sanitizeDataLabel(meta.feedback_applied, 200) : undefined,
    generated_at: new Date().toISOString(),
    findings: verifiedFindings.length > 0 ? verifiedFindings : templateReport.findings,
    priority_actions: priority_actions.length > 0 ? priority_actions : templateReport.priority_actions,
    key_takeaways,
    summary: validSummary.length > 0 ? validSummary : (hasAiFindingAccepted ? [] : templateReport.summary),
    by_metric: payload.by_metric ? validByMetric : templateReport.by_metric,
    followups: followupsRaw,
    insights: legacyInsights,
    recommendations: validLegacyRecs,
    limitations: [`Phân tích chỉ dựa trên dữ liệu đã nạp trong kỳ ${factsTable.period}.`],
  };
}
