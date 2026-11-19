/**
 * Stage S2: Excel (.xlsx) container parser using `exceljs`.
 * Handles sheet selection (preferring "DuLieu"), formula results, rich text, dates, and empty rows.
 * Pure TypeScript - zero UI/DOM dependencies.
 */
import ExcelJS from 'exceljs';
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';
import { normalizeColumnName } from './schemaSpec';

export interface XlsxRecord {
  /** 1-based physical Excel row number */
  rowNumber: number;
  /** Cell values across columns */
  cells: any[];
}

export interface XlsxParseResult {
  ok: boolean;
  records?: XlsxRecord[];
  sheetName?: string;
  warnings?: ValidationIssue[];
  skippedBlankRows?: number;
  issue?: ValidationIssue;
}

/**
 * Extracts a normalized, plain value from an ExcelJS Cell object.
 */
export function extractCellValue(cell: ExcelJS.Cell): any {
  if (cell.value === null || cell.value === undefined) return null;
  const val: any = cell.value;

  // 1. Formula cell: take cached calculated result
  if (typeof val === 'object' && 'formula' in val) {
    if (val.error) return { error: String(val.error) };
    return val.result !== undefined && val.result !== null ? val.result : null;
  }

  // 2. Formula or cell error (#N/A, #DIV/0!, etc.)
  if (typeof val === 'object' && 'error' in val) {
    return { error: String(val.error) };
  }

  // 3. Rich text formatting: concatenate all text fragments
  if (typeof val === 'object' && Array.isArray(val.richText)) {
    return val.richText.map((part: any) => part.text || '').join('');
  }

  // 4. Hyperlink cell: extract plain text
  if (typeof val === 'object' && 'text' in val) {
    return val.text;
  }

  // 5. Native Date object
  if (val instanceof Date) {
    return val;
  }

  return val;
}

/**
 * Stage S2 for Excel files: loads workbook and extracts records from the designated sheet.
 */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxParseResult> {
  const warnings: ValidationIssue[] = [];
  const workbook = new ExcelJS.Workbook();

  try {
    // ArrayBuffer slice ensures compatibility across Node.js Buffer and Web Uint8Array
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(buffer as any);
  } catch (_err: any) {
    const msg = formatValidatorMessage('UPLOAD_CORRUPT', {
      filename: 'file.xlsx',
      detail: 'không thể giải mã cấu trúc sổ làm việc Excel',
    });
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_CORRUPT',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  if (!workbook.worksheets || workbook.worksheets.length === 0) {
    const msg = formatValidatorMessage('UPLOAD_NO_DATA', { min_sessions: 30 });
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_NO_DATA',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  // Find preferred sheet "DuLieu" or first visible sheet
  let targetSheet: ExcelJS.Worksheet | null = null;
  let isFallbackSheet = false;

  for (const sheet of workbook.worksheets) {
    const norm = normalizeColumnName(sheet.name);
    if (norm === 'dulieu' || norm === 'du lieu' || norm === 'data') {
      targetSheet = sheet;
      break;
    }
  }

  if (!targetSheet) {
    // Take first visible sheet
    for (const sheet of workbook.worksheets) {
      if (sheet.state !== 'hidden') {
        targetSheet = sheet;
        isFallbackSheet = true;
        break;
      }
    }
  }

  if (!targetSheet) {
    targetSheet = workbook.worksheets[0];
    isFallbackSheet = true;
  }

  if (isFallbackSheet && workbook.worksheets.length > 1) {
    const msg = formatValidatorMessage('SCHEMA_SHEET_FALLBACK', {
      sheet: targetSheet.name,
    });
    warnings.push({
      code: 'SCHEMA_SHEET_FALLBACK',
      severity: 'warning',
      sheet: targetSheet.name,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  const records: XlsxRecord[] = [];
  let skippedBlankRows = 0;

  targetSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Collect cell values (row.values in exceljs is 1-indexed, element 0 is unused)
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cellValues: any[] = [];
    let hasAnyValue = false;

    // Use column count from row.cellCount or rawValues length
    const maxCol = Math.max(row.cellCount || 0, rawValues.length);
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      const val = extractCellValue(cell);
      cellValues.push(val);

      if (val !== null && val !== undefined && String(val).trim() !== '') {
        hasAnyValue = true;
      }
    }

    if (!hasAnyValue) {
      skippedBlankRows++;
    } else {
      records.push({
        rowNumber,
        cells: cellValues,
      });
    }
  });

  return {
    ok: true,
    records,
    sheetName: targetSheet.name,
    warnings,
    skippedBlankRows,
  };
}

