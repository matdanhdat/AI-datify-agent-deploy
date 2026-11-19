/**
 * Stage S2: RFC 4180 compliant CSV parser with physical row tracking and delimiter autodetection.
 * Supports UTF-8 (with or without BOM) and Windows-1258 encodings.
 * Pure TypeScript - zero external runtime dependencies.
 */
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';

export interface CsvRecord {
  /** 1-based physical line number in the source file where this record begins */
  rowNumber: number;
  /** Cell values for this record */
  cells: string[];
}

export interface CsvParseResult {
  ok: boolean;
  records?: CsvRecord[];
  delimiter?: string;
  encoding?: 'utf-8' | 'windows-1258';
  skippedBlankRows?: number;
  issue?: ValidationIssue;
}

/**
 * Decodes raw bytes to text using UTF-8 (stripping BOM) or Windows-1258 fallback.
 */
export function decodeCsvBytes(bytes: Uint8Array): {
  text?: string;
  encoding?: 'utf-8' | 'windows-1258';
  error?: boolean;
} {
  // 1. Try UTF-8 with fatal: true to reject non-UTF8 binary/malformed sequences
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = decoder.decode(bytes);

    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    return { text, encoding: 'utf-8' };
  } catch (_utf8Err) {
    // 2. Try Windows-1258 (Vietnamese code page)
    try {
      const decoder = new TextDecoder('windows-1258', { fatal: true });
      const text = decoder.decode(bytes);
      return { text, encoding: 'windows-1258' };
    } catch (_winErr) {
      return { error: true };
    }
  }
}

/**
 * Autodetects the delimiter among `,`, `;`, `\t`, `|` by scanning the first lines outside quotes.
 */
export function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t', '|'];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 10);

  if (lines.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = lines.map((line) => {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === delim && !inQuotes) {
          count++;
        }
      }
      return count;
    });

    // We want a delimiter that appears at least once per line (>0) and has consistent count across lines
    const firstCount = counts[0];
    if (firstCount > 0) {
      const isConsistent = counts.every((c) => c === firstCount);
      const score = (isConsistent ? 100 : 0) + firstCount;
      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = delim;
      }
    }
  }

  return bestDelimiter;
}

/**
 * Parses CSV text strictly according to RFC 4180 while tracking physical start row numbers.
 */
export function parseCsvText(text: string, delimiter = ','): {
  records: CsvRecord[];
  skippedBlankRows: number;
} {
  const records: CsvRecord[] = [];
  let skippedBlankRows = 0;

  const len = text.length;
  let i = 0;

  let physicalLine = 1;
  let recordStartLine = 1;

  let currentRecord: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  while (i < len) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes) {
        // Lookahead for escaped quote `""`
        if (i + 1 < len && text[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
        }
      } else {
        inQuotes = true;
      }
      i++;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRecord.push(currentCell);
      currentCell = '';
      i++;
      continue;
    }

    if (!inQuotes && (char === '\r' || char === '\n')) {
      // Complete current cell
      currentRecord.push(currentCell);
      currentCell = '';

      // Check if record is blank (all whitespace/empty)
      const isBlank = currentRecord.every((c) => c.trim().length === 0);
      if (isBlank) {
        if (currentRecord.length > 0) {
          skippedBlankRows++;
        }
      } else {
        records.push({
          rowNumber: recordStartLine,
          cells: currentRecord,
        });
      }

      // Advance line
      if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
      physicalLine++;
      recordStartLine = physicalLine;
      currentRecord = [];
      continue;
    }

    // Inside quotes newline tracking
    if (inQuotes && char === '\n') {
      physicalLine++;
    }

    currentCell += char;
    i++;
  }

  // Handle last cell & record if file doesn't end with newline
  if (currentCell.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentCell);
    const isBlank = currentRecord.every((c) => c.trim().length === 0);
    if (isBlank) {
      skippedBlankRows++;
    } else {
      records.push({
        rowNumber: recordStartLine,
        cells: currentRecord,
      });
    }
  }

  return { records, skippedBlankRows };
}

/**
 * Stage S2 for CSV files: decodes bytes, detects delimiter, and parses records.
 */
export function readCsv(bytes: Uint8Array): CsvParseResult {
  const decoded = decodeCsvBytes(bytes);
  if (decoded.error || !decoded.text) {
    const msg = formatValidatorMessage('UPLOAD_ENCODING');
    return {
      ok: false,
      issue: {
        code: 'UPLOAD_ENCODING',
        severity: 'error',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      },
    };
  }

  const delimiter = detectDelimiter(decoded.text);
  const { records, skippedBlankRows } = parseCsvText(decoded.text, delimiter);

  return {
    ok: true,
    records,
    delimiter,
    encoding: decoded.encoding,
    skippedBlankRows,
  };
}

