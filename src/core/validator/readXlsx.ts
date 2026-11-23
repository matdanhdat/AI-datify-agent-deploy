/**
 * Stage S2: Excel (.xlsx) container parser using `exceljs`.
 * Handles sheet selection, formula results, rich text, dates, and empty rows.
 * Implements Prompt 1C-2b Multi-sheet specifications (D1, D2).
 * Pure TypeScript - zero UI/DOM dependencies.
 */
import ExcelJS from 'exceljs';
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';

export interface XlsxRecord {
  /** 1-based physical Excel row number */
  rowNumber: number;
  /** Cell values across columns */
  cells: any[];
}

export interface XlsxSheetInfo {
  name: string;
  rowCount: number;
  isHidden: boolean;
  header?: string[];
  sameHeaderAsSelected?: boolean;
}

export interface XlsxParseResult {
  ok: boolean;
  records?: XlsxRecord[];
  sheetName?: string;
  allSheets?: XlsxSheetInfo[];
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

interface SheetAnalysis {
  sheet: ExcelJS.Worksheet;
  name: string;
  isHidden: boolean;
  header: string[];
  dataRowCount: number;
  hasNumbers: boolean;
  colCount: number;
  index: number;
}

/**
 * Stage S2 for Excel files: loads workbook and extracts records from the designated sheet.
 */
export async function readXlsx(bytes: Uint8Array, requestedSheetName?: string): Promise<XlsxParseResult> {
  const warnings: ValidationIssue[] = [];
  const workbook = new ExcelJS.Workbook();

  try {
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

  // Analyze each sheet to satisfy D1 & D2
  const analyses: SheetAnalysis[] = [];
  workbook.worksheets.forEach((ws, idx) => {
    let header: string[] = [];
    let dataRowCount = 0;
    let hasNumbers = false;
    let maxCols = 0;

    ws.eachRow({ includeEmpty: false }, (row) => {
      const cellValues: any[] = [];
      const colLimit = Math.max(row.cellCount || 0, Array.isArray(row.values) ? row.values.length : 0);
      for (let c = 1; c <= colLimit; c++) {
        const val = extractCellValue(row.getCell(c));
        cellValues.push(val);
      }

      const nonEmptyCells = cellValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
      if (nonEmptyCells.length === 0) return;

      if (header.length === 0) {
        header = cellValues.map((v) => String(v ?? '').trim()).filter((v) => v !== '');
        maxCols = header.length;
      } else {
        dataRowCount++;
        if (!hasNumbers) {
          for (const c of cellValues) {
            if (typeof c === 'number' && !isNaN(c)) {
              hasNumbers = true;
              break;
            }
            if (typeof c === 'string' && c.trim() !== '' && !isNaN(Number(c.trim().replace(/,/g, '').replace(/\./g, '')))) {
              hasNumbers = true;
              break;
            }
          }
        }
      }
    });

    analyses.push({
      sheet: ws,
      name: ws.name,
      isHidden: ws.state === 'hidden',
      header,
      dataRowCount,
      hasNumbers,
      colCount: maxCols,
      index: idx,
    });
  });

  // Find target sheet
  let selectedAnalysis: SheetAnalysis | null = null;

  if (requestedSheetName) {
    selectedAnalysis =
      analyses.find(
        (a) => a.name === requestedSheetName || a.name.trim().toLowerCase() === requestedSheetName.trim().toLowerCase()
      ) || null;
  }

  if (!selectedAnalysis) {
    // D1: Sheet có nhiều dòng dữ liệu nhất (hòa: sheet đứng trước).
    // Sheet chỉ có 1 cột hoặc toàn chữ tự do không cột số thì không được mặc định.
    const candidateSheets = analyses.filter(
      (a) => !a.isHidden && a.colCount > 1 && a.hasNumbers && a.dataRowCount > 0
    );

    if (candidateSheets.length > 0) {
      candidateSheets.sort((a, b) => {
        if (b.dataRowCount !== a.dataRowCount) {
          return b.dataRowCount - a.dataRowCount; // most data rows first
        }
        return a.index - b.index; // tie: earlier index first
      });
      selectedAnalysis = candidateSheets[0];
    } else {
      // Fallback to first visible sheet
      selectedAnalysis = analyses.find((a) => !a.isHidden) || analyses[0];
    }
  }

  const targetSheet = selectedAnalysis.sheet;

  if (workbook.worksheets.length > 1 && !requestedSheetName) {
    const hasExplicitDuLieu = analyses.some((a) => {
      const norm = a.name.toLowerCase().replace(/[\s_-]/g, '');
      return norm === 'dulieu' || norm === 'data';
    });
    if (!hasExplicitDuLieu) {
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
  }

  // D2: Cảnh báo khi có sheet khác cùng header với sheet đang chọn:
  // "Sheet <tên> có cùng tiêu đề cột và KHÔNG được gộp."
  const normSelectedHeader = selectedAnalysis.header.map((h) => h.toLowerCase()).join('|');
  const allSheets: XlsxSheetInfo[] = analyses.map((a) => {
    const isSameHeader =
      a.name !== selectedAnalysis!.name &&
      a.header.length > 0 &&
      a.header.map((h) => h.toLowerCase()).join('|') === normSelectedHeader;

    if (isSameHeader) {
      warnings.push({
        code: 'SCHEMA_SHEET_SAME_HEADER',
        severity: 'warning',
        sheet: a.name,
        message_vi: `Sheet "${a.name}" có cùng tiêu đề cột và KHÔNG được gộp.`,
        fix_vi: 'Bạn có thể chuyển sang xem sheet này bằng cách chọn nút sheet tương ứng.',
      });
    }

    return {
      name: a.name,
      rowCount: a.dataRowCount,
      isHidden: a.isHidden,
      header: a.header,
      sameHeaderAsSelected: isSameHeader,
    };
  });

  const records: XlsxRecord[] = [];
  let skippedBlankRows = 0;

  targetSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cellValues: any[] = [];
    let hasAnyValue = false;
    const maxCol = Math.max(row.cellCount || 0, Array.isArray(row.values) ? row.values.length : 0);
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
    allSheets,
    warnings,
    skippedBlankRows,
  };
}
