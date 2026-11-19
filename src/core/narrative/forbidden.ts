/**
 * Forbidden Phrases Detector (Prompt P5 Section 6.2).
 * Strictly forbids investment recommendations, price predictions, and external news/macro mentions.
 * Uses unicode-aware word boundary regex to avoid false positives (e.g. RSI 'quá mua', 'quá bán', 'bán niên').
 */

export interface ForbiddenMatch {
  phrase: string;
  matched: string;
  index: number;
}

export interface ForbiddenRule {
  name: string;
  pattern: RegExp;
}

export const FORBIDDEN_RULES: ForbiddenRule[] = [
  // Recommendations & Advice
  { name: 'khuyến nghị', pattern: /(?<![\p{L}\p{N}])khuyến\s+nghị(?![\p{L}\p{N}])/iu },
  { name: 'khuyên', pattern: /(?<![\p{L}\p{N}])khuyên(?![\p{L}\p{N}])/iu },
  { name: 'nên đầu tư', pattern: /(?<![\p{L}\p{N}])nên\s+đầu\s+tư(?![\p{L}\p{N}])/iu },
  { name: 'cắt lỗ', pattern: /(?<![\p{L}\p{N}])cắt\s+lỗ(?![\p{L}\p{N}])/iu },
  { name: 'chốt lời', pattern: /(?<![\p{L}\p{N}])chốt\s+lời(?![\p{L}\p{N}])/iu },
  { name: 'giá mục tiêu', pattern: /(?<![\p{L}\p{N}])giá\s+mục\s+tiêu(?![\p{L}\p{N}])/iu },
  { name: 'target', pattern: /(?<![\p{L}\p{N}])target(?![\p{L}\p{N}])/iu },
  { name: 'đảm bảo lợi nhuận', pattern: /(?<![\p{L}\p{N}])đảm\s+bảo\s+lợi\s+nhuận(?![\p{L}\p{N}])/iu },

  // Standalone Buy / Sell (Must allow technical RSI 'quá mua', 'quá bán', and phrases like 'bán niên')
  {
    name: 'mua',
    pattern: /(?<!quá\s+)(?<![\p{L}\p{N}])mua(?![\p{L}\p{N}])/iu,
  },
  {
    name: 'bán',
    pattern: /(?<!quá\s+)(?<![\p{L}\p{N}])bán(?![\p{L}\p{N}])(?!\s+niên)(?!\s+kính)/iu,
  },

  // Future Prediction & Guarantees
  { name: 'chắc chắn (tăng/giảm/lãi/lỗ)', pattern: /(?<![\p{L}\p{N}])chắc\s+chắn\s+(?:tăng|giảm|lãi|lỗ|thắng|thua|sinh\s+lời)(?![\p{L}\p{N}])/iu },
  { name: 'dự báo', pattern: /(?<![\p{L}\p{N}])dự\s+báo(?![\p{L}\p{N}])/iu },
  { name: 'dự đoán', pattern: /(?<![\p{L}\p{N}])dự\s+đoán(?![\p{L}\p{N}])/iu },
  { name: 'sẽ (tăng/giảm)', pattern: /(?<![\p{L}\p{N}])sẽ\s+(?:tăng|giảm|bứt\s+phá|phục\s+hồi|đảo\s+chiều|vượt|thủng)(?![\p{L}\p{N}])/iu },
  { name: 'kỳ vọng giá', pattern: /(?<![\p{L}\p{N}])kỳ\s+vọng\s+giá(?![\p{L}\p{N}])/iu },

  // External reasons outside quantitative data
  { name: 'tin tức', pattern: /(?<![\p{L}\p{N}])tin\s+tức(?![\p{L}\p{N}])/iu },
  { name: 'vĩ mô', pattern: /(?<![\p{L}\p{N}])vĩ\s+mô(?![\p{L}\p{N}])/iu },
];

/**
 * Checks a paragraph for any forbidden phrases.
 * Returns array of matches.
 */
export function findForbiddenPhrases(text: string): ForbiddenMatch[] {
  const matches: ForbiddenMatch[] = [];

  for (const rule of FORBIDDEN_RULES) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g';
    const rx = new RegExp(rule.pattern.source, flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      matches.push({
        phrase: rule.name,
        matched: m[0],
        index: m.index,
      });
      if (m[0].length === 0) {
        rx.lastIndex++;
      }
    }
  }

  return matches;
}
