/**
 * Pure Number & Evidence Checking Engine for Narrative Paragraphs (Prompt P5 Section 6).
 * Strictly zero dependencies on UI, LLM, or services.
 * Implements hallucination detection, evidence key binding, and forbidden phrase validation.
 */

import type { Metric, NumberCheckIssue } from '../schemas';
import { chartBackingMetrics, parseEvidenceKey } from '../metrics/metricSpec';
import { findForbiddenPhrases } from './forbidden';

export interface DataNotesContext {
  raw_rows?: number;
  clean_rows?: number;
  dropped_rows?: number;
  operations_enabled?: number;
  flagged_outliers?: number;
  warnings_count?: number;
}

export interface CheckContext {
  metrics: Metric[];
  data_notes?: DataNotesContext;
  symbols: string[];
  trading_days?: number;
  min_sessions?: number;
  validChartKeys?: string[];
}

export interface ExtractedNumberToken {
  raw: string;
  value: number;
  decimals: number;
  index: number;
  isDate?: boolean;
}

/**
 * Normalizes Vietnamese number strings to float.
 * Handles thousands separator (.) and decimal separator (,) as well as percentage (%) and sign (+/-).
 * Examples:
 *   "34,65%" -> 34.65, decimals: 2, isPercent: true
 *   "858.245" -> 858245, decimals: 0, isPercent: false (dot thousands separator)
 *   "70,37" -> 70.37, decimals: 2, isPercent: false
 *   "12.72%" -> 12.72, decimals: 2, isPercent: true
 */
export function parseVietnameseNumber(str: string): { value: number; decimals: number; isPercent: boolean } | null {
  const clean = str.trim();
  const isPercent = clean.endsWith('%');
  let numStr = isPercent ? clean.slice(0, -1).trim() : clean;

  // Remove leading +
  if (numStr.startsWith('+')) numStr = numStr.slice(1);

  let decimals = 0;
  // If format is like "858.245" or "1.234.567" (dot as thousands separator and 3 digits groups)
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(numStr)) {
    const commaIdx = numStr.indexOf(',');
    if (commaIdx !== -1) {
      decimals = numStr.slice(commaIdx + 1).length;
    } else {
      decimals = 0;
    }
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else if (/^[+-]?\d+,\d+$/.test(numStr)) {
    // Comma as decimal separator e.g. "70,37"
    decimals = numStr.split(',')[1]?.length || 0;
    numStr = numStr.replace(',', '.');
  } else if (/^[+-]?\d+\.\d+$/.test(numStr)) {
    // Dot as decimal separator e.g. "34.65"
    decimals = numStr.split('.')[1]?.length || 0;
  } else {
    // Integer
    decimals = 0;
  }

  const parsed = parseFloat(numStr);
  if (isNaN(parsed)) return null;

  return { value: parsed, decimals, isPercent };
}

/**
 * Extracts all numeric tokens from text while masking out identifiers like MA20, RSI14, TMA, SHA-256.
 */
export function extractNumberTokens(text: string): ExtractedNumberToken[] {
  const tokens: ExtractedNumberToken[] = [];

  // Mask out identifiers where letters touch numbers without spaces (e.g. MA20, MA50, RSI14, V1, SHA-256)
  // We replace them with spaces of exact same length to preserve character indices
  const maskedText = text.replace(/([a-zA-Z\p{L}_]+[0-9]+|[0-9]+[a-zA-Z\p{L}_]+)/gu, (match) =>
    ' '.repeat(match.length)
  );

  // 1. Extract dates: DD/MM/YYYY or DD-MM-YYYY
  const dateRegex = /(?<![\p{L}\p{N}])(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?![\p{L}\p{N}])/gu;
  let match: RegExpExecArray | null;

  while ((match = dateRegex.exec(maskedText)) !== null) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    tokens.push({ raw: match[1], value: day, decimals: 0, index: match.index, isDate: true });
    tokens.push({ raw: match[2], value: month, decimals: 0, index: match.index, isDate: true });
    tokens.push({ raw: match[3], value: year, decimals: 0, index: match.index, isDate: true });
  }

  // 2. Extract percentages and general numbers
  // Matches:
  // - [+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?%?
  // - [+-]?\d+(?:[.,]\d+)?%?
  const numRegex = /(?<![\p{L}\p{N}])([+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?%?|[+-]?\d+(?:[.,]\d+)?%?)(?![\p{L}\p{N}])/gu;

  while ((match = numRegex.exec(maskedText)) !== null) {
    const raw = match[0];
    if (!raw || raw.trim() === '') continue;

    // Skip if this token was already part of an extracted date
    const idx = match.index;
    const isPartOfDate = tokens.some((t) => t.isDate && idx >= t.index && idx < t.index + t.raw.length);
    if (isPartOfDate) continue;

    const parsed = parseVietnameseNumber(raw);
    if (parsed !== null) {
      tokens.push({
        raw,
        value: parsed.value,
        decimals: parsed.decimals,
        index: idx,
      });
    }
  }

  return tokens;
}

/**
 * Checks if a candidate number matches a target value within decimal rounding and precision tolerance.
 * Enforces exact equality after rounding target to the written decimal places:
 * |round(|v| * 10^d) - round(|t| * 10^d)| < 1e-6.
 * Zero relative tolerance (no 0.5% float tolerance, no +-1 integer tolerance).
 */
export function isNumberMatch(candidate: number, target: number, decimals: number): boolean {
  if (isNaN(candidate) || isNaN(target)) return false;

  const factor = Math.pow(10, decimals);
  const candScaled = Math.round(Math.abs(candidate) * factor);
  const targetScaled = Math.round(Math.abs(target) * factor);

  return Math.abs(candScaled - targetScaled) < 1e-6;
}

/**
 * Checks if a numeric token appears in a parameter or metadata context
 * (e.g. MA 20, RSI 14, 20 phiên, 252 phiên, or section numbering).
 * Numbers in parameter context are exempt from requiring metric evidence.
 * Disallows trailing %, currency symbols, or measure units.
 */
export function isParameterContext(
  text: string,
  token: ExtractedNumberToken,
  paramCandidates: number[]
): boolean {
  // If the number is not in the parameter candidates list, it cannot be exempt as a parameter
  if (!paramCandidates.some((p) => Math.abs(token.value - p) < 1e-6)) {
    return false;
  }

  // 1. Check section numbering at start of paragraph: e.g. "1. " or "2) "
  const startMatch = text.match(/^\s*(\d+)[\.\)]\s+/);
  if (startMatch && token.index < startMatch[0].length) {
    if (parseInt(startMatch[1], 10) === token.value) {
      return true;
    }
  }

  const textBefore = text.slice(0, token.index);
  const textAfter = text.slice(token.index + token.raw.length);

  // 2. Strict Rejections:
  // (a) Trailing %: e.g. "20%", "14%"
  if (/^\s*%/u.test(textAfter)) return false;

  // (b) Trailing currencies: e.g. "20 đ", "$20"
  if (/^\s*(?:đ|vnđ|vnd|\$|usd)(?![\p{L}\p{N}])/iu.test(textAfter)) return false;

  // (c) Trailing points / pts: e.g. "20 điểm", "tăng 20 điểm" (except outlier points count)
  if (/^\s*(?:điểm|pts|points)(?![\p{L}\p{N}])/iu.test(textAfter) && !/^\s*(?:điểm\s+(?:giá\s+)?bất thường)/iu.test(textAfter)) {
    return false;
  }

  // (d) Trailing multiplier "lần" (except when specifying standard deviation multiplier, e.g. "2 lần độ lệch chuẩn"):
  if (/^\s*lần(?!\s+(?:độ\s+lệch\s+chuẩn|std))(?![\p{L}\p{N}])/iu.test(textAfter)) return false;

  // (e) Preceded by comparison/gain/loss/multiplier verbs: "gấp", "đạt", "tăng", "giảm", "lãi", "lỗ", "hơn", "kém", "khoảng"
  if (/(?:gấp|đạt|tăng|giảm|lãi|lỗ|hơn|kém|khoảng|tổng cộng)\s*$/iu.test(textBefore)) {
    return false;
  }

  // (f) Preceded by financial value metrics: "khối lượng", "giá", "lợi suất", "volume", "kl"
  if (/(?:khối lượng|volume|kl|giá|lợi suất)\s*$/iu.test(textBefore)) {
    return false;
  }

  // (g) Consecutive session counts: e.g. "14 phiên tăng liên tiếp", "20 phiên liên tiếp"
  if (/^\s*phiên\s+(?:tăng|giảm|liên tiếp)/iu.test(textAfter) || /liên tiếp/iu.test(textAfter.slice(0, 30))) {
    return false;
  }

  // 3. Metadata Data Notes Counts (e.g. operations_enabled, flagged_outliers, warnings_count, dropped_rows, clean_rows)
  if (/^\s*(?:điểm(?:\s+giá)?\s+bất\s+thường|thao\s+tác|cảnh\s+báo|bản\s+ghi|dòng)(?![\p{L}\p{N}])/iu.test(textAfter)) {
    return true;
  }

  // 4. Symbol count: e.g. "2 mã", "3 mã cổ phiếu"
  if (/^\s*(?:mã|cổ phiếu)(?![\p{L}\p{N}])/iu.test(textAfter)) {
    return true;
  }

  // 5. Exact Context Checks for Canonical Formula Parameters:
  // Case 0 (Risk-free rate Rf = 0)
  if (token.value === 0) {
    if (/(?:phi rủi ro|lãi suất|bằng|mốc)\s*(?:bằng\s*)?$/iu.test(textBefore)) {
      return true;
    }
    return false;
  }

  // Case 2 (Volume spike factor: 2*std)
  if (token.value === 2) {
    if (/(?:cộng|\+|hệ số)\s*(?:bằng\s*)?$/iu.test(textBefore) || /^\s*(?:lần\s+)?(?:độ lệch chuẩn|std)/iu.test(textAfter)) {
      return true;
    }
    return false;
  }

  // Case 100 (Base index 100)
  if (token.value === 100) {
    if (/(?:mốc|cơ sở|chuẩn hóa)\s*(?:về\s*)?$/iu.test(textBefore)) {
      return true;
    }
    return false;
  }

  // Case 14 (RSI window)
  if (token.value === 14) {
    if (/(?:RSI|chỉ số RSI|chu kỳ|cửa sổ|độ rộng)\s*(?:bằng\s*|\()?\s*$/iu.test(textBefore)) {
      return true;
    }
    if (/(?:RSI|chỉ số RSI)[^.,;]{0,25}$/iu.test(textBefore) && /^\s*(?:phiên|\))/iu.test(textAfter)) {
      return true;
    }
    return false;
  }

  // Case 20 (MA20 window, volume 20d mean)
  if (token.value === 20) {
    if (/(?:MA|SMA|EMA|đường MA|trung bình động|trung bình|chu kỳ|cửa sổ|bội số)\s*(?:bằng\s*|\()?\s*$/iu.test(textBefore)) {
      return true;
    }
    if (/(?:MA|SMA|EMA|đường MA|trung bình động)[^.,;]{0,25}$/iu.test(textBefore) && /^\s*(?:phiên|\))/iu.test(textAfter)) {
      return true;
    }
    if (/^\s*phiên(?!\s+(?:tăng|giảm|liên tiếp))/iu.test(textAfter) && /(?:trung bình|cửa sổ|chu kỳ)/iu.test(textBefore.slice(-30))) {
      return true;
    }
    return false;
  }

  // Case 50 (MA50 window)
  if (token.value === 50) {
    if (/(?:MA|SMA|EMA|đường MA|trung bình động|chu kỳ|cửa sổ)\s*(?:bằng\s*|\()?\s*$/iu.test(textBefore)) {
      return true;
    }
    if (/(?:MA|SMA|EMA|đường MA|trung bình động)[^.,;]{0,25}$/iu.test(textBefore) && /^\s*(?:phiên|\))/iu.test(textAfter)) {
      return true;
    }
    if (/^\s*phiên(?!\s+(?:tăng|giảm|liên tiếp))/iu.test(textAfter) && /(?:trung bình|cửa sổ|chu kỳ)/iu.test(textBefore.slice(-30))) {
      return true;
    }
    return false;
  }

  // Case 252 (Annualized trading days)
  if (token.value === 252) {
    if (/(?:năm hóa|hóa năm|chuẩn hóa|quy năm|tính theo|cơ số)\s*(?:theo\s*)?$/iu.test(textBefore) && /^\s*(?:phiên|ngày)/iu.test(textAfter)) {
      return true;
    }
    if (/^\s*(?:phiên|ngày)\s*(?:mỗi\s+năm|hàng\s+năm|quy\s+năm|\/\s*năm)/iu.test(textAfter)) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Validates a single paragraph against its evidence and the dataset context.
 */
export function checkParagraph(
  paragraph: {
    id: string;
    text: string;
    evidence: string[];
  },
  context: CheckContext
): NumberCheckIssue[] {
  const issues: NumberCheckIssue[] = [];
  const text = paragraph.text || '';
  const evidence = paragraph.evidence || [];

  // 1. Check EMPTY condition
  if (text.trim().length === 0) {
    issues.push({
      token: '',
      reason: 'EMPTY',
      detail_vi: 'Đoạn văn nhận định rỗng, không có nội dung.',
    });
    return issues;
  }

  if (evidence.length === 0) {
    issues.push({
      token: '',
      reason: 'EMPTY',
      detail_vi: 'Đoạn văn nhận định không khai báo căn cứ (evidence).',
    });
  }

  // 2. Check FORBIDDEN_PHRASE
  const forbiddenMatches = findForbiddenPhrases(text);
  for (const f of forbiddenMatches) {
    issues.push({
      token: f.matched,
      reason: 'FORBIDDEN_PHRASE',
      detail_vi: `Chứa cụm từ cấm: "${f.matched}". Không được khuyến nghị, dự báo hoặc dùng tin tức ngoài số liệu.`,
    });
  }

  // Build candidate parameter numbers (only exempt when in parameter context)
  const paramCandidates: number[] = [
    context.trading_days ?? 252,
    context.min_sessions ?? 30,
    0,  // Risk-free rate Rf = 0
    20, // MA20 window
    50, // MA50 window
    14, // RSI window
    2,  // Volume spike factor (2*std)
    100,// Base index 100 for normalization
    context.symbols.length, // Number of symbols analyzed
  ];

  // Data notes numbers (also parameters)
  if (context.data_notes) {
    const dn = context.data_notes;
    if (dn.raw_rows !== undefined) paramCandidates.push(dn.raw_rows);
    if (dn.clean_rows !== undefined) paramCandidates.push(dn.clean_rows);
    if (dn.dropped_rows !== undefined) paramCandidates.push(dn.dropped_rows);
    if (dn.operations_enabled !== undefined) paramCandidates.push(dn.operations_enabled);
    if (dn.flagged_outliers !== undefined) paramCandidates.push(dn.flagged_outliers);
    if (dn.warnings_count !== undefined) paramCandidates.push(dn.warnings_count);
  }

  // Allowed dates list for date tokens
  const allowedDates: number[] = [];
  for (let m = 1; m <= 12; m++) allowedDates.push(m); // Allowed months for isDate tokens

  // Helper to extract numbers and dates from any text/calc into an array of allowed numbers
  const extractNumbersFromMetric = (m: Metric, target: number[]) => {
    if (m.value !== null && m.value !== undefined && !isNaN(m.value)) {
      target.push(m.value);
      if (m.unit === 'ratio') target.push(m.value * 100);
    }
    if (m.delta?.value !== null && m.delta?.value !== undefined && !isNaN(m.delta.value)) {
      target.push(m.delta.value);
      if (m.unit === 'ratio') target.push(m.delta.value * 100);
    }
    if (m.text) {
      const extracted = extractNumberTokens(m.text);
      for (const t of extracted) target.push(t.value);
    }
    if (m.calc) {
      for (const item of m.calc) {
        if (typeof item.value === 'number' && !isNaN(item.value)) {
          target.push(item.value);
          if (item.unit === 'ratio') target.push(item.value * 100);
        } else if (typeof item.value === 'string') {
          const extracted = extractNumberTokens(item.value);
          for (const t of extracted) target.push(t.value);
        }
      }
    }
    if (m.period) {
      const dFrom = new Date(m.period.from);
      const dTo = new Date(m.period.to);
      if (!isNaN(dFrom.getTime())) {
        allowedDates.push(dFrom.getUTCDate(), dFrom.getUTCMonth() + 1, dFrom.getUTCFullYear());
      }
      if (!isNaN(dTo.getTime())) {
        allowedDates.push(dTo.getUTCDate(), dTo.getUTCMonth() + 1, dTo.getUTCFullYear());
      }
    }
  };

  // 3. Build global map of ALL metric values in dataset (for NOT_IN_EVIDENCE classification)
  const globalMetricValues: Array<{ val: number; key: string; label: string }> = [];
  for (const m of context.metrics) {
    const sym = m.symbol ? m.symbol : '*';
    const key = `m:${m.id}:${sym}`;
    const mVals: number[] = [];
    extractNumbersFromMetric(m, mVals);
    for (const v of mVals) {
      globalMetricValues.push({ val: v, key, label: m.label_vi });
    }
  }

  // 4. Build paragraph-specific allowable set from its declared evidence (starts empty)
  const paragraphAllowed: number[] = [];

  for (const evKey of evidence) {
    const parsed = parseEvidenceKey(evKey);

    if (parsed.type === 'm') {
      // Metric key
      const matchingMetrics = context.metrics.filter((m) => {
        if (m.id !== parsed.id) return false;
        if (parsed.symbol === null || parsed.symbol === '*') return true;
        return m.symbol === parsed.symbol;
      });

      if (matchingMetrics.length === 0) {
        issues.push({
          token: evKey,
          reason: 'BAD_EVIDENCE_KEY',
          detail_vi: `Khóa căn cứ chỉ số "${evKey}" không tồn tại trong kết quả định lượng.`,
        });
        continue;
      }

      for (const m of matchingMetrics) {
        extractNumbersFromMetric(m, paragraphAllowed);
      }
    } else if (parsed.type === 'c') {
      // Chart key
      const backingIds = chartBackingMetrics[parsed.id];
      if (!backingIds) {
        issues.push({
          token: evKey,
          reason: 'BAD_EVIDENCE_KEY',
          detail_vi: `Khóa căn cứ biểu đồ "${evKey}" không hợp lệ hoặc không có danh mục chỉ số minh họa.`,
        });
        continue;
      }

      // Add backing metrics for the chart symbol (or all symbols if symbol is null/*)
      const backingMetrics = context.metrics.filter((m) => {
        if (!backingIds.includes(m.id)) return false;
        if (parsed.symbol === null || parsed.symbol === '*') return true;
        return m.symbol === parsed.symbol;
      });

      for (const m of backingMetrics) {
        extractNumbersFromMetric(m, paragraphAllowed);
      }
    } else {
      issues.push({
        token: evKey,
        reason: 'BAD_EVIDENCE_KEY',
        detail_vi: `Khóa căn cứ "${evKey}" có tiền tố không xác định (phải là "m:" hoặc "c:").`,
      });
    }
  }

  // 5. Check all extracted numbers against allowable set
  const extractedTokens = extractNumberTokens(text);

  for (const token of extractedTokens) {
    const val = token.value;
    const dec = token.decimals;

    // Check if token is in parameter context (MA, RSI, 20 phiên, 252 phiên, section numbering)
    if (isParameterContext(text, token, paramCandidates)) {
      continue;
    }

    // Check if token is part of a formatted date (DD/MM/YYYY)
    if (token.isDate) {
      const isAllowedDate = allowedDates.some((target) => isNumberMatch(val, target, dec));
      if (isAllowedDate) {
        continue;
      }
    }

    // Does this token match any allowed number for this paragraph?
    const isAllowedInParagraph = paragraphAllowed.some((target) => isNumberMatch(val, target, dec));
    if (isAllowedInParagraph) {
      continue;
    }

    // Not allowed in this paragraph. Check if it exists elsewhere in the dataset
    const matchedGlobal = globalMetricValues.find((target) => isNumberMatch(val, target.val, dec));

    if (matchedGlobal) {
      issues.push({
        token: token.raw,
        reason: 'NOT_IN_EVIDENCE',
        detail_vi: `Con số "${token.raw}" thuộc chỉ số "${matchedGlobal.label}" (${matchedGlobal.key}), nhưng đoạn văn này không khai báo căn cứ đó trong evidence.`,
      });
    } else {
      issues.push({
        token: token.raw,
        reason: 'NOT_IN_DATA',
        detail_vi: `Con số "${token.raw}" không khớp với bất kỳ số liệu định lượng hay tham số công khai nào trong tập dữ liệu.`,
      });
    }
  }

  return issues;
}

/**
 * Validates an entire Narrative object across all sections and paragraphs.
 * Returns map of paragraphId -> NumberCheckIssue[].
 */
export function checkNarrative(
  narrative: {
    sections: Array<{
      id: string;
      title_vi: string;
      paragraphs: Array<{
        id: string;
        text: string;
        evidence: string[];
      }>;
    }>;
  },
  context: CheckContext
): Map<string, NumberCheckIssue[]> {
  const results = new Map<string, NumberCheckIssue[]>();

  for (const sec of narrative.sections) {
    for (const p of sec.paragraphs) {
      const issues = checkParagraph(p, context);
      results.set(p.id, issues);
    }
  }

  return results;
}
