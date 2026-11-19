/**
 * filter_date_range Operation (Prompt P6 Section 8.1)
 * Keeps only rows within the [from, to] date range.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';

export interface FilterDateRangeParams {
  from: string; // ISO date YYYY-MM-DD
  to: string; // ISO date YYYY-MM-DD
}

export function filterDateRange(
  frame: Frame,
  paramsOrFrom: FilterDateRangeParams | string,
  maybeTo?: string
): Frame {
  const fromStr = typeof paramsOrFrom === 'string' ? paramsOrFrom : paramsOrFrom.from;
  const toStr = typeof paramsOrFrom === 'string' ? maybeTo || paramsOrFrom : paramsOrFrom.to;

  const fromDays = Math.floor(Date.parse(`${fromStr}T00:00:00Z`) / 86400000);
  const toDays = Math.floor(Date.parse(`${toStr}T00:00:00Z`) / 86400000);

  const matchingIndices: number[] = [];
  for (let i = 0; i < frame.n; i++) {
    const d = frame.date_days[i];
    if (d >= fromDays && d <= toDays) {
      matchingIndices.push(i);
    }
  }

  const newN = matchingIndices.length;
  const newSymbolIdx = new Uint16Array(newN);
  const newDateDays = new Int32Array(newN);
  const newCols: Record<string, Float64Array> = {};

  for (const colName of Object.keys(frame.columns)) {
    newCols[colName] = new Float64Array(newN);
  }

  for (let j = 0; j < newN; j++) {
    const oldI = matchingIndices[j];
    newSymbolIdx[j] = frame.symbol_idx[oldI];
    newDateDays[j] = frame.date_days[oldI];
    for (const colName of Object.keys(frame.columns)) {
      newCols[colName][j] = frame.columns[colName][oldI];
    }
  }

  return {
    symbols: [...frame.symbols],
    symbol_idx: newSymbolIdx,
    date_days: newDateDays,
    columns: newCols,
    n: newN,
  };
}
