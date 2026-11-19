/**
 * pct_change Operation (Prompt P6 Section 8.1)
 * Computes percentage changes for a column over periods (1, 5, or 20 bars).
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';

export interface PctChangeParams {
  column: 'close' | 'volume';
  periods: 1 | 5 | 20;
}

export function pctChange(frame: Frame, params: PctChangeParams): Frame {
  const colName = params.column;
  const periods = params.periods;
  const src = frame.columns[colName];
  if (!src) return frame;

  const outColName = `${colName}_pct_${periods}`;
  const out = new Float64Array(frame.n);

  // Group by symbol to calculate within symbol boundaries
  for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
    const symbolRowIndices: number[] = [];
    for (let i = 0; i < frame.n; i++) {
      if (frame.symbol_idx[i] === sIdx) symbolRowIndices.push(i);
    }

    for (let k = 0; k < symbolRowIndices.length; k++) {
      const currIdx = symbolRowIndices[k];
      if (k < periods) {
        out[currIdx] = NaN;
      } else {
        const prevIdx = symbolRowIndices[k - periods];
        const prevVal = src[prevIdx];
        const currVal = src[currIdx];
        if (prevVal <= 0 || isNaN(prevVal) || isNaN(currVal)) {
          out[currIdx] = NaN;
        } else {
          out[currIdx] = currVal / prevVal - 1.0;
        }
      }
    }
  }

  const newCols: Record<string, Float64Array> = {};
  for (const [k, v] of Object.entries(frame.columns)) {
    newCols[k] = new Float64Array(v);
  }
  newCols[outColName] = out;
  newCols['return'] = out; // alias for group_aggregate

  return {
    symbols: [...frame.symbols],
    symbol_idx: new Uint16Array(frame.symbol_idx),
    date_days: new Int32Array(frame.date_days),
    columns: newCols,
    n: frame.n,
  };
}

