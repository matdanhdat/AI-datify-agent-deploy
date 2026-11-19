/**
 * normalize_base100 Operation (Prompt P6 Section 8.1)
 * Normalizes close price series to base 100 at first observation: (close_t / close_0) * 100.
 * Reuses formula from metricSpec.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';

export function normalizeBase100(frame: Frame): Frame {
  const close = frame.columns.close;
  if (!close) return frame;

  const out = new Float64Array(frame.n);

  for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
    const symbolRowIndices: number[] = [];
    for (let i = 0; i < frame.n; i++) {
      if (frame.symbol_idx[i] === sIdx) symbolRowIndices.push(i);
    }

    if (symbolRowIndices.length === 0) continue;
    const baseClose = close[symbolRowIndices[0]];

    for (let k = 0; k < symbolRowIndices.length; k++) {
      const idx = symbolRowIndices[k];
      const c = close[idx];
      if (baseClose <= 0 || isNaN(baseClose) || isNaN(c)) {
        out[idx] = NaN;
      } else {
        out[idx] = (c / baseClose) * 100.0;
      }
    }
  }

  const newCols: Record<string, Float64Array> = {};
  for (const [k, v] of Object.entries(frame.columns)) {
    newCols[k] = new Float64Array(v);
  }
  newCols['base100'] = out;

  return {
    symbols: [...frame.symbols],
    symbol_idx: new Uint16Array(frame.symbol_idx),
    date_days: new Int32Array(frame.date_days),
    columns: newCols,
    n: frame.n,
  };
}

