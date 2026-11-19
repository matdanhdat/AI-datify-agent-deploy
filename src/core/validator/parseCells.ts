/**
 * Stage S4: Cell parsing and decimal/date convention inference.
 * Strictly adheres to Section 3.3 (date parsing & disambiguation) and 3.4 (number parsing & inference).
 * Pure TypeScript - zero external runtime dependencies.
 */
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';

export type DecimalConvention = 'dot' | 'comma';

export interface NumberInferenceResult {
  convention: DecimalConvention;
  mixedIssue?: ValidationIssue;
  ambiguousIssue?: ValidationIssue;
}

/**
 * Infers global decimal convention ('dot' vs 'comma') across all numeric cells in the dataset.
 */
export function inferDecimalConvention(
  numericStrings: Array<{ val: string; row: number; colName: string }>
): NumberInferenceResult {
  let commaEvidence: { val: string; row: number } | null = null;
  let dotEvidence: { val: string; row: number } | null = null;
  const ambiguousExamples: string[] = [];

  for (const { val, row } of numericStrings) {
    const clean = val.replace(/\u00a0/g, ' ').trim();
    if (!clean) continue;

    // Comma decimal evidence (Vietnamese format: 1.234,56 or 25,4)
    const isCommaEvidence =
      /^\d{1,3}(\.\d{3})+,\d+$/.test(clean) ||
      (/^\d+,\d+$/.test(clean) && !/^\d+,\d{3}$/.test(clean));

    // Dot decimal evidence (International format: 1,234.56 or 25.4)
    const isDotEvidence =
      /^\d{1,3}(,\d{3})+\.\d+$/.test(clean) ||
      (/^\d+\.\d+$/.test(clean) && !/^\d+\.\d{3}$/.test(clean));

    if (isCommaEvidence && !commaEvidence) {
      commaEvidence = { val: clean, row };
    }
    if (isDotEvidence && !dotEvidence) {
      dotEvidence = { val: clean, row };
    }

    // Check ambiguous forms like 25.400 or 1,234 (could be thousands or 3-decimal fraction)
    if (/^\d{1,3}\.\d{3}$/.test(clean) || /^\d{1,3},\d{3}$/.test(clean)) {
      if (ambiguousExamples.length < 5) {
        ambiguousExamples.push(clean);
      }
    }
  }

  let ambiguousIssue: ValidationIssue | undefined;
  if (ambiguousExamples.length > 0) {
    const sample = ambiguousExamples[0];
    const interpreted = sample.replace(',', '.');
    const msg = formatValidatorMessage('DATA_AMBIGUOUS_NUMBER', {
      count: ambiguousExamples.length,
      example: sample,
      interpreted,
    });
    ambiguousIssue = {
      code: 'DATA_AMBIGUOUS_NUMBER',
      severity: 'warning',
      count: ambiguousExamples.length,
      examples: ambiguousExamples,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    };
  }

  // 1. Conflict: Both comma evidence and dot evidence present -> DATA_MIXED_NUMBER_FORMAT
  if (commaEvidence && dotEvidence) {
    const msg = formatValidatorMessage('DATA_MIXED_NUMBER_FORMAT', {
      example_comma: commaEvidence.val,
      example_dot: dotEvidence.val,
    });
    return {
      convention: 'dot',
      mixedIssue: {
        code: 'DATA_MIXED_NUMBER_FORMAT',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
      ambiguousIssue,
    };
  }

  // 2. Clear comma evidence -> Vietnamese format
  if (commaEvidence) {
    return { convention: 'comma', ambiguousIssue };
  }

  // 3. Clear dot evidence -> International format
  if (dotEvidence) {
    return { convention: 'dot', ambiguousIssue };
  }

  // 4. Default dot
  return { convention: 'dot', ambiguousIssue };
}

/**
 * Parses a numeric value using the inferred decimal convention.
 * Returns:
 * - number (valid float)
 * - NaN (blank / missing cell)
 * - null (invalid format / bad number)
 */
export function parseNumber(
  raw: any,
  convention: DecimalConvention = 'dot'
): number | null {
  if (raw === null || raw === undefined) {
    return NaN; // Blank
  }

  // Boolean TRUE/FALSE are not valid numbers
  if (typeof raw === 'boolean') {
    return null;
  }

  if (typeof raw === 'number') {
    if (isNaN(raw) || !isFinite(raw) || Math.abs(raw) >= 1e15) return null;
    return raw;
  }

  const str = String(raw).replace(/\u00a0/g, ' ').trim();
  if (str === '') {
    return NaN; // Blank
  }

  // Currency symbols or percentages are rejected
  if (/[đ₫$€£¥%]|\b(vnd|usd)\b/i.test(str)) {
    return null;
  }

  // Letters other than exponent 'e' / 'E' are rejected
  if (/[a-df-z]/i.test(str)) {
    return null;
  }

  // Allow standard scientific notation e.g. 1e5, 2.5e+3
  if (/^[-+]?\d+(\.\d+)?e[-+]?\d+$/i.test(str) && convention === 'dot') {
    const num = Number(str);
    return isFinite(num) && Math.abs(num) < 1e15 ? num : null;
  }

  if (convention === 'comma') {
    // Vietnamese format: 1.234,56
    // If dot is present, it must strictly group by 3 digits
    if (str.includes('.')) {
      if (!/^[-+]?\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
        return null;
      }
    }
    // Only one comma allowed for decimal
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) return null;

    const normalized = str.replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    return !isNaN(num) && isFinite(num) && Math.abs(num) < 1e15 ? num : null;
  } else {
    // International format: 1,234.56
    // If comma is present, it must strictly group by 3 digits
    if (str.includes(',')) {
      if (!/^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(str)) {
        return null;
      }
    }
    // Only one dot allowed for decimal
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) return null;

    const normalized = str.replace(/,/g, '');
    const num = Number(normalized);
    return !isNaN(num) && isFinite(num) && Math.abs(num) < 1e15 ? num : null;
  }
}

export interface DateAnalysisResult {
  dateDays: number | null; // integer days since 1970-01-01 UTC, or null if invalid
  timeDropped: boolean;
}

/**
 * Checks an entire array of raw date values for month/day ambiguity and returns any conflict.
 */
export function checkDateColumnAmbiguity(
  dateStrings: Array<{ raw: string; row: number }>
): ValidationIssue | null {
  let firstCompGt12: { raw: string; row: number } | null = null;
  let secondCompGt12: { raw: string; row: number } | null = null;

  for (const { raw, row } of dateStrings) {
    const clean = raw.trim().replace(/\s.*$/, ''); // take date part
    const match = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);

      if (p1 > 12 && p2 <= 12) {
        if (!firstCompGt12) firstCompGt12 = { raw, row };
      } else if (p2 > 12 && p1 <= 12) {
        if (!secondCompGt12) secondCompGt12 = { raw, row };
      }
    }
  }

  if (firstCompGt12 && secondCompGt12) {
    const msg = formatValidatorMessage('DATA_DATE_AMBIGUOUS', {
      row1: firstCompGt12.row,
      val1: firstCompGt12.raw,
      row2: secondCompGt12.row,
      val2: secondCompGt12.raw,
    });
    return {
      code: 'DATA_DATE_AMBIGUOUS',
      severity: 'error',
      row: firstCompGt12.row,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    };
  }

  return null;
}

/**
 * Parses a single date value (Date object, Excel serial, or date string).
 * Returns integer days since 1970-01-01 UTC, or null if invalid/bad date.
 */
export function parseDateCell(raw: any, isXlsx = false): DateAnalysisResult {
  if (raw === null || raw === undefined) {
    return { dateDays: null, timeDropped: false };
  }

  // 1. Native Date object (e.g. from ExcelJS)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) {
      return { dateDays: null, timeDropped: false };
    }
    const hasTime =
      raw.getUTCHours() > 0 ||
      raw.getUTCMinutes() > 0 ||
      raw.getUTCSeconds() > 0;

    const days = Math.floor(
      Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()) / 86400000
    );
    return { dateDays: days, timeDropped: hasTime };
  }

  // 2. Numeric Excel serial number (only allowed in .xlsx)
  if (typeof raw === 'number') {
    if (!isXlsx || isNaN(raw) || !isFinite(raw)) {
      return { dateDays: null, timeDropped: false };
    }
    // Serial range for 1970-01-01 to 2099-12-31: approx 25569 to 73050
    if (raw < 25569 || raw > 73050) {
      return { dateDays: null, timeDropped: false };
    }
    const wholeDays = Math.floor(raw);
    const hasTime = raw % 1 !== 0;
    const daysSinceEpoch = wholeDays - 25569;
    return { dateDays: daysSinceEpoch, timeDropped: hasTime };
  }

  // 3. String date
  const str = String(raw).trim();
  if (!str) {
    return { dateDays: null, timeDropped: false };
  }

  let timeDropped = false;
  let datePart = str;

  // Detect and split time part if present (e.g. "14/11/2026 09:30:00" or "2026-11-14T08:00:00Z")
  if (str.includes(' ') || str.includes('T')) {
    const parts = str.split(/[ T]/);
    datePart = parts[0];
    if (parts.length > 1 && parts[1].trim()) {
      timeDropped = true;
    }
  }

  // Disallow two-digit years (must be exactly 4 digits)
  // Format 1: dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmyMatch = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);

    if (year < 1970 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
      return { dateDays: null, timeDropped: false };
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      return { dateDays: null, timeDropped: false }; // Non-existent date (e.g. 31/02/2026)
    }
    return {
      dateDays: Math.floor(dt.getTime() / 86400000),
      timeDropped,
    };
  }

  // Format 2: yyyy-mm-dd or yyyy/mm/dd or yyyy.mm.dd
  const ymdMatch = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);

    if (year < 1970 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
      return { dateDays: null, timeDropped: false };
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      return { dateDays: null, timeDropped: false };
    }
    return {
      dateDays: Math.floor(dt.getTime() / 86400000),
      timeDropped,
    };
  }

  // Invalid date format or 2-digit year
  return { dateDays: null, timeDropped: false };
}

