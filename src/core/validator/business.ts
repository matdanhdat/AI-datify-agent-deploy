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
      norm.includes('chiphi') ||
      norm.includes('loinhuan') ||
      norm.includes('sodon') ||
      norm.includes('soluong') ||
      norm.includes('dongia') ||
      norm.includes('revenue') ||
      norm.includes('cost') ||
      norm.includes('profit') ||
      norm.includes('orders') ||
      norm.includes('price') ||
      norm.includes('amount') ||
      norm.includes('quantity') ||
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

    if (!idAssigned && isIdName && uniqueness >= 0.8) {
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
      const parsed = parseNumber(cell);
      if (parsed !== null && !isNaN(parsed)) {
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
      norm.includes('kenh') ||
      norm.includes('channel') ||
      norm.includes('khuvuc') ||
      norm.includes('region') ||
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

  // Constraint 2: Minimum 5 rows of content
  if (records.length < 5) {
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
            const p = parseNumber(str);
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
      const vals = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const raw = String(records[i].cells[c] ?? '').trim();
        if (!raw) {
          vals[i] = NaN;
        } else {
          const parsed = parseNumber(raw);
          vals[i] = parsed !== null && !isNaN(parsed) ? parsed : NaN;
        }
      }

      columns.push({
        role: 'measure',
        key: r.key,
        label: r.label || r.file_header,
        unit: r.unit,
        values: vals,
      });
    }
  }

  const businessTable: BusinessTable = {
    kind: 'business',
    n,
    source_row,
    columns,
    skipped_blank_rows: skippedBlankRows,
  };

  // Run strict business role resolution to check for mandatory Revenue column
  const resolved = resolveBusinessRoles(businessTable);
  if (resolved.revenue.status === 'thiếu') {
    const msg = formatValidatorMessage('SCHEMA_NO_REVENUE_COLUMN');
    issues.push({
      code: 'SCHEMA_NO_REVENUE_COLUMN',
      severity: 'error',
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
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
