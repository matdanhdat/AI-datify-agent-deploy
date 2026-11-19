/**
 * filter_symbols Operation (Prompt P6 Section 8.1)
 * Keeps only rows matching the specified symbols.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';

export interface FilterSymbolsParams {
  symbols: string[];
}

export function filterSymbols(
  frame: Frame,
  paramsOrSymbols: FilterSymbolsParams | string[]
): Frame {
  const symArray = Array.isArray(paramsOrSymbols) ? paramsOrSymbols : paramsOrSymbols.symbols || [];
  const allowed = new Set(symArray);
  const matchingIndices: number[] = [];

  for (let i = 0; i < frame.n; i++) {
    const sym = frame.symbols[frame.symbol_idx[i]];
    if (allowed.has(sym)) {
      matchingIndices.push(i);
    }
  }

  const newN = matchingIndices.length;
  const newSymbols = frame.symbols.filter((s) => allowed.has(s));
  const symMap = new Map<number, number>();
  for (let oldIdx = 0; oldIdx < frame.symbols.length; oldIdx++) {
    const sName = frame.symbols[oldIdx];
    const newIdx = newSymbols.indexOf(sName);
    if (newIdx !== -1) symMap.set(oldIdx, newIdx);
  }

  const newSymbolIdx = new Uint16Array(newN);
  const newDateDays = new Int32Array(newN);
  const newCols: Record<string, Float64Array> = {};

  for (const colName of Object.keys(frame.columns)) {
    newCols[colName] = new Float64Array(newN);
  }

  for (let j = 0; j < newN; j++) {
    const oldI = matchingIndices[j];
    newSymbolIdx[j] = symMap.get(frame.symbol_idx[oldI]) ?? 0;
    newDateDays[j] = frame.date_days[oldI];
    for (const colName of Object.keys(frame.columns)) {
      newCols[colName][j] = frame.columns[colName][oldI];
    }
  }

  return {
    symbols: newSymbols,
    symbol_idx: newSymbolIdx,
    date_days: newDateDays,
    columns: newCols,
    n: newN,
  };
}
