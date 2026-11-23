/**
 * Business Data Profile Validator & Table Builder (Prompt M1).
 * Detects tabular business datasets, infers column roles (id, time, dimension, measure),
 * checks structural constraints, collects warnings, and constructs BusinessTable.
 * Pure TypeScript, zero external runtime dependencies.
 */

import type { ValidationIssue, DatasetMeta } from '../schemas';
import type { BusinessTable, BusinessColumn, ColumnRoleMapping } from '../businessTable';
import { formatValidatorMessage } from './messagesVi';
import { parseNumber } from './parseCells';
import { sha256Hex } from '../hash';
import { resolveBusinessRoles } from '../metrics/businessRoles';

export interface BusinessRoleInference {
  roles: ColumnRoleMapping[];
  issues: ValidationIssue[];
}

export interface BusinessValidationResult {
  ok: boolean;
  businessTable?: BusinessTable;
  meta?: DatasetMeta;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  total_errors: number;
  total_warnings: number;
  column_mapping?: any[];
  preview?: {
    columns: string[];
    rows: (string | number | null)[][];
  };
}

export const UNIT_SUSPICIOUS_MIN_AOV = 1_000;
export const UNIT_SUSPICIOUS_MAX_AOV = 50_000_000_000;
export const COGS_EXCEEDS_REVENUE_WARNING_PREFIX = 'Giá vốn';
export function formatCogsExceedsRevenueWarning(cogs: number, rev: number): string {
  return `Giá vốn ${Math.round(cogs).toLocaleString('vi-VN')} đồng lớn hơn doanh thu ${Math.round(rev).toLocaleString('vi-VN')} đồng. Anh/chị kiểm tra lại đơn vị hoặc dấu số.`;
}

export interface DetectedCurrencyUnit {
  unit: string;
  multiplier: number;
  source: 'header' | 'mặc định';
}

export function detectCurrencyUnit(header: string): DetectedCurrencyUnit {
  let unitCandidate = '';
  const parenMatch = header.match(/\(([^)]+)\)/);
  if (parenMatch) {
    unitCandidate = parenMatch[1].trim();
  } else {
    const dvtMatch = header.match(/(?:đvt|dvt|đơn vị|don vi)\s*[:/]?\s*([a-zA-ZÀ-ỹ0-9\s]+)/i);
    if (dvtMatch) {
      unitCandidate = dvtMatch[1].trim();
    }
  }

  if (unitCandidate) {
    const norm = unitCandidate
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      norm === 'nghin ty dong' ||
      norm === 'nghin ty' ||
      norm === 'ngan ty' ||
      norm === 'nghin ti' ||
      norm === 'ngan ti'
    ) {
      return { unit: 'nghìn tỷ đồng', multiplier: 1e12, source: 'header' };
    }
    if (norm === 'ty dong' || norm === 'ty' || norm === 'ti' || norm === 'ti dong') {
      return { unit: 'tỷ đồng', multiplier: 1e9, source: 'header' };
    }
    if (norm === 'trieu dong' || norm === 'trieu' || norm === 'tr') {
      return { unit: 'triệu đồng', multiplier: 1e6, source: 'header' };
    }
    if (norm === 'nghin dong' || norm === 'ngan dong' || norm === 'k' || norm === 'nghin' || norm === 'ngan') {
      return { unit: 'nghìn đồng', multiplier: 1e3, source: 'header' };
    }
    if (norm === 'dong' || norm === 'vnd' || norm === 'd') {
      return { unit: 'đồng', multiplier: 1, source: 'header' };
    }
  }

  return { unit: 'đồng', multiplier: 1, source: 'mặc định' };
}

export interface ColumnNumberFormatAnalysis {
  decimalConvention: 'dot' | 'comma';
  isAmbiguous: boolean;
  sampleAmbiguous?: string;
}

export function analyzeColumnNumberFormat(cells: string[]): ColumnNumberFormatAnalysis {
  let hasBothSeparators: { val: string; decimalSep: 'dot' | 'comma' } | null = null;
  let hasRepeatedSeparator: { val: string; decimalSep: 'dot' | 'comma' } | null = null;
  let hasCommaDecimalEvidence = false;
  let hasDotDecimalEvidence = false;
  const ambiguousSamples: string[] = [];

  for (const raw of cells) {
    if (!raw) continue;
    const s = String(raw)
      .replace(/\u00a0/g, ' ')
      .replace(/[đ₫$€¥]/g, '')
      .replace(/\b(vnd|vnđ|d)\b/gi, '')
      .trim();

    if (!s) continue;

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    // Rule A: Value has both '.' and ',': last character is decimal
    if (hasDot && hasComma) {
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastDot > lastComma) {
        hasBothSeparators = { val: s, decimalSep: 'dot' };
      } else {
        hasBothSeparators = { val: s, decimalSep: 'comma' };
      }
    }

    // Rule B: One separator repeats >= 2 times: that separator is thousands
    const dotCount = (s.match(/\./g) || []).length;
    const commaCount = (s.match(/,/g) || []).length;
    if (dotCount >= 2 && !hasComma) {
      hasRepeatedSeparator = { val: s, decimalSep: 'comma' }; // dot is thousands, so comma is decimal
    }
    if (commaCount >= 2 && !hasDot) {
      hasRepeatedSeparator = { val: s, decimalSep: 'dot' }; // comma is thousands, so dot is decimal
    }

    // Rule C: Comma followed by number of digits != 3 (e.g. "12,5", "1,25")
    if (hasComma && !hasDot) {
      const commaParts = s.split(',');
      if (commaParts.length === 2 && commaParts[1].length !== 3) {
        hasCommaDecimalEvidence = true;
      }
    }

    // Rule D: Dot followed by number of digits != 3 (e.g. "1.5", "12.5")
    if (hasDot && !hasComma) {
      const dotParts = s.split('.');
      if (dotParts.length === 2 && dotParts[1].length !== 3) {
        hasDotDecimalEvidence = true;
      }
    }

    // Ambiguity check: single separator followed by exactly 3 digits (e.g. "1.250")
    if (dotCount === 1 && !hasComma) {
      const parts = s.split('.');
      if (parts[1].length === 3) {
        ambiguousSamples.push(s);
      }
    }
    if (commaCount === 1 && !hasDot) {
      const parts = s.split(',');
      if (parts[1].length === 3) {
        ambiguousSamples.push(s);
      }
    }
  }

  if (hasBothSeparators) {
    return { decimalConvention: hasBothSeparators.decimalSep, isAmbiguous: false };
  }
  if (hasRepeatedSeparator) {
    return { decimalConvention: hasRepeatedSeparator.decimalSep, isAmbiguous: false };
  }
  if (hasCommaDecimalEvidence && !hasDotDecimalEvidence) {
    return { decimalConvention: 'comma', isAmbiguous: false };
  }
  if (hasDotDecimalEvidence && !hasCommaDecimalEvidence) {
    return { decimalConvention: 'dot', isAmbiguous: false };
  }
  if (ambiguousSamples.length > 0) {
    return {
      decimalConvention: 'comma', // default Vietnamese format: dot is thousands
      isAmbiguous: true,
      sampleAmbiguous: ambiguousSamples[0],
    };
  }
  return { decimalConvention: 'dot', isAmbiguous: false };
}

export function parseCellNumber(
  raw: any,
  convention: 'dot' | 'comma' = 'dot',
  forceDecimalConvention?: 'dot' | 'comma'
): number | null {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') {
    return isNaN(raw) || !isFinite(raw) ? null : raw;
  }
  const s = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/[đ₫$€¥]/g, '')
    .replace(/\b(vnd|vnđ|d)\b/gi, '')
    .trim();
  if (s === '') return NaN;

  const conv = forceDecimalConvention || convention;
  return parseNumber(s, conv);
}

export function normalizeTotalRowLabel(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts unit from column label, e.g. "Doanh thu (VND)" -> label: "Doanh thu", unit: "VND"
 */
export function extractUnit(header: string): { label: string; unit?: string } {
  const match = header.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      label: match[1].trim(),
      unit: match[2].trim(),
    };
  }
  return { label: header.trim() };
}

/**
 * Normalizes string for role matching
 */
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if a string represents a valid yyyy-mm or date
 */
export function isDateOrMonthStr(val: any): { ok: boolean; granularity?: 'month' | 'day'; daysOrMonths?: number } {
  if (val === null || val === undefined) return { ok: false };
  if (typeof val === 'number') {
    if (val === 0 || isNaN(val) || !isFinite(val)) return { ok: false };
    // Excel serial dates: e.g. 46200 is around year 2026
    if (val >= 25569 && val <= 73050) {
      const utcMs = (val - 25569) * 86400000;
      const d = new Date(utcMs);
      if (!isNaN(d.getTime())) {
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const monthsSince1970 = (year - 1970) * 12 + (month - 1);
        return { ok: true, granularity: 'month', daysOrMonths: monthsSince1970 };
      }
    }
    return { ok: false };
  }

  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '0') return { ok: false };

  // 1. yyyy-mm format (strict month 01-12, year 1900-2100)
  const ymMatch = trimmed.match(/^([12]\d{3})-(0[1-9]|1[0-2])$/);
  if (ymMatch) {
    const year = parseInt(ymMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      const month = parseInt(ymMatch[2], 10);
      const monthsSince1970 = (year - 1970) * 12 + (month - 1);
      return { ok: true, granularity: 'month', daysOrMonths: monthsSince1970 };
    }
  }

  // 2. yyyy-mm-dd (strict month 01-12, year 1900-2100)
  const ymdMatch = trimmed.match(/^([12]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      const d = new Date(Date.UTC(year, parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10)));
      if (!isNaN(d.getTime())) {
        const days = Math.floor(d.getTime() / 86400000);
        return { ok: true, granularity: 'day', daysOrMonths: days };
      }
    }
  }

  // 3. dd/mm/yyyy or d/m/yyyy (strict month 01-12, year 1900-2100)
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(0[1-9]|1[0-2])\/([12]\d{3})$/);
  if (dmyMatch) {
    const year = parseInt(dmyMatch[3], 10);
    if (year >= 1900 && year <= 2100) {
      const d = new Date(Date.UTC(year, parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10)));
      if (!isNaN(d.getTime())) {
        const days = Math.floor(d.getTime() / 86400000);
        return { ok: true, granularity: 'day', daysOrMonths: days };
      }
    }
  }

  // 4. ISO timestamp: e.g. 2026-07-01T00:00:00.000Z
  const isoMatch = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])-(\d{2})T/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const monthsSince1970 = (year - 1970) * 12 + (month - 1);
    return { ok: true, granularity: 'month', daysOrMonths: monthsSince1970 };
  }

  return { ok: false };
}

/**
 * Stage 4: Infers column roles according to Section 4 of M1
 */
export function inferColumnRoles(
  headers: string[],
  records: Array<{ rowNumber: number; cells: any[] }>
): ColumnRoleMapping[] {
  const numRows = records.length;
  const numCols = headers.length;
  const roles: ColumnRoleMapping[] = [];

  let idAssigned = false;
  let timeAssigned = false;

  for (let c = 0; c < numCols; c++) {
    const rawHeader = headers[c] || `Col_${c + 1}`;
    const norm = normalizeHeader(rawHeader);
    const { label, unit } = extractUnit(rawHeader);

    // Extract non-empty cells
    const colCells: string[] = [];
    for (const r of records) {
      const val = r.cells[c];
      if (val !== null && val !== undefined) {
        colCells.push(String(val));
      } else {
        colCells.push('');
      }
    }
    const nonEmptyCells = colCells.filter((v) => v.trim() !== '');

    const isMeasureName =
      Boolean(unit) ||
      norm.includes('doanhthu') ||
      norm.includes('thanhtien') ||
      norm.includes('doanhso') ||
      norm.includes('tongtien') ||
      norm.includes('chiphi') ||
      norm.includes('giavon') ||
      norm.includes('gianhap') ||
      norm.includes('giathanh') ||
      norm.includes('loinhuan') ||
      norm.includes('sodon') ||
      norm.includes('soluong') ||
      norm.includes('socan') ||
      norm.includes('soxe') ||
      norm.includes('sohopdong') ||
      norm.includes('dongia') ||
      norm.includes('revenue') ||
      norm.includes('cost') ||
      norm.includes('profit') ||
      norm.includes('orders') ||
      norm.includes('price') ||
      norm.includes('amount') ||
      norm.includes('quantity') ||
      norm.includes('qty') ||
      norm.includes('units') ||
      norm.includes('sales');

    // 1. Check ID Role (Max 1 column)
    const isIdName =
      (norm.includes('ma') ||
        norm.includes('id') ||
        norm.includes('stt') ||
        norm.includes('sothutu') ||
        norm.includes('code')) &&
      !isMeasureName &&
      !norm.includes('thang') &&
      !norm.includes('ngay');
    const uniqueCount = new Set(nonEmptyCells.map((v) => v.trim())).size;
    const uniqueness = nonEmptyCells.length > 0 ? uniqueCount / nonEmptyCells.length : 0;

    if (!idAssigned && isIdName && uniqueness >= 0.5) {
      roles.push({
        file_header: rawHeader,
        key: `col_${c}_id`,
        role: 'id',
        label,
      });
      idAssigned = true;
      continue;
    }

    // 2. Check Time Role (Max 1 column)
    const isTimeName =
      norm.includes('ngay') ||
      norm.includes('thang') ||
      norm.includes('quy') ||
      norm.includes('nam') ||
      norm.includes('ky') ||
      norm.includes('date') ||
      norm.includes('month') ||
      norm.includes('period') ||
      norm.includes('quarter') ||
      norm.includes('year');

    let validTimeCount = 0;
    for (const cell of nonEmptyCells) {
      if (isDateOrMonthStr(cell).ok) {
        validTimeCount++;
      }
    }
    const timeRatio = nonEmptyCells.length > 0 ? validTimeCount / nonEmptyCells.length : 0;

    if (!timeAssigned && isTimeName && timeRatio >= 0.95) {
      roles.push({
        file_header: rawHeader,
        key: `col_${c}_time`,
        role: 'time',
        label,
      });
      timeAssigned = true;
      continue;
    }

    // 3. Check Measure Role
    let validNumCount = 0;
    for (const cell of nonEmptyCells) {
      const parsedDot = parseCellNumber(cell, 'dot');
      const parsedComma = parseCellNumber(cell, 'comma');
      if ((parsedDot !== null && !isNaN(parsedDot)) || (parsedComma !== null && !isNaN(parsedComma))) {
        validNumCount++;
      }
    }
    const numRatio = nonEmptyCells.length > 0 ? validNumCount / nonEmptyCells.length : 0;

    if ((numRatio >= 0.95 || (isMeasureName && numRatio >= 0.7)) && nonEmptyCells.length > 0) {
      roles.push({
        file_header: rawHeader,
        key: `col_${c}_measure`,
        role: 'measure',
        unit,
        label,
      });
      continue;
    }

    // 4. Check Dimension Role
    const isDimensionName =
      norm.includes('sanpham') ||
      norm.includes('product') ||
      norm.includes('mathang') ||
      norm.includes('duan') ||
      norm.includes('mauxe') ||
      norm.includes('dongxe') ||
      norm.includes('model') ||
      norm.includes('sku') ||
      norm.includes('kenh') ||
      norm.includes('channel') ||
      norm.includes('hinhthuc') ||
      norm.includes('nentang') ||
      norm.includes('khuvuc') ||
      norm.includes('region') ||
      norm.includes('vung') ||
      norm.includes('mien') ||
      norm.includes('tinh') ||
      norm.includes('thanhpho') ||
      norm.includes('diaban') ||
      norm.includes('city') ||
      norm.includes('chinhanh') ||
      norm.includes('branch') ||
      norm.includes('khachhang') ||
      norm.includes('customer') ||
      norm.includes('trangthai') ||
      norm.includes('status') ||
      norm.includes('loai') ||
      norm.includes('category') ||
      norm.includes('danhmuc') ||
      norm.includes('ten') ||
      norm.includes('name');

    const uniqueRatio = nonEmptyCells.length > 0 ? uniqueCount / nonEmptyCells.length : 0;
    const isDimension =
      uniqueCount > 0 &&
      (isDimensionName || uniqueRatio <= 0.7 || (numRows >= 50 && uniqueCount <= 50));

    if (isDimension) {
      roles.push({
        file_header: rawHeader,
        key: `col_${c}_dim`,
        role: 'dimension',
        label,
      });
      continue;
    }

    // 5. Ignored Role
    roles.push({
      file_header: rawHeader,
      key: `col_${c}_ignored`,
      role: 'ignored',
      label,
    });
  }

  return roles;
}

/**
 * Validates a dataset under the business profile and constructs BusinessTable.
 */
export async function validateBusinessProfile(
  filename: string,
  records: Array<{ rowNumber: number; cells: any[] }>,
  headers: string[],
  _headerRow: number,
  skippedBlankRows: number,
  sheetName: string | null,
  rawBytes: Uint8Array
): Promise<BusinessValidationResult> {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const roles = inferColumnRoles(headers, records);

  // D3. Detect and remove total rows
  let skippedTotalRows = 0;
  const skippedTotalRowNumbers: number[] = [];
  const remainingRecords: typeof records = [];

  const TOTAL_ROW_KEYWORDS = ['tong', 'tong cong', 'cong', 'total', 'grand total', 'tong doanh thu'];

  for (let r = 0; r < records.length; r++) {
    const rec = records[r];
    const firstCell = rec.cells.find((c) => c !== null && c !== undefined && String(c).trim() !== '');
    const normLabel = normalizeTotalRowLabel(firstCell);

    const isTotalKeyword = TOTAL_ROW_KEYWORDS.includes(normLabel);

    if (isTotalKeyword) {
      let allMeasuresMatch = true;
      let evaluatedMeasureCount = 0;

      for (let c = 0; c < roles.length; c++) {
        if (roles[c].role === 'measure') {
          const rawCell = rec.cells[c];
          if (rawCell !== null && rawCell !== undefined && String(rawCell).trim() !== '') {
            const formatAnalysis = analyzeColumnNumberFormat(records.map((x) => String(x.cells[c] ?? '').trim()));
            const totalVal = parseCellNumber(rawCell, formatAnalysis.decimalConvention);
            if (totalVal !== null && !isNaN(totalVal)) {
              evaluatedMeasureCount++;
              let sumOther = 0;
              for (let otherIdx = 0; otherIdx < records.length; otherIdx++) {
                if (otherIdx !== r) {
                  const otherCell = records[otherIdx].cells[c];
                  const otherVal = parseCellNumber(otherCell, formatAnalysis.decimalConvention);
                  if (otherVal !== null && !isNaN(otherVal)) {
                    sumOther += otherVal;
                  }
                }
              }
              if (Math.abs(totalVal - sumOther) > 0.5) {
                allMeasuresMatch = false;
                break;
              }
            }
          }
        }
      }

      if (evaluatedMeasureCount > 0 && allMeasuresMatch) {
        skippedTotalRows++;
        skippedTotalRowNumbers.push(rec.rowNumber);
        continue; // skip this row
      } else {
        warnings.push({
          code: 'SCHEMA_UNKNOWN_COLUMN',
          severity: 'warning',
          message_vi: `Dòng ${rec.rowNumber} có nhãn "${String(firstCell).trim()}" nhưng tổng số không khớp các dòng còn lại (không loại bỏ).`,
          fix_vi: 'Kiểm tra lại dữ liệu dòng tổng hoặc dữ liệu các dòng chi tiết.',
        });
        remainingRecords.push(rec);
      }
    } else {
      remainingRecords.push(rec);
    }
  }

  records = remainingRecords;

  // Constraint 1: Maximum 30 columns
  if (headers.length > 30) {
    const msg = formatValidatorMessage('SCHEMA_TOO_MANY_COLUMNS', { count: headers.length });
    issues.push({
      code: 'SCHEMA_TOO_MANY_COLUMNS',
      severity: 'error',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Constraint 2: Minimum 4 rows of content (Prompt 1C-2b C1 sheet 2025 has 4 rows)
  if (records.length < 4) {
    const msg = formatValidatorMessage('DATA_TOO_FEW_ROWS', { rows: records.length });
    issues.push({
      code: 'DATA_TOO_FEW_ROWS',
      severity: 'error',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Constraint 3 & 4: At least 1 measure column and at least 1 dimension or time column
  const measureCols = roles.filter((r) => r.role === 'measure');
  const dimOrTimeCols = roles.filter((r) => r.role === 'dimension' || r.role === 'time');

  if (measureCols.length === 0 && dimOrTimeCols.length === 0) {
    const msg = formatValidatorMessage('SCHEMA_PROFILE_UNKNOWN');
    issues.push({
      code: 'SCHEMA_PROFILE_UNKNOWN',
      severity: 'error',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  } else {
    if (measureCols.length === 0) {
      const msg = formatValidatorMessage('SCHEMA_NO_MEASURE_COLUMN');
      issues.push({
        code: 'SCHEMA_NO_MEASURE_COLUMN',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      });
    }

    if (dimOrTimeCols.length === 0) {
      const msg = formatValidatorMessage('SCHEMA_NO_DIMENSION_COLUMN');
      issues.push({
        code: 'SCHEMA_NO_DIMENSION_COLUMN',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      });
    }
  }

  // Check data cells in measure columns
  for (let c = 0; c < roles.length; c++) {
    const roleInfo = roles[c];
    if (roleInfo.role === 'measure') {
      const colCells = records.map((rec) => String(rec.cells[c] ?? '').trim());
      const formatAnalysis = analyzeColumnNumberFormat(colCells);

      for (const rec of records) {
        const val = rec.cells[c];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          const str = String(val);
          // Reject currency symbols attached e.g. 25.400đ
          if (/[đ₫$€¥]/.test(str)) {
            const msg = formatValidatorMessage('DATA_BAD_NUMBER', {
              row: rec.rowNumber,
              column: roleInfo.file_header,
              value: str,
            });
            issues.push({
              code: 'DATA_BAD_NUMBER',
              severity: 'error',
              row: rec.rowNumber,
              column: roleInfo.file_header,
              value: str,
              message_vi: msg.message_vi,
              fix_vi: msg.fix_vi,
            });
          } else {
            const p = parseCellNumber(str, formatAnalysis.decimalConvention);
            if (p === null) {
              const msg = formatValidatorMessage('DATA_BAD_NUMBER', {
                row: rec.rowNumber,
                column: roleInfo.file_header,
                value: str,
              });
              issues.push({
                code: 'DATA_BAD_NUMBER',
                severity: 'error',
                row: rec.rowNumber,
                column: roleInfo.file_header,
                value: str,
                message_vi: msg.message_vi,
                fix_vi: msg.fix_vi,
              });
            }
          }
        }
      }
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      warnings,
      total_errors: issues.length,
      total_warnings: warnings.length,
      column_mapping: roles.map((r, idx) => ({
        colIndex: idx,
        fileHeader: r.file_header,
        key: r.key,
        label_vi: r.label || r.file_header,
        role: r.role,
        required: r.role === 'measure' || r.role === 'dimension',
      })),
    };
  }

  // ==========================================
  // Warnings Audit (Non-blocking)
  // ==========================================
  let paddedCount = 0;
  const paddedExamples: string[] = [];

  let blankDimCount = 0;
  const blankDimColumns = new Set<string>();
  const blankDimRows: number[] = [];

  const exactRowMap = new Map<string, number>();
  let exactDupCount = 0;

  const idMap = new Map<string, number>();
  const dupIdList: string[] = [];

  let negativeMeasureCount = 0;
  const missingValueCols: Record<string, number> = {};

  for (let r = 0; r < records.length; r++) {
    const rec = records[r];
    const rowStr = rec.cells.map((c) => (c === null || c === undefined ? '' : String(c))).join('|||');
    exactRowMap.set(rowStr, (exactRowMap.get(rowStr) || 0) + 1);

    for (let c = 0; c < roles.length; c++) {
      const roleInfo = roles[c];
      const rawVal = rec.cells[c];
      const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal) : '';

      // Whitespace padded check
      if (strVal && strVal !== strVal.trim()) {
        paddedCount++;
        if (paddedExamples.length < 3) paddedExamples.push(strVal);
      }

      // Blank dimension check
      if (roleInfo.role === 'dimension') {
        if (!strVal.trim()) {
          blankDimCount++;
          blankDimColumns.add(roleInfo.label || roleInfo.file_header);
          if (blankDimRows.length < 3) blankDimRows.push(rec.rowNumber);
        }
      }

      // ID duplicate tracking
      if (roleInfo.role === 'id') {
        const idVal = strVal.trim();
        if (idVal) {
          idMap.set(idVal, (idMap.get(idVal) || 0) + 1);
        }
      }

      // Measure check
      if (roleInfo.role === 'measure') {
        if (!strVal.trim()) {
          missingValueCols[roleInfo.label || roleInfo.file_header] =
            (missingValueCols[roleInfo.label || roleInfo.file_header] || 0) + 1;
        } else {
          const parsed = parseNumber(strVal);
          if (parsed !== null && !isNaN(parsed) && parsed < 0) {
            negativeMeasureCount++;
          }
        }
      }
    }
  }

  // Exact duplicate rows
  for (const [, count] of exactRowMap) {
    if (count > 1) exactDupCount += count - 1;
  }
  if (exactDupCount > 0) {
    const msg = formatValidatorMessage('DATA_EXACT_DUPLICATE', { count: exactDupCount });
    warnings.push({
      code: 'DATA_EXACT_DUPLICATE',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Duplicate ID warning
  for (const [id, count] of idMap) {
    if (count > 1) {
      dupIdList.push(id);
    }
  }
  if (dupIdList.length > 0) {
    const msg = formatValidatorMessage('DATA_DUPLICATE_ID', {
      summary: `${dupIdList.length} mã: ${dupIdList.slice(0, 3).join(', ')}`,
      count: dupIdList.length,
      example_ids: dupIdList.slice(0, 3).join(', '),
    });
    warnings.push({
      code: 'DATA_DUPLICATE_ID',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Whitespace padded warning
  if (paddedCount > 0) {
    const msg = formatValidatorMessage('DATA_WHITESPACE_PADDED', {
      count: paddedCount,
      example: paddedExamples[0],
    });
    warnings.push({
      code: 'DATA_WHITESPACE_PADDED',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Blank dimension warning
  if (blankDimCount > 0) {
    const msg = formatValidatorMessage('DATA_BLANK_DIMENSION', {
      count: blankDimCount,
      columns: Array.from(blankDimColumns).join(', '),
      example_rows: blankDimRows.join(', '),
    });
    warnings.push({
      code: 'DATA_BLANK_DIMENSION',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Missing values warning in measure
  const missingTotal = Object.values(missingValueCols).reduce((a, b) => a + b, 0);
  if (missingTotal > 0) {
    const summary = Object.entries(missingValueCols)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    const msg = formatValidatorMessage('DATA_MISSING_VALUES', {
      count: missingTotal,
      summary,
    });
    warnings.push({
      code: 'DATA_MISSING_VALUES',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Negative measure warning
  if (negativeMeasureCount > 0) {
    const msg = formatValidatorMessage('DATA_NEGATIVE_MEASURE', {
      count: negativeMeasureCount,
      column: measureCols[0].label || measureCols[0].file_header,
      row: records[0].rowNumber,
      value: '-...',
    });
    warnings.push({
      code: 'DATA_NEGATIVE_MEASURE',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Ignored columns warning
  const ignoredCols = roles.filter((r) => r.role === 'ignored');
  if (ignoredCols.length > 0) {
    const msg = formatValidatorMessage('SCHEMA_UNKNOWN_COLUMN', {
      count: ignoredCols.length,
      columns: ignoredCols.map((r) => r.file_header).join(', '),
    });
    warnings.push({
      code: 'SCHEMA_UNKNOWN_COLUMN',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // ==========================================
  // Construct BusinessTable Columnar Data
  // ==========================================
  const n = records.length;
  const source_row = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    source_row[i] = records[i].rowNumber;
  }

  const columns: BusinessColumn[] = [];
  let timeStart = '';
  let timeEnd = '';

  for (let c = 0; c < roles.length; c++) {
    const r = roles[c];
    if (r.role === 'ignored') continue;

    if (r.role === 'id') {
      const values: string[] = [];
      for (let i = 0; i < n; i++) {
        values.push(String(records[i].cells[c] ?? '').trim());
      }
      columns.push({
        role: 'id',
        key: r.key,
        label: r.label || r.file_header,
        values,
      });
    } else if (r.role === 'time') {
      // Determine granularity from first valid entry
      let gran: 'month' | 'day' = 'month';
      const vals = new Int32Array(n);
      const raw_labels: string[] = [];

      for (let i = 0; i < n; i++) {
        const raw = String(records[i].cells[c] ?? '').trim();
        raw_labels.push(raw);
        const parsed = isDateOrMonthStr(records[i].cells[c]);
        if (parsed.ok) {
          gran = parsed.granularity || 'month';
          vals[i] = parsed.daysOrMonths !== undefined ? parsed.daysOrMonths : -1;
        } else {
          vals[i] = -1;
        }
      }

      const validLabels = raw_labels.filter((l) => isDateOrMonthStr(l).ok);
      if (validLabels.length > 0) {
        timeStart = validLabels[0];
        timeEnd = validLabels[validLabels.length - 1];
      }

      columns.push({
        role: 'time',
        key: r.key,
        label: r.label || r.file_header,
        granularity: gran,
        values: vals,
        raw_labels,
      });
    } else if (r.role === 'dimension') {
      const raw_labels: string[] = [];
      const catMap = new Map<string, number>();
      const categories: string[] = [];
      const codes = new Uint16Array(n);

      for (let i = 0; i < n; i++) {
        const raw = String(records[i].cells[c] ?? '');
        raw_labels.push(raw);
        const trimmed = raw.trim();
        if (!trimmed) {
          codes[i] = 0xffff; // blank category
        } else {
          let catIdx = catMap.get(trimmed);
          if (catIdx === undefined) {
            catIdx = categories.length;
            catMap.set(trimmed, catIdx);
            categories.push(trimmed);
          }
          codes[i] = catIdx;
        }
      }

      columns.push({
        role: 'dimension',
        key: r.key,
        label: r.label || r.file_header,
        categories,
        codes,
        raw_labels,
      });
    } else if (r.role === 'measure') {
      const colCells = records.map((rec) => String(rec.cells[c] ?? '').trim());
      const formatAnalysis = analyzeColumnNumberFormat(colCells);
      const unitInfo = detectCurrencyUnit(r.file_header);

      const normH = normalizeHeader(r.file_header);
      const isMoneyCol =
        normH.includes('doanhthu') ||
        normH.includes('thanhtien') ||
        normH.includes('doanhso') ||
        normH.includes('tongtien') ||
        normH.includes('chiphi') ||
        normH.includes('giavon') ||
        normH.includes('gianhap') ||
        normH.includes('giathanh') ||
        normH.includes('loinhuan') ||
        normH.includes('cogs') ||
        normH.includes('cost') ||
        normH.includes('profit') ||
        normH.includes('revenue') ||
        normH.includes('sales');

      const rawVals = new Float64Array(n);
      const scaledVals = new Float64Array(n);

      for (let i = 0; i < n; i++) {
        const raw = colCells[i];
        if (!raw) {
          rawVals[i] = NaN;
          scaledVals[i] = NaN;
        } else {
          const parsed = parseCellNumber(raw, formatAnalysis.decimalConvention);
          rawVals[i] = parsed !== null && !isNaN(parsed) ? parsed : NaN;
          if (parsed !== null && !isNaN(parsed)) {
            const mult = isMoneyCol ? unitInfo.multiplier : 1;
            scaledVals[i] = Math.round(parsed * mult);
          } else {
            scaledVals[i] = NaN;
          }
        }
      }

      columns.push({
        role: 'measure',
        key: r.key,
        label: r.label || r.file_header,
        unit: r.unit,
        values: scaledVals,
        raw_values: rawVals,
        raw_strings: colCells,
        detectedUnit: isMoneyCol ? unitInfo.unit : undefined,
        multiplier: isMoneyCol ? unitInfo.multiplier : 1,
        unitSource: isMoneyCol ? unitInfo.source : undefined,
        ambiguous_separator: formatAnalysis.isAmbiguous,
        sampleAmbiguous: formatAnalysis.sampleAmbiguous,
        userDecimalConvention: formatAnalysis.decimalConvention,
        initialDecimalConvention: formatAnalysis.decimalConvention,
      });
    }
  }

  const businessTable: BusinessTable = {
    kind: 'business',
    n,
    source_row,
    columns,
    skipped_blank_rows: skippedBlankRows,
    skipped_total_rows: skippedTotalRows,
    skipped_total_row_numbers: skippedTotalRowNumbers,
  };

  // Run strict business role resolution to check for mandatory Revenue column
  const resolved = resolveBusinessRoles(businessTable);

  // E3. Reasonability check for currency units (per-column average calculation)
  const revCol = resolved.revenue.col;
  const ordCol = resolved.orders.col;
  const cogsCol = resolved.cogs.col;

  let totalOrd = 0;
  if (ordCol && ordCol.role === 'measure') {
    for (let i = 0; i < n; i++) {
      const v = ordCol.values[i];
      if (!isNaN(v)) totalOrd += v;
    }
  }

  for (const col of businessTable.columns) {
    if (col.role === 'measure' && col.detectedUnit) {
      let colSum = 0;
      for (let i = 0; i < n; i++) {
        const v = col.values[i];
        if (!isNaN(v)) colSum += v;
      }
      const colAvg = totalOrd > 0 ? colSum / totalOrd : (n > 0 ? colSum / n : 0);
      const isSuspicious = colAvg > 0 && (colAvg < UNIT_SUSPICIOUS_MIN_AOV || colAvg > UNIT_SUSPICIOUS_MAX_AOV);
      col.unit_suspicious = isSuspicious;
      if (isSuspicious) {
        const unitName = col.userUnit || col.detectedUnit;
        const orderText = totalOrd > 0 ? 'đơn' : 'dòng';
        col.suspiciousReason = `Với đơn vị ${unitName}, mỗi ${orderText} trung bình khoảng ${Math.round(colAvg).toLocaleString('vi-VN')} đồng. Số này có vẻ vô lý. Anh/chị chắc đơn vị là ${unitName} chứ?`;
      }
    }
  }

  // E3. Warning if total COGS exceeds total Revenue
  if (revCol && revCol.role === 'measure' && cogsCol && cogsCol.role === 'measure') {
    let totalRev = 0;
    let totalCogs = 0;
    for (let i = 0; i < n; i++) {
      const rv = revCol.values[i];
      if (!isNaN(rv)) totalRev += rv;
      const cv = cogsCol.values[i];
      if (!isNaN(cv)) totalCogs += cv;
    }
    if (totalRev > 0 && totalCogs > 0 && totalCogs > totalRev) {
      businessTable.cogs_exceeds_revenue_warning = formatCogsExceedsRevenueWarning(totalCogs, totalRev);
    }
  }
  if (resolved.revenue.status === 'thiếu') {
    const msg = formatValidatorMessage('SCHEMA_NO_REVENUE_COLUMN');
    warnings.push({
      code: 'SCHEMA_NO_REVENUE_COLUMN',
      severity: 'warning',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Attach non-blocking warnings from business role resolver (e.g. missing COGS/orders/product)
  for (const w of resolved.warnings) {
    warnings.push({
      code: 'BUSINESS_ROLE_WARNING',
      severity: 'warning',
      message_vi: w,
      fix_vi: 'Nếu có dữ liệu này, hãy thêm cột tương ứng vào file để nhận báo cáo phân tích đầy đủ hơn.',
    });
  }

  const fileSha256 = await sha256Hex(rawBytes);

  const meta: DatasetMeta = {
    filename,
    rows: n,
    symbols: [],
    date_from: timeStart || '',
    date_to: timeEnd || '',
    sha256: fileSha256,
    source_sheet: sheetName,
    kind: 'business',
    columns_roles: roles.map((r) => ({
      file_header: r.file_header,
      key: r.key,
      role: r.role,
      unit: r.unit,
    })),
    time_range: timeStart && timeEnd ? { start: timeStart, end: timeEnd } : null,
    n_columns: headers.length,
    skipped_blank_rows: skippedBlankRows,
    warning_count: warnings.length,
  };

  // Preview first 20 rows
  const previewRows = records.slice(0, 20).map((r) => r.cells);

  const column_mapping = roles.map((r, idx) => ({
    colIndex: idx,
    fileHeader: r.file_header,
    key: r.key,
    label_vi: r.label || r.file_header,
    required: r.role === 'measure' || r.role === 'dimension',
  }));

  return {
    ok: true,
    businessTable,
    meta,
    issues: [],
    warnings,
    total_errors: 0,
    total_warnings: warnings.length,
    column_mapping,
    preview: {
      columns: headers,
      rows: previewRows,
    },
  };
}

/**
 * Re-scales business table values when user changes currency unit or decimal convention.
 */
export function recalculateBusinessTable(
  table: BusinessTable,
  options: {
    units?: Record<string, { unit: string; multiplier: number }>;
    decimals?: Record<string, 'dot' | 'comma'>;
  }
): BusinessTable {
  const newCols = table.columns.map((col) => {
    if (col.role !== 'measure' || !col.raw_values) return col;

    const key = col.key;
    const decimalConv =
      options.decimals?.[key] || col.userDecimalConvention || (col.ambiguous_separator ? 'comma' : 'dot');
    const unitSetting = options.units?.[key];
    const unitName = unitSetting ? unitSetting.unit : col.userUnit || col.detectedUnit || 'đồng';
    const multiplier = unitSetting ? unitSetting.multiplier : col.multiplier || 1;
    const initialConv = col.initialDecimalConvention || (col.ambiguous_separator ? 'comma' : 'dot');

    const newValues = new Float64Array(table.n);
    for (let i = 0; i < table.n; i++) {
      const raw = col.raw_values[i];
      if (isNaN(raw)) {
        newValues[i] = NaN;
      } else {
        let val = raw;
        if (col.ambiguous_separator && col.sampleAmbiguous && decimalConv !== initialConv) {
          const rawStr = col.raw_strings ? col.raw_strings[i] : undefined;
          const hasDot = rawStr !== undefined ? rawStr.includes('.') : true;
          if (decimalConv === 'dot') {
            if (hasDot) {
              val = raw / 1000;
            } else {
              val = raw;
            }
          } else {
            if (hasDot) {
              val = raw * 1000;
            } else {
              val = raw;
            }
          }
        }
        newValues[i] = Math.round(val * multiplier);
      }
    }

    return {
      ...col,
      values: newValues,
      raw_values: col.raw_values,
      raw_strings: col.raw_strings,
      initialDecimalConvention: col.initialDecimalConvention,
      userUnit: unitName,
      multiplier,
      unitSource: unitSetting ? ('người dùng xác nhận' as const) : col.unitSource,
      userDecimalConvention: decimalConv,
      userChosenRole: (col as any).userChosenRole,
    };
  });

  const newTable: BusinessTable = {
    ...table,
    columns: newCols,
  };

  let resolved = resolveBusinessRoles(newTable);
  resolved = applyManualBusinessRoles(resolved, newTable);
  const revCol = resolved.revenue.col;
  const ordCol = resolved.orders.col;
  const cogsCol = resolved.cogs.col;

  let totalOrd = 0;
  if (ordCol && ordCol.role === 'measure') {
    for (let i = 0; i < newTable.n; i++) {
      const v = ordCol.values[i];
      if (!isNaN(v)) totalOrd += v;
    }
  }

  for (const col of newTable.columns) {
    if (col.role === 'measure' && col.detectedUnit) {
      let colSum = 0;
      for (let i = 0; i < newTable.n; i++) {
        const v = col.values[i];
        if (!isNaN(v)) colSum += v;
      }
      const colAvg = totalOrd > 0 ? colSum / totalOrd : (newTable.n > 0 ? colSum / newTable.n : 0);
      const isSuspicious = colAvg > 0 && (colAvg < UNIT_SUSPICIOUS_MIN_AOV || colAvg > UNIT_SUSPICIOUS_MAX_AOV);
      col.unit_suspicious = isSuspicious;
      if (isSuspicious) {
        const unitName = col.userUnit || col.detectedUnit;
        const orderText = totalOrd > 0 ? 'đơn' : 'dòng';
        col.suspiciousReason = `Với đơn vị ${unitName}, mỗi ${orderText} trung bình khoảng ${Math.round(
          colAvg
        ).toLocaleString('vi-VN')} đồng. Số này có vẻ vô lý. Anh/chị chắc đơn vị là ${unitName} chứ?`;
      } else {
        col.suspiciousReason = undefined;
      }
    }
  }

  if (revCol && revCol.role === 'measure' && cogsCol && cogsCol.role === 'measure') {
    let totalRev = 0;
    let totalCogs = 0;
    for (let i = 0; i < newTable.n; i++) {
      const rv = revCol.values[i];
      if (!isNaN(rv)) totalRev += rv;
      const cv = cogsCol.values[i];
      if (!isNaN(cv)) totalCogs += cv;
    }
    if (totalRev > 0 && totalCogs > 0 && totalCogs > totalRev) {
      newTable.cogs_exceeds_revenue_warning = formatCogsExceedsRevenueWarning(totalCogs, totalRev);
    } else {
      newTable.cogs_exceeds_revenue_warning = undefined;
    }
  } else {
    newTable.cogs_exceeds_revenue_warning = undefined;
  }

  return newTable;
}

/**
 * Applies user manual column role mappings to resolved business roles.
 */
export function applyManualBusinessRoles(
  resolved: ReturnType<typeof resolveBusinessRoles>,
  table: BusinessTable
): ReturnType<typeof resolveBusinessRoles> {
  const result = {
    ...resolved,
    revenue: { ...resolved.revenue },
    cogs: { ...resolved.cogs },
    profit: { ...resolved.profit },
    orders: { ...resolved.orders },
    channel: { ...resolved.channel },
    region: { ...resolved.region },
    product: { ...resolved.product },
    time: { ...resolved.time },
    warnings: [...resolved.warnings],
  };

  let revenueAssignedManually = false;
  let manualRevLabel = '';

  for (const col of table.columns) {
    const userRole = (col as any).userChosenRole || table.manual_column_roles?.[col.label] || table.manual_column_roles?.[col.key];
    if (!userRole || userRole === 'auto') continue;

    if (userRole === 'revenue') {
      revenueAssignedManually = true;
      manualRevLabel = col.label;
      result.revenue = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'cogs') {
      result.cogs = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'profit') {
      result.profit = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'orders') {
      result.orders = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'channel') {
      result.channel = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'region') {
      result.region = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'product') {
      result.product = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    } else if (userRole === 'time') {
      result.time = {
        status: 'tìm thấy',
        col,
        reason_vi: `Người dùng gán thủ công từ "${col.label}"`,
        userChosen: true,
      } as any;
    }
  }

  if (revenueAssignedManually) {
    result.warnings = result.warnings.filter(
      (w) => !w.includes('Agent tạm hiểu') && !w.includes('Không thấy cột tên Doanh thu')
    );
    result.warnings.unshift(`Doanh thu: ${manualRevLabel} (người dùng chọn)`);
  }

  // Inter-metric calculation: If profit is missing but revenue and cogs are present
  if ((result.profit.status === 'thiếu' || !result.profit.col) && result.revenue.status === 'tìm thấy' && result.cogs.status === 'tìm thấy') {
    result.profit = {
      status: 'tính ra',
      col: null,
      reason_vi: 'Lợi nhuận gộp được tính bằng Doanh thu trừ Giá vốn',
    };
  }

  return result;
}
