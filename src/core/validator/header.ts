/**
 * Stage S3: Header row detection and column schema mapping.
 * Identifies header in first 10 rows, maps internal keys, detects missing/duplicate/unknown columns.
 * Pure TypeScript - zero external runtime dependencies.
 */
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';
import {
  ALL_COLUMNS,
  matchColumn,
  REQUIRED_COLUMNS,
  type ColumnDefinition,
} from './schemaSpec';

export interface ColumnMappingItem {
  colIndex: number;
  fileHeader: string;
  key: string;
  label_vi: string;
  required: boolean;
}

export interface HeaderAnalysisResult {
  ok: boolean;
  headerRecordIndex: number;
  headerRowNumber: number;
  mapping: ColumnMappingItem[];
  columnKeyToIndex: Map<string, number>;
  dataRecords: Array<{ rowNumber: number; cells: any[] }>;
  issues: ValidationIssue[];
}

export interface GenericRecord {
  rowNumber: number;
  cells: any[];
}

/**
 * Stage S3: Finds header row and establishes column mappings.
 */
export function analyzeHeader(
  records: GenericRecord[],
  sheetName?: string | null
): HeaderAnalysisResult {
  const issues: ValidationIssue[] = [];

  if (records.length === 0) {
    const msg = formatValidatorMessage('UPLOAD_NO_DATA', { min_sessions: 30 });
    return {
      ok: false,
      headerRecordIndex: -1,
      headerRowNumber: 0,
      mapping: [],
      columnKeyToIndex: new Map(),
      dataRecords: [],
      issues: [
        {
          code: 'UPLOAD_NO_DATA',
          severity: 'error',
          sheet: sheetName,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      ],
    };
  }

  // 1. Search first 10 rows for a row with >= 4 matching required columns
  let candidateIndex = -1;
  const searchLimit = Math.min(records.length, 10);

  for (let r = 0; r < searchLimit; r++) {
    const cells = records[r].cells;
    let matchedRequiredCount = 0;
    const seenKeys = new Set<string>();

    for (const cell of cells) {
      if (cell !== null && cell !== undefined) {
        const text = String(cell).trim();
        if (text) {
          const colDef = matchColumn(text);
          if (colDef && colDef.required && !seenKeys.has(colDef.key)) {
            seenKeys.add(colDef.key);
            matchedRequiredCount++;
          }
        }
      }
    }

    if (matchedRequiredCount >= 4) {
      candidateIndex = r;
      break;
    }
  }

  // If no row has >= 4 required columns, reject as UPLOAD_NO_HEADER
  if (candidateIndex === -1) {
    const msg = formatValidatorMessage('UPLOAD_NO_HEADER');
    return {
      ok: false,
      headerRecordIndex: -1,
      headerRowNumber: 0,
      mapping: [],
      columnKeyToIndex: new Map(),
      dataRecords: [],
      issues: [
        {
          code: 'UPLOAD_NO_HEADER',
          severity: 'error',
          sheet: sheetName,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        },
      ],
    };
  }

  const headerRecord = records[candidateIndex];
  const headerRowNumber = headerRecord.rowNumber;

  // Warning if header row was not at row 1
  if (headerRowNumber > 1) {
    const msg = formatValidatorMessage('SCHEMA_HEADER_ROW_MOVED', {
      row: headerRowNumber,
    });
    issues.push({
      code: 'SCHEMA_HEADER_ROW_MOVED',
      severity: 'warning',
      sheet: sheetName,
      row: headerRowNumber,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // 2. Map columns from header cells
  const mapping: ColumnMappingItem[] = [];
  const columnKeyToIndex = new Map<string, number>();
  const duplicateMap = new Map<string, string[]>(); // key -> file headers
  const unknownHeaders: string[] = [];

  const headerCells = headerRecord.cells;
  for (let colIdx = 0; colIdx < headerCells.length; colIdx++) {
    const rawVal = headerCells[colIdx];
    if (rawVal === null || rawVal === undefined) continue;
    const fileHeader = String(rawVal).trim();
    if (!fileHeader) continue;

    const colDef = matchColumn(fileHeader);
    if (colDef) {
      if (columnKeyToIndex.has(colDef.key)) {
        // Duplicate mapping error!
        if (!duplicateMap.has(colDef.key)) {
          const existingItem = mapping.find((m) => m.key === colDef.key);
          duplicateMap.set(colDef.key, [existingItem ? existingItem.fileHeader : colDef.label_vi]);
        }
        duplicateMap.get(colDef.key)!.push(fileHeader);
      } else {
        columnKeyToIndex.set(colDef.key, colIdx);
        mapping.push({
          colIndex: colIdx,
          fileHeader,
          key: colDef.key,
          label_vi: colDef.label_vi,
          required: colDef.required,
        });
      }
    } else {
      unknownHeaders.push(fileHeader);
    }
  }

  // Report duplicate columns
  for (const [key, headers] of duplicateMap.entries()) {
    const colDef = ALL_COLUMNS.find((c) => c.key === key);
    const label = colDef ? colDef.label_vi : key;
    const msg = formatValidatorMessage('SCHEMA_DUPLICATE_COLUMN', {
      key: label,
      columns: headers.join(', '),
    });
    issues.push({
      code: 'SCHEMA_DUPLICATE_COLUMN',
      severity: 'error',
      sheet: sheetName,
      row: headerRowNumber,
      column_key: key,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // 3. Verify missing required columns
  const missingCols: ColumnDefinition[] = [];
  for (const reqCol of REQUIRED_COLUMNS) {
    if (!columnKeyToIndex.has(reqCol.key)) {
      missingCols.push(reqCol);
    }
  }

  if (missingCols.length > 0) {
    const names = missingCols.map((c) => c.label_vi).join(', ');
    const msg = formatValidatorMessage('SCHEMA_MISSING_COLUMN', {
      count: missingCols.length,
      columns: names,
    });
    issues.push({
      code: 'SCHEMA_MISSING_COLUMN',
      severity: 'error',
      sheet: sheetName,
      row: headerRowNumber,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // 4. Report unknown columns (warning)
  if (unknownHeaders.length > 0) {
    const msg = formatValidatorMessage('SCHEMA_UNKNOWN_COLUMN', {
      count: unknownHeaders.length,
      columns: unknownHeaders.join(', '),
    });
    issues.push({
      code: 'SCHEMA_UNKNOWN_COLUMN',
      severity: 'warning',
      sheet: sheetName,
      row: headerRowNumber,
      count: unknownHeaders.length,
      examples: unknownHeaders.slice(0, 5),
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  const dataRecords = records.slice(candidateIndex + 1);

  if (!hasErrors && dataRecords.length === 0) {
    const msg = formatValidatorMessage('UPLOAD_NO_DATA', { min_sessions: 30 });
    issues.push({
      code: 'UPLOAD_NO_DATA',
      severity: 'error',
      sheet: sheetName,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  return {
    ok: !hasErrors && dataRecords.length > 0,
    headerRecordIndex: candidateIndex,
    headerRowNumber,
    mapping,
    columnKeyToIndex,
    dataRecords,
    issues,
  };
}

