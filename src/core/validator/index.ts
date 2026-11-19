/**
 * Core Validator Orchestrator for Datify AI Agent.
 * Executes stages S1 through S6, handles atomic validation, progress callbacks, and builds RawDataset.
 * Pure TypeScript - zero UI or service dependencies.
 */
import type { DatasetMeta, ValidationIssue } from '../schemas';
import type { RawDataset } from '../dataset';
import type { BusinessTable } from '../businessTable';
import { validateBusinessProfile } from './business';
import { sha256Hex } from '../hash';
import { detectFileFormat } from './detect';
import { analyzeHeader, type ColumnMappingItem } from './header';
import { formatValidatorMessage } from './messagesVi';
import {
  checkDateColumnAmbiguity,
  inferDecimalConvention,
  parseDateCell,
  parseNumber,
} from './parseCells';
import { readCsv } from './readCsv';
import { readXlsx } from './readXlsx';
import {
  validateDatasetWide,
  validateRowRules,
  type RowData,
} from './rules';
import {
  DEFAULT_LIMITS,
  type ValidatorLimits,
} from './schemaSpec';
export {
  DEFAULT_LIMITS,
  type ValidatorLimits,
};

export interface ValidationProgress {
  stage: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  percent: number;
  message?: string;
  label_vi?: string;
}

export interface ValidationHooks {
  onProgress?: (progress: ValidationProgress) => void;
  isCancelled?: () => boolean;
  signal?: AbortSignal;
}

export type ValidationOutcome =
  | {
      ok: true;
      summary: {
        rows: number;
        symbols: string[];
        date_from: string;
        date_to: string;
        skipped_blank_rows: number;
        source_sheet: string | null;
        sha256: string;
      };
      column_mapping: ColumnMappingItem[];
      warnings: ValidationIssue[];
      preview: {
        columns: string[];
        rows: (string | number | null)[][];
      };
      dataset?: RawDataset;
      businessTable?: BusinessTable;
      meta: DatasetMeta;
    }
  | {
      ok: false;
      filename: string;
      issues: ValidationIssue[];
      total_errors: number;
      total_warnings: number;
      truncated: boolean;
    };

const MAX_STORED_ISSUES = 500;

/**
 * Validates raw file bytes through all 6 verification stages.
 */
export async function validateBytes(
  filename: string,
  bytes: Uint8Array,
  limits: ValidatorLimits = DEFAULT_LIMITS,
  hooks: ValidationHooks = {}
): Promise<ValidationOutcome> {
  const { onProgress, isCancelled } = hooks;

  const checkCancel = () => {
    if (isCancelled && isCancelled()) {
      throw new Error('VALIDATION_ABORTED');
    }
  };

  // ==========================================
  // S1: File Gate
  // ==========================================
  checkCancel();
  onProgress?.({ stage: 'S1', percent: 10, message: 'Đang kiểm tra định dạng và tệp...' });

  const detection = detectFileFormat(filename, bytes, limits);
  if (!detection.ok && detection.issue) {
    return {
      ok: false,
      filename,
      issues: [detection.issue],
      total_errors: 1,
      total_warnings: 0,
      truncated: false,
    };
  }

  const format = detection.format!;

  // ==========================================
  // S2: Container Extraction
  // ==========================================
  checkCancel();
  onProgress?.({ stage: 'S2', percent: 25, message: 'Đang đọc cấu trúc bảng tính...' });

  let rawRecords: Array<{ rowNumber: number; cells: any[] }> = [];
  let sourceSheet: string | null = null;
  let skippedBlankRows = 0;
  const s2Warnings: ValidationIssue[] = [];

  if (format === 'csv') {
    const csvResult = readCsv(bytes);
    if (!csvResult.ok && csvResult.issue) {
      return {
        ok: false,
        filename,
        issues: [csvResult.issue],
        total_errors: 1,
        total_warnings: 0,
        truncated: false,
      };
    }
    rawRecords = csvResult.records || [];
    skippedBlankRows = csvResult.skippedBlankRows || 0;
  } else {
    // xlsx
    const xlsxResult = await readXlsx(bytes);
    if (!xlsxResult.ok && xlsxResult.issue) {
      return {
        ok: false,
        filename,
        issues: [xlsxResult.issue],
        total_errors: 1,
        total_warnings: 0,
        truncated: false,
      };
    }
    rawRecords = xlsxResult.records || [];
    sourceSheet = xlsxResult.sheetName || null;
    skippedBlankRows = xlsxResult.skippedBlankRows || 0;
    if (xlsxResult.warnings) {
      s2Warnings.push(...xlsxResult.warnings);
    }
  }

  checkCancel();

  // ==========================================
  // S3: Header Row & Schema Mapping
  // ==========================================
  onProgress?.({ stage: 'S3', percent: 45, message: 'Đang nhận diện các cột dữ liệu...' });

  const headerAnalysis = analyzeHeader(rawRecords, sourceSheet);

  // If candidateIndex === -1 (fewer than 4 trading columns), evaluate Business profile (Prompt M1)
  if (headerAnalysis.headerRecordIndex === -1) {
    if (rawRecords.length === 0) {
      const msg = formatValidatorMessage('UPLOAD_NO_DATA', { min_sessions: 30 });
      return {
        ok: false,
        filename,
        issues: [
          {
            code: 'UPLOAD_NO_DATA',
            severity: 'error',
            sheet: sourceSheet,
            message_vi: msg.message_vi,
            fix_vi: msg.fix_vi,
          },
        ],
        total_errors: 1,
        total_warnings: 0,
        truncated: false,
      };
    }

    let bHeaderIdx = 0;
    let foundTextHeader = false;
    while (bHeaderIdx < Math.min(rawRecords.length, 10)) {
      const textCells = rawRecords[bHeaderIdx].cells.filter(
        (c) => c !== null && c !== undefined && String(c).trim() !== '' && isNaN(Number(String(c).trim()))
      );
      if (textCells.length >= 2) {
        foundTextHeader = true;
        break;
      }
      bHeaderIdx++;
    }

    if (!foundTextHeader || bHeaderIdx >= rawRecords.length) {
      return {
        ok: false,
        filename,
        issues: headerAnalysis.issues,
        total_errors: 1,
        total_warnings: 0,
        truncated: false,
      };
    }

    const bHeaders = rawRecords[bHeaderIdx].cells.map((c) => String(c ?? '').trim());
    const bRecords = rawRecords.slice(bHeaderIdx + 1);

    const businessRes = await validateBusinessProfile(
      filename,
      bRecords,
      bHeaders,
      rawRecords[bHeaderIdx].rowNumber,
      skippedBlankRows,
      sourceSheet,
      bytes
    );

    if (businessRes.ok) {
      return {
        ok: true,
        summary: {
          rows: businessRes.businessTable!.n,
          symbols: [],
          date_from: businessRes.meta!.date_from,
          date_to: businessRes.meta!.date_to,
          skipped_blank_rows: skippedBlankRows,
          source_sheet: sourceSheet,
          sha256: businessRes.meta!.sha256 || '',
        },
        column_mapping: businessRes.column_mapping!,
        warnings: [...s2Warnings, ...businessRes.warnings],
        preview: businessRes.preview!,
        businessTable: businessRes.businessTable,
        meta: businessRes.meta!,
      };
    } else {
      // If file has < 5 rows and lacks measure or dimension (e.g. TC06 note sheet or partial trading snippet), retain UPLOAD_NO_HEADER
      const hasMeasure = businessRes.column_mapping?.some((c: any) => c.role === 'measure');
      const hasDimension = businessRes.column_mapping?.some((c: any) => c.role === 'dimension');
      if (bRecords.length < 5 && (!hasMeasure || !hasDimension) && headerAnalysis.issues.some((i) => i.code === 'UPLOAD_NO_HEADER')) {
        return {
          ok: false,
          filename,
          issues: [...s2Warnings, ...headerAnalysis.issues].slice(0, MAX_STORED_ISSUES),
          total_errors: headerAnalysis.issues.length,
          total_warnings: s2Warnings.length,
          truncated: false,
        };
      }

      const allIssues = [...s2Warnings, ...businessRes.issues];
      const errorCount = allIssues.filter((i) => i.severity === 'error').length;
      const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
      return {
        ok: false,
        filename,
        issues: allIssues.slice(0, MAX_STORED_ISSUES),
        total_errors: errorCount,
        total_warnings: warningCount,
        truncated: allIssues.length > MAX_STORED_ISSUES,
      };
    }
  }

  const s3Issues = [...s2Warnings, ...headerAnalysis.issues];

  const hasS3Errors = s3Issues.some((i) => i.severity === 'error');
  if (hasS3Errors) {
    const errorCount = s3Issues.filter((i) => i.severity === 'error').length;
    const warningCount = s3Issues.filter((i) => i.severity === 'warning').length;
    return {
      ok: false,
      filename,
      issues: s3Issues.slice(0, MAX_STORED_ISSUES),
      total_errors: errorCount,
      total_warnings: warningCount,
      truncated: s3Issues.length > MAX_STORED_ISSUES,
    };
  }

  const { mapping, columnKeyToIndex, dataRecords } = headerAnalysis;

  // ==========================================
  // S4: Cell Parsing & Inferences
  // ==========================================
  checkCancel();
  onProgress?.({ stage: 'S4', percent: 65, message: 'Đang phân tích kiểu số và ngày...' });

  const dateColIdx = columnKeyToIndex.get('date')!;
  const symbolColIdx = columnKeyToIndex.get('symbol')!;
  const openColIdx = columnKeyToIndex.get('open')!;
  const highColIdx = columnKeyToIndex.get('high')!;
  const lowColIdx = columnKeyToIndex.get('low')!;
  const closeColIdx = columnKeyToIndex.get('close')!;
  const volumeColIdx = columnKeyToIndex.get('volume')!;

  const tradeValColIdx = columnKeyToIndex.get('trade_value');
  const sectorColIdx = columnKeyToIndex.get('sector');
  const exchangeColIdx = columnKeyToIndex.get('exchange');

  // Collect numeric strings for decimal convention inference
  const numericStrings: Array<{ val: string; row: number; colName: string }> = [];
  const dateStrings: Array<{ raw: string; row: number }> = [];

  const numColIndices = [
    openColIdx,
    highColIdx,
    lowColIdx,
    closeColIdx,
    volumeColIdx,
    ...(tradeValColIdx !== undefined ? [tradeValColIdx] : []),
  ];

  for (const rec of dataRecords) {
    for (const cIdx of numColIndices) {
      const v = rec.cells[cIdx];
      if (typeof v === 'string') {
        numericStrings.push({ val: v, row: rec.rowNumber, colName: '' });
      }
    }
    const dv = rec.cells[dateColIdx];
    if (typeof dv === 'string' && dv.trim()) {
      dateStrings.push({ raw: dv, row: rec.rowNumber });
    }
  }

  // Decimal convention inference
  const decInference = inferDecimalConvention(numericStrings);
  const s4Issues: ValidationIssue[] = [...s3Issues];

  if (decInference.mixedIssue) {
    s4Issues.push(decInference.mixedIssue);
  }
  if (decInference.ambiguousIssue) {
    s4Issues.push(decInference.ambiguousIssue);
  }

  // Date column ambiguity check
  const dateAmbIssue = checkDateColumnAmbiguity(dateStrings);
  if (dateAmbIssue) {
    s4Issues.push(dateAmbIssue);
  }

  // Parse all cell values
  const parsedRows: RowData[] = [];
  let timeDroppedCount = 0;
  const missingByCol: Record<string, number> = {
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  };

  const isXlsx = format === 'xlsx';

  for (const rec of dataRecords) {
    const rawSymbol = rec.cells[symbolColIdx];
    const rawDate = rec.cells[dateColIdx];

    // Symbol: normalize uppercase and trimmed
    const symbolStr = rawSymbol !== null && rawSymbol !== undefined ? String(rawSymbol).trim().toUpperCase() : '';

    // Date
    const dateRes = parseDateCell(rawDate, isXlsx);
    if (dateRes.timeDropped) {
      timeDroppedCount++;
    }

    // Numbers
    const parseColNum = (colIdx: number, colKey: string, label: string) => {
      const rawVal = rec.cells[colIdx];
      const parsed = parseNumber(rawVal, decInference.convention);

      if (parsed === null) {
        // Bad number error
        const msg = formatValidatorMessage('DATA_BAD_NUMBER', {
          row: rec.rowNumber,
          column: label,
          value: rawVal !== null && rawVal !== undefined ? String(rawVal) : '',
        });
        s4Issues.push({
          code: 'DATA_BAD_NUMBER',
          severity: 'error',
          sheet: sourceSheet,
          row: rec.rowNumber,
          column_key: colKey,
          value: rawVal,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
        return NaN;
      }

      if (isNaN(parsed)) {
        if (colKey in missingByCol) {
          missingByCol[colKey]++;
        }
      }

      return parsed;
    };

    const open = parseColNum(openColIdx, 'open', 'Giá mở');
    const high = parseColNum(highColIdx, 'high', 'Giá cao');
    const low = parseColNum(lowColIdx, 'low', 'Giá thấp');
    const close = parseColNum(closeColIdx, 'close', 'Giá đóng');
    const volume = parseColNum(volumeColIdx, 'volume', 'Khối lượng');

    const tradeVal =
      tradeValColIdx !== undefined
        ? parseColNum(tradeValColIdx, 'trade_value', 'Giá trị GD')
        : undefined;

    const sectorVal =
      sectorColIdx !== undefined && rec.cells[sectorColIdx] !== null && rec.cells[sectorColIdx] !== undefined
        ? String(rec.cells[sectorColIdx]).trim()
        : undefined;

    const exchangeVal =
      exchangeColIdx !== undefined && rec.cells[exchangeColIdx] !== null && rec.cells[exchangeColIdx] !== undefined
        ? String(rec.cells[exchangeColIdx]).trim()
        : undefined;

    parsedRows.push({
      sourceRow: rec.rowNumber,
      dateDays: dateRes.dateDays,
      rawDateStr: rawDate !== null && rawDate !== undefined ? String(rawDate) : '',
      symbol: symbolStr,
      rawSymbol: rawSymbol !== null && rawSymbol !== undefined ? String(rawSymbol) : '',
      open,
      high,
      low,
      close,
      volume,
      tradeValue: tradeVal !== undefined && !isNaN(tradeVal) ? tradeVal : undefined,
      sector: sectorVal,
      exchange: exchangeVal,
    });
  }

  // Time dropped warning
  if (timeDroppedCount > 0) {
    const msg = formatValidatorMessage('DATA_TIME_PART_DROPPED', {
      count: timeDroppedCount,
    });
    s4Issues.push({
      code: 'DATA_TIME_PART_DROPPED',
      severity: 'warning',
      sheet: sourceSheet,
      count: timeDroppedCount,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Missing values warnings & Too many missing check (> 30%)
  const totalRows = dataRecords.length;
  let totalMissingCells = 0;
  const missingSummaryParts: string[] = [];

  for (const [colKey, count] of Object.entries(missingByCol)) {
    if (count > 0) {
      totalMissingCells += count;
      const pct = (count / totalRows) * 100;
      missingSummaryParts.push(`${colKey}: ${count} (${pct.toFixed(1)}%)`);

      if (pct > 30) {
        const msg = formatValidatorMessage('DATA_TOO_MANY_MISSING', {
          column: colKey,
          percent: 30,
          missing: count,
          total: totalRows,
        });
        s4Issues.push({
          code: 'DATA_TOO_MANY_MISSING',
          severity: 'error',
          sheet: sourceSheet,
          column_key: colKey,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
      }
    }
  }

  if (totalMissingCells > 0) {
    const msg = formatValidatorMessage('DATA_MISSING_VALUES', {
      count: totalMissingCells,
      summary: missingSummaryParts.join(', '),
    });
    s4Issues.push({
      code: 'DATA_MISSING_VALUES',
      severity: 'warning',
      sheet: sourceSheet,
      count: totalMissingCells,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // ==========================================
  // S5: Row-Level Logic Rules
  // ==========================================
  checkCancel();
  onProgress?.({ stage: 'S5', percent: 80, message: 'Đang kiểm tra tính nhất quán OHLC và dòng...' });

  const s5Result = validateRowRules(parsedRows, sourceSheet);
  const s5Issues = [...s4Issues, ...s5Result.issues];

  // ==========================================
  // S6: Dataset-Wide Invariants
  // ==========================================
  checkCancel();
  onProgress?.({ stage: 'S6', percent: 92, message: 'Đang kiểm tra số mã và phiên giao dịch...' });

  const s6Result = validateDatasetWide(
    s5Result.validRows,
    totalRows,
    limits,
    sourceSheet
  );
  const allIssues = [...s5Issues, ...s6Result.issues];

  // Group and sort issues: errors first, then warnings; within each group, sort by row number
  const errorIssues = allIssues.filter((i) => i.severity === 'error');
  const warningIssues = allIssues.filter((i) => i.severity === 'warning');

  const sortByRow = (a: ValidationIssue, b: ValidationIssue) => {
    const rA = a.row ?? -1;
    const rB = b.row ?? -1;
    return rA - rB;
  };

  errorIssues.sort(sortByRow);
  warningIssues.sort(sortByRow);

  const sortedIssues = [...errorIssues, ...warningIssues];
  const totalErrors = errorIssues.length;
  const totalWarnings = warningIssues.length;

  if (totalErrors > 0) {
    return {
      ok: false,
      filename,
      issues: sortedIssues.slice(0, MAX_STORED_ISSUES),
      total_errors: totalErrors,
      total_warnings: totalWarnings,
      truncated: sortedIssues.length > MAX_STORED_ISSUES,
    };
  }

  // ==========================================
  // Successful Outcome Construction
  // ==========================================
  onProgress?.({ stage: 'S6', percent: 98, message: 'Đang chuẩn bị dữ liệu và xem trước...' });

  const finalRows = s6Result.filteredRows;
  const n = finalRows.length;

  // Build unique symbols table
  const symbols = s6Result.symbols;
  const symbolIndexMap = new Map<string, number>();
  symbols.forEach((sym, idx) => symbolIndexMap.set(sym, idx));

  // Initialize columnar typed arrays
  const symbol_idx = new Uint16Array(n);
  const date_days = new Int32Array(n);
  const openArr = new Float64Array(n);
  const highArr = new Float64Array(n);
  const lowArr = new Float64Array(n);
  const closeArr = new Float64Array(n);
  const volumeArr = new Float64Array(n);
  const source_row = new Int32Array(n);

  let trade_value: Float64Array | undefined = undefined;
  if (tradeValColIdx !== undefined) {
    trade_value = new Float64Array(n);
  }

  let sectorArr: string[] | undefined = undefined;
  if (sectorColIdx !== undefined) {
    sectorArr = new Array(n);
  }

  let exchangeArr: string[] | undefined = undefined;
  if (exchangeColIdx !== undefined) {
    exchangeArr = new Array(n);
  }

  let minDateDays = Infinity;
  let maxDateDays = -Infinity;

  for (let idx = 0; idx < n; idx++) {
    const row = finalRows[idx];

    symbol_idx[idx] = symbolIndexMap.get(row.symbol) || 0;
    const dd = row.dateDays !== null ? row.dateDays : 0;
    date_days[idx] = dd;

    if (dd < minDateDays) minDateDays = dd;
    if (dd > maxDateDays) maxDateDays = dd;

    openArr[idx] = row.open;
    highArr[idx] = row.high;
    lowArr[idx] = row.low;
    closeArr[idx] = row.close;
    volumeArr[idx] = row.volume;
    source_row[idx] = row.sourceRow;

    if (trade_value) {
      trade_value[idx] = row.tradeValue !== undefined ? row.tradeValue : NaN;
    }
    if (sectorArr) {
      sectorArr[idx] = row.sector || '';
    }
    if (exchangeArr) {
      exchangeArr[idx] = row.exchange || '';
    }
  }

  const dataset: RawDataset = {
    n,
    symbols,
    symbol_idx,
    date_days,
    open: openArr,
    high: highArr,
    low: lowArr,
    close: closeArr,
    volume: volumeArr,
    trade_value,
    sector: sectorArr,
    exchange: exchangeArr,
    source_row,
  };

  const date_from =
    minDateDays !== Infinity
      ? new Date(minDateDays * 86400000).toISOString().slice(0, 10)
      : '';
  const date_to =
    maxDateDays !== -Infinity
      ? new Date(maxDateDays * 86400000).toISOString().slice(0, 10)
      : '';

  // Calculate SHA-256 hash of original file bytes
  const sha256 = await sha256Hex(bytes);

  // Present columns
  const columns_present = mapping.map((m) => m.key);
  const optional_columns = mapping.filter((m) => !m.required).map((m) => m.key);

  const meta: DatasetMeta = {
    filename,
    rows: n,
    symbols,
    date_from,
    date_to,
    kind: 'trading',
    sha256,
    source_sheet: sourceSheet,
    columns_present,
    optional_columns,
    symbol_rows: s6Result.symbolRowCounts,
    skipped_blank_rows: skippedBlankRows,
    warning_count: totalWarnings,
  };

  // Build preview of first 20 rows
  const previewColumns = ['Ngày', 'Mã', 'Giá mở', 'Giá cao', 'Giá thấp', 'Giá đóng', 'Khối lượng'];
  const previewRowsLimit = Math.min(n, 20);
  const previewRows: (string | number | null)[][] = [];

  for (let idx = 0; idx < previewRowsLimit; idx++) {
    const dStr = new Date(date_days[idx] * 86400000).toLocaleDateString('vi-VN');
    const sym = symbols[symbol_idx[idx]];
    const o = isNaN(openArr[idx]) ? null : openArr[idx];
    const h = isNaN(highArr[idx]) ? null : highArr[idx];
    const l = isNaN(lowArr[idx]) ? null : lowArr[idx];
    const c = isNaN(closeArr[idx]) ? null : closeArr[idx];
    const v = isNaN(volumeArr[idx]) ? null : volumeArr[idx];

    previewRows.push([dStr, sym, o, h, l, c, v]);
  }

  onProgress?.({ stage: 'S6', percent: 100, message: 'Kiểm tra hoàn tất!' });

  return {
    ok: true,
    summary: {
      rows: n,
      symbols,
      date_from,
      date_to,
      skipped_blank_rows: skippedBlankRows,
      source_sheet: sourceSheet,
      sha256,
    },
    column_mapping: mapping,
    warnings: warningIssues.slice(0, MAX_STORED_ISSUES),
    preview: {
      columns: previewColumns,
      rows: previewRows,
    },
    dataset,
    meta,
  };
}

