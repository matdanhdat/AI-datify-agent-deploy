/**
 * Stage S5 and S6: Row-level logic validation and dataset-wide invariants.
 * Adheres strictly to Section 3.5, 3.6, and 3.7.
 * Pure TypeScript - zero external runtime dependencies.
 */
import type { ValidationIssue } from '../schemas';
import { formatValidatorMessage } from './messagesVi';
import type { ValidatorLimits } from './schemaSpec';

export interface RowData {
  sourceRow: number;
  dateDays: number | null; // null if invalid/empty
  rawDateStr?: string;
  symbol: string; // normalized
  rawSymbol: string;
  open: number; // NaN if missing
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeValue?: number;
  sector?: string;
  exchange?: string;
}

export interface RuleValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  validRows: RowData[];
  symbols: string[];
  symbolRowCounts: Record<string, number>;
  droppedSymbols: string[];
}

/**
 * Stage S5: Row-level consistency, positive price/volume, OHLC relations, and duplicate key checking.
 */
export function validateRowRules(
  rows: RowData[],
  sheetName?: string | null
): { issues: ValidationIssue[]; validRows: RowData[] } {
  const issues: ValidationIssue[] = [];
  const validRows: RowData[] = [];

  // Duplicate tracking: map key `date:symbol` -> list of rows
  const keyToRows = new Map<string, RowData[]>();
  let exactDuplicateCount = 0;

  for (const row of rows) {
    let rowHasError = false;

    // 1. Symbol validation
    if (!row.rawSymbol || row.rawSymbol.trim() === '') {
      const msg = formatValidatorMessage('DATA_EMPTY_KEY', {
        row: row.sourceRow,
        column: 'Mã',
      });
      issues.push({
        code: 'DATA_EMPTY_KEY',
        severity: 'error',
        sheet: sheetName,
        row: row.sourceRow,
        column_key: 'symbol',
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      });
      rowHasError = true;
    } else {
      // Symbol format regex: ^[A-Z0-9._-]{1,12}$
      if (!/^[A-Z0-9._-]{1,12}$/.test(row.symbol)) {
        const msg = formatValidatorMessage('DATA_BAD_SYMBOL', {
          row: row.sourceRow,
          symbol: row.rawSymbol,
        });
        issues.push({
          code: 'DATA_BAD_SYMBOL',
          severity: 'error',
          sheet: sheetName,
          row: row.sourceRow,
          column_key: 'symbol',
          value: row.rawSymbol,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
        rowHasError = true;
      }
    }

    // 2. Date validation
    if (row.dateDays === null) {
      if (!row.rawDateStr || row.rawDateStr.trim() === '') {
        const msg = formatValidatorMessage('DATA_EMPTY_KEY', {
          row: row.sourceRow,
          column: 'Ngày',
        });
        issues.push({
          code: 'DATA_EMPTY_KEY',
          severity: 'error',
          sheet: sheetName,
          row: row.sourceRow,
          column_key: 'date',
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
      } else {
        const msg = formatValidatorMessage('DATA_BAD_DATE', {
          row: row.sourceRow,
          column: 'Ngày',
          value: row.rawDateStr,
        });
        issues.push({
          code: 'DATA_BAD_DATE',
          severity: 'error',
          sheet: sheetName,
          row: row.sourceRow,
          column_key: 'date',
          value: row.rawDateStr,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
      }
      rowHasError = true;
    }

    // 3. Positive price validation (Open, High, Low, Close must be > 0 when present)
    const priceCols: Array<['open' | 'high' | 'low' | 'close', string, number]> = [
      ['open', 'Giá mở', row.open],
      ['high', 'Giá cao', row.high],
      ['low', 'Giá thấp', row.low],
      ['close', 'Giá đóng', row.close],
    ];

    for (const [key, label, val] of priceCols) {
      if (!isNaN(val) && val <= 0) {
        const msg = formatValidatorMessage('DATA_NONPOSITIVE_PRICE', {
          row: row.sourceRow,
          symbol: row.symbol || 'N/A',
          column: label,
          value: val,
        });
        issues.push({
          code: 'DATA_NONPOSITIVE_PRICE',
          severity: 'error',
          sheet: sheetName,
          row: row.sourceRow,
          column_key: key,
          value: val,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
        rowHasError = true;
      }
    }

    // 4. Volume validation (must be >= 0 when present)
    if (!isNaN(row.volume) && row.volume < 0) {
      const msg = formatValidatorMessage('DATA_NEGATIVE_VOLUME', {
        row: row.sourceRow,
        symbol: row.symbol || 'N/A',
        value: row.volume,
      });
      issues.push({
        code: 'DATA_NEGATIVE_VOLUME',
        severity: 'error',
        sheet: sheetName,
        row: row.sourceRow,
        column_key: 'volume',
        value: row.volume,
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      });
      rowHasError = true;
    }

    // 5. OHLC Inconsistency validation
    // Checked only when all four values are valid numbers
    if (
      !isNaN(row.open) &&
      !isNaN(row.high) &&
      !isNaN(row.low) &&
      !isNaN(row.close)
    ) {
      const maxOc = Math.max(row.open, row.close);
      const minOc = Math.min(row.open, row.close);

      // High must be >= max(open, close), Low must be <= min(open, close), High >= Low
      if (row.high < maxOc || row.low > minOc || row.high < row.low) {
        const msg = formatValidatorMessage('DATA_OHLC_INCONSISTENT', {
          row: row.sourceRow,
          symbol: row.symbol || 'N/A',
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
        });
        issues.push({
          code: 'DATA_OHLC_INCONSISTENT',
          severity: 'error',
          sheet: sheetName,
          row: row.sourceRow,
          column_key: 'high',
          value: `O:${row.open} H:${row.high} L:${row.low} C:${row.close}`,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
        rowHasError = true;
      }
    }

    // 6. Duplicate checking
    if (row.dateDays !== null && row.symbol) {
      const key = `${row.dateDays}:${row.symbol}`;
      const existing = keyToRows.get(key);
      if (!existing) {
        keyToRows.set(key, [row]);
      } else {
        // Compare with first occurrence
        const first = existing[0];
        const isExactDuplicate =
          (isNaN(first.open) ? isNaN(row.open) : first.open === row.open) &&
          (isNaN(first.high) ? isNaN(row.high) : first.high === row.high) &&
          (isNaN(first.low) ? isNaN(row.low) : first.low === row.low) &&
          (isNaN(first.close) ? isNaN(row.close) : first.close === row.close) &&
          (isNaN(first.volume) ? isNaN(row.volume) : first.volume === row.volume);

        if (isExactDuplicate) {
          exactDuplicateCount++;
        } else {
          // Conflicting duplicate!
          const dateStr = row.rawDateStr || new Date(row.dateDays * 86400000).toISOString().slice(0, 10);
          const msg = formatValidatorMessage('DATA_CONFLICT_DUPLICATE', {
            date: dateStr,
            symbol: row.symbol,
            row1: first.sourceRow,
            row2: row.sourceRow,
          });
          issues.push({
            code: 'DATA_CONFLICT_DUPLICATE',
            severity: 'error',
            sheet: sheetName,
            row: row.sourceRow,
            column_key: 'symbol',
            message_vi: msg.message_vi,
            fix_vi: msg.fix_vi,
          });
          rowHasError = true;
        }
        existing.push(row);
      }
    }

    if (!rowHasError) {
      validRows.push(row);
    }
  }

  // Exact duplicate aggregated warning
  if (exactDuplicateCount > 0) {
    const msg = formatValidatorMessage('DATA_EXACT_DUPLICATE', {
      count: exactDuplicateCount,
    });
    issues.push({
      code: 'DATA_EXACT_DUPLICATE',
      severity: 'warning',
      sheet: sheetName,
      count: exactDuplicateCount,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  return { issues, validRows };
}

/**
 * Stage S6: Dataset-wide invariants (limits, sessions per symbol, future dates, gaps, moves).
 */
export function validateDatasetWide(
  rows: RowData[],
  totalRowCount: number,
  limits: ValidatorLimits,
  sheetName?: string | null
): {
  issues: ValidationIssue[];
  filteredRows: RowData[];
  symbols: string[];
  symbolRowCounts: Record<string, number>;
  droppedSymbols: string[];
} {
  const issues: ValidationIssue[] = [];

  // 1. Check max rows
  if (totalRowCount > limits.max_rows) {
    const msg = formatValidatorMessage('DATA_TOO_MANY_ROWS', {
      rows: totalRowCount,
      max_rows: limits.max_rows,
    });
    issues.push({
      code: 'DATA_TOO_MANY_ROWS',
      severity: 'error',
      sheet: sheetName,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // Group valid rows by symbol
  const symbolMap = new Map<string, RowData[]>();
  for (const row of rows) {
    if (row.symbol) {
      if (!symbolMap.has(row.symbol)) {
        symbolMap.set(row.symbol, []);
      }
      symbolMap.get(row.symbol)!.push(row);
    }
  }

  const allSymbols = Array.from(symbolMap.keys());

  // 2. Check max symbols
  if (allSymbols.length > limits.max_symbols) {
    const msg = formatValidatorMessage('DATA_TOO_MANY_SYMBOLS', {
      count: allSymbols.length,
      max_symbols: limits.max_symbols,
    });
    issues.push({
      code: 'DATA_TOO_MANY_SYMBOLS',
      severity: 'error',
      sheet: sheetName,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // 3. Check min sessions per symbol
  const usableSymbols: string[] = [];
  const droppedSymbols: string[] = [];
  const symbolRowCounts: Record<string, number> = {};

  for (const symbol of allSymbols) {
    const symbolRows = symbolMap.get(symbol)!;
    // Count distinct valid sessions (unique dates where close price is not NaN)
    const validDates = new Set<number>();
    for (const r of symbolRows) {
      if (r.dateDays !== null && !isNaN(r.close)) {
        validDates.add(r.dateDays);
      }
    }
    const sessionCount = validDates.size;
    symbolRowCounts[symbol] = symbolRows.length;

    if (sessionCount < limits.min_sessions) {
      if (limits.strict_mode) {
        const msg = formatValidatorMessage('DATA_SYMBOL_TOO_FEW_SESSIONS', {
          symbol,
          sessions: sessionCount,
          min_sessions: limits.min_sessions,
        });
        issues.push({
          code: 'DATA_SYMBOL_TOO_FEW_SESSIONS',
          severity: 'error',
          sheet: sheetName,
          column_key: 'symbol',
          value: symbol,
          message_vi: msg.message_vi,
          fix_vi: msg.fix_vi,
        });
      } else {
        droppedSymbols.push(symbol);
      }
    } else {
      usableSymbols.push(symbol);
    }
  }

  if (!limits.strict_mode) {
    if (droppedSymbols.length > 0) {
      const msg = formatValidatorMessage('DATA_SYMBOLS_DROPPED', {
        count: droppedSymbols.length,
        min_sessions: limits.min_sessions,
        symbols: droppedSymbols.join(', '),
      });
      issues.push({
        code: 'DATA_SYMBOLS_DROPPED',
        severity: 'warning',
        sheet: sheetName,
        count: droppedSymbols.length,
        examples: droppedSymbols,
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      });
    }

    if (usableSymbols.length === 0) {
      const msg = formatValidatorMessage('DATA_NO_USABLE_SYMBOL', {
        min_sessions: limits.min_sessions,
      });
      issues.push({
        code: 'DATA_NO_USABLE_SYMBOL',
        severity: 'error',
        sheet: sheetName,
        message_vi: msg.message_vi,
        fix_vi: msg.fix_vi,
      });
    }
  }

  // Filter rows belonging only to usable symbols
  const usableSet = new Set(limits.strict_mode ? allSymbols : usableSymbols);
  const filteredRows = rows.filter((r) => usableSet.has(r.symbol));

  // 4. Future date warning (Vietnam timezone UTC+7)
  const nowUtc7Days = Math.floor((Date.now() + 7 * 3600000) / 86400000);
  const futureRows = filteredRows.filter((r) => r.dateDays !== null && r.dateDays > nowUtc7Days);
  if (futureRows.length > 0) {
    const todayVi = new Date((nowUtc7Days * 86400000)).toLocaleDateString('vi-VN');
    const firstFuture = futureRows[0];
    const dateStr = firstFuture.rawDateStr || new Date(firstFuture.dateDays! * 86400000).toISOString().slice(0, 10);
    const msg = formatValidatorMessage('DATA_FUTURE_DATE', {
      count: futureRows.length,
      today_vi: todayVi,
      row: firstFuture.sourceRow,
      date: dateStr,
    });
    issues.push({
      code: 'DATA_FUTURE_DATE',
      severity: 'warning',
      sheet: sheetName,
      count: futureRows.length,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  // 5. Large price moves (> 20%) & Long calendar gaps (> 10 days) per symbol
  let largeMoveCount = 0;
  const largeMoveExamples: string[] = [];
  let longGapCount = 0;
  const longGapExamples: string[] = [];

  for (const symbol of usableSymbols) {
    const symbolRows = filteredRows
      .filter((r) => r.symbol === symbol && r.dateDays !== null)
      .sort((a, b) => a.dateDays! - b.dateDays!);

    for (let i = 1; i < symbolRows.length; i++) {
      const prev = symbolRows[i - 1];
      const curr = symbolRows[i];

      // Gap check (> 10 calendar days)
      const dayDiff = curr.dateDays! - prev.dateDays!;
      if (dayDiff > 10) {
        longGapCount++;
        if (longGapExamples.length < 3) {
          const d1 = new Date(prev.dateDays! * 86400000).toLocaleDateString('vi-VN');
          const d2 = new Date(curr.dateDays! * 86400000).toLocaleDateString('vi-VN');
          longGapExamples.push(`${symbol}: ${d1} -> ${d2} (${dayDiff} ngày)`);
        }
      }

      // Large move check (> 20% on close price)
      if (!isNaN(prev.close) && !isNaN(curr.close) && prev.close > 0) {
        const movePct = Math.abs(curr.close - prev.close) / prev.close;
        if (movePct > 0.20) {
          largeMoveCount++;
          if (largeMoveExamples.length < 3) {
            const dateStr = curr.rawDateStr || new Date(curr.dateDays! * 86400000).toLocaleDateString('vi-VN');
            largeMoveExamples.push(`${symbol} ngày ${dateStr} (${(movePct * 100).toFixed(1)}%)`);
          }
        }
      }
    }
  }

  if (largeMoveCount > 0) {
    const msg = formatValidatorMessage('DATA_LARGE_MOVE', {
      count: largeMoveCount,
      symbol: largeMoveExamples[0]?.split(' ')[0] || '',
      date: '',
      percent: '>20',
    });
    issues.push({
      code: 'DATA_LARGE_MOVE',
      severity: 'warning',
      sheet: sheetName,
      count: largeMoveCount,
      examples: largeMoveExamples,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  if (longGapCount > 0) {
    const msg = formatValidatorMessage('DATA_LONG_GAP', {
      count: longGapCount,
      symbol: '',
      date1: '',
      date2: '',
    });
    issues.push({
      code: 'DATA_LONG_GAP',
      severity: 'warning',
      sheet: sheetName,
      count: longGapCount,
      examples: longGapExamples,
      message_vi: msg.message_vi,
      fix_vi: msg.fix_vi,
    });
  }

  return {
    issues,
    filteredRows,
    symbols: usableSymbols,
    symbolRowCounts,
    droppedSymbols,
  };
}

