/**
 * Question Suggestions & Context Input Helpers (Prompt U2).
 * Single source of truth for clickable analysis question suggestions,
 * capability-verified filtering (never shows questions the app cannot answer),
 * question line toggling, and Vietnamese word counting.
 *
 * Pure TypeScript - zero external dependencies, zero AI calls.
 */

import { METRIC_DEFINITIONS, chartBackingMetrics } from '../metrics/metricSpec';
import { BUSINESS_PROFILE_CAPABILITIES } from '../cleaner/businessCleaner';

export type SuggestionGroup = 'business' | 'trading' | 'general';

export interface QuestionSuggestion {
  id: string;
  text: string;
  group: SuggestionGroup;
  needs: readonly string[];
}

export const MAX_ANALYSIS_QUESTIONS = 8;
export const EXTRA_INFO_MAX_CHARS = 2000;
export const EXTRA_INFO_MIN_RECOMMENDED_CHARS = 40;

const GENERAL_CAPABILITIES: readonly string[] = [
  'data_summary',
  'data_quality_profile',
];

const TRADING_CAPABILITIES: ReadonlySet<string> = new Set([
  ...Object.keys(METRIC_DEFINITIONS),
  ...Object.keys(chartBackingMetrics),
  ...GENERAL_CAPABILITIES,
]);

const BUSINESS_CAPABILITIES: ReadonlySet<string> = new Set([
  ...BUSINESS_PROFILE_CAPABILITIES,
  ...GENERAL_CAPABILITIES,
]);

const GENERAL_CAPABILITY_SET: ReadonlySet<string> = new Set(GENERAL_CAPABILITIES);

/**
 * Returns the set of real, currently implemented metric/chart/profile capability IDs
 * for a given suggestion group.
 */
export function getAvailableCapabilities(group: SuggestionGroup): ReadonlySet<string> {
  if (group === 'trading') return TRADING_CAPABILITIES;
  if (group === 'business') return BUSINESS_CAPABILITIES;
  return GENERAL_CAPABILITY_SET;
}

/**
 * Complete catalog of candidate suggestions across all 3 groups.
 * Only items whose `needs` are 100% present in the corresponding group's
 * implemented capabilities are displayed to users via `getVisibleSuggestions`.
 */
export const ALL_SUGGESTIONS: readonly QuestionSuggestion[] = [
  // --- Nhóm Kinh doanh / bán lẻ (9 ứng viên; 7 khả dụng hiện tại, 2 chờ chỉ số mở rộng) ---
  {
    id: 'biz_revenue_by_channel',
    text: 'Doanh thu theo kênh bán nào cao nhất?',
    group: 'business',
    needs: ['biz_revenue_by_channel'],
  },
  {
    id: 'biz_revenue_by_product',
    text: 'Sản phẩm nào đóng góp nhiều doanh thu nhất?',
    group: 'business',
    needs: ['biz_revenue_by_product'],
  },
  {
    id: 'biz_margin_channel_product',
    text: 'Biên lợi nhuận gộp của từng kênh và từng sản phẩm ra sao?',
    group: 'business',
    needs: ['biz_margin_by_channel', 'biz_margin_by_product'],
  },
  {
    id: 'biz_lowest_margin_product',
    text: 'Sản phẩm nào có biên lợi nhuận thấp nhất cần chú ý?',
    group: 'business',
    needs: ['biz_margin_by_product'],
  },
  {
    id: 'biz_lowest_revenue_region',
    text: 'Khu vực nào có doanh thu thấp nhất?',
    group: 'business',
    needs: ['biz_revenue_by_region'],
  },
  {
    id: 'biz_revenue_by_month',
    text: 'Doanh thu thay đổi thế nào qua các tháng?',
    group: 'business',
    needs: ['biz_revenue_by_month'],
  },
  {
    id: 'biz_aov_by_channel',
    text: 'Kênh nào có giá trị đơn hàng trung bình cao nhất?',
    group: 'business',
    // Chưa có chỉ số AOV phân tách theo từng kênh trong businessCleaner/metricSpec
    needs: ['biz_aov_by_channel'],
  },
  {
    id: 'biz_mom_revenue_delta',
    text: 'Tháng gần nhất so với tháng trước tăng hay giảm bao nhiêu?',
    group: 'business',
    // Chưa có chỉ số so sánh chênh lệch tháng gần nhất so với tháng liền trước (MoM)
    needs: ['biz_mom_revenue_delta'],
  },
  {
    id: 'biz_data_quality',
    text: 'Dữ liệu có dòng trống, trùng lặp hay bất thường nào không?',
    group: 'business',
    needs: ['data_quality_profile'],
  },

  // --- Nhóm Giao dịch / chứng khoán (7 ứng viên; 7/7 khả dụng) ---
  {
    id: 'trd_best_return',
    text: 'Mã nào sinh lời tốt nhất trong kỳ?',
    group: 'trading',
    needs: ['period_return', 'symbol_returns', 'top_performer'],
  },
  {
    id: 'trd_highest_risk',
    text: 'Mã nào rủi ro (biến động) cao nhất?',
    group: 'trading',
    needs: ['ann_vol', 'highest_volatility'],
  },
  {
    id: 'trd_max_drawdown',
    text: 'Mã nào có mức sụt giảm tối đa sâu nhất?',
    group: 'trading',
    needs: ['max_dd', 'chart_drawdown'],
  },
  {
    id: 'trd_volume_change',
    text: 'Khối lượng giao dịch thay đổi thế nào?',
    group: 'trading',
    needs: ['avg_volume', 'volume_spike_days', 'chart_volume_combo'],
  },
  {
    id: 'trd_ma_trend',
    text: 'Xu hướng giá hiện tại ra sao (MA20 so với MA50)?',
    group: 'trading',
    needs: ['ma20', 'ma50', 'ma_state', 'chart_price_ma'],
  },
  {
    id: 'trd_correlation',
    text: 'Các mã có biến động cùng chiều với nhau không?',
    group: 'trading',
    needs: ['correlation', 'chart_correlation'],
  },
  {
    id: 'trd_anomalies',
    text: 'Có phiên giao dịch nào bất thường không?',
    group: 'trading',
    needs: ['best_day', 'worst_day', 'volume_spike_days', 'chart_top_days'],
  },

  // --- Nhóm Chung (2 ứng viên; 2/2 khả dụng) ---
  {
    id: 'gen_summary',
    text: 'Tóm tắt các điểm chính của dữ liệu này.',
    group: 'general',
    needs: ['data_summary'],
  },
  {
    id: 'gen_reliability',
    text: 'Dữ liệu có đáng tin cậy để phân tích không?',
    group: 'general',
    needs: ['data_quality_profile'],
  },
];

/**
 * Checks whether every capability ID in `suggestion.needs` exists in the
 * currently implemented metric/chart/profile registry for its group.
 */
export function isSuggestionSupported(suggestion: QuestionSuggestion): boolean {
  if (!suggestion.needs || suggestion.needs.length === 0) return false;
  const available = getAvailableCapabilities(suggestion.group);
  return suggestion.needs.every((id) => available.has(id));
}

/**
 * Returns ONLY suggestions that the application can genuinely answer today.
 * Optionally filtered by group.
 */
export function getVisibleSuggestions(group?: SuggestionGroup): QuestionSuggestion[] {
  return ALL_SUGGESTIONS.filter((s) => {
    if (group && s.group !== group) return false;
    return isSuggestionSupported(s);
  });
}

/**
 * Returns suggestions currently excluded because one or more required metrics
 * are not yet implemented. Useful for transparency & diagnostics.
 */
export function getUnsupportedSuggestions(group?: SuggestionGroup): QuestionSuggestion[] {
  return ALL_SUGGESTIONS.filter((s) => {
    if (group && s.group !== group) return false;
    return !isSuggestionSupported(s);
  });
}

/**
 * Normalizes a question string for case-insensitive comparison.
 */
function normalizeQuestionKey(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Extracts non-empty trimmed question lines from a multi-line textarea value.
 */
export function parseQuestionLines(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Checks if a question already exists in the multi-line text (case-insensitive).
 */
export function hasQuestionInText(text: string, question: string): boolean {
  const target = normalizeQuestionKey(question);
  if (!target) return false;
  return parseQuestionLines(text).some((line) => normalizeQuestionKey(line) === target);
}

export interface ToggleQuestionResult {
  nextText: string;
  action: 'added' | 'removed' | 'limit_reached';
  count: number;
}

/**
 * Adds a question on a new line if absent (up to `maxQuestions`, default 8),
 * or removes it if already present (case-insensitive).
 * Never overwrites existing questions.
 */
export function toggleQuestionInText(
  text: string,
  question: string,
  maxQuestions: number = MAX_ANALYSIS_QUESTIONS
): ToggleQuestionResult {
  const cleaned = question.trim();
  const lines = parseQuestionLines(text);
  const targetKey = normalizeQuestionKey(cleaned);

  if (!targetKey) {
    return { nextText: text, action: 'removed', count: lines.length };
  }

  const existingIndex = lines.findIndex((line) => normalizeQuestionKey(line) === targetKey);
  if (existingIndex !== -1) {
    const remaining = lines.filter((_, idx) => idx !== existingIndex);
    return {
      nextText: remaining.join('\n'),
      action: 'removed',
      count: remaining.length,
    };
  }

  if (lines.length >= maxQuestions) {
    return {
      nextText: text,
      action: 'limit_reached',
      count: lines.length,
    };
  }

  const updated = [...lines, cleaned];
  return {
    nextText: updated.join('\n'),
    action: 'added',
    count: updated.length,
  };
}

/**
 * Returns the top N (default 3) visible popular suggestions for a group.
 */
export function getTopPopularQuestions(group: SuggestionGroup, count: number = 3): string[] {
  return getVisibleSuggestions(group)
    .slice(0, count)
    .map((s) => s.text);
}

/**
 * Counts words in Vietnamese/Unicode text accurately across multiple spaces, tabs, and newlines.
 */
export function countVietnameseWords(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
