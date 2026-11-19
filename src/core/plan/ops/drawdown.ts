/**
 * drawdown Operation (Prompt P6 Section 8.1)
 * Computes drawdown series relative to cumulative peak: close_t / max(close_1..t) - 1.
 * Reuses formula from metricSpec.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';
import { computeMaxDrawdown } from '../../metrics/math';

export function drawdown(frame: Frame): Frame {
  const close = frame.columns.close;
  if (!close) return frame;

  const out = new Float64Array(frame.n);

  for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
    const symbolRowIndices: number[] = [];
    for (let i = 0; i < frame.n; i++) {
      if (frame.symbol_idx[i] === sIdx) symbolRowIndices.push(i);
    }

    const m = symbolRowIndices.length;
    if (m === 0) continue;

    const prices = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      prices[k] = close[symbolRowIndices[k]];
    }

    const ddRes = computeMaxDrawdown(prices);
    for (let k = 0; k < m; k++) {
      out[symbolRowIndices[k]] = ddRes.drawdownSeries[k];
    }
  }

  const newCols: Record<string, Float64Array> = {};
  for (const [k, v] of Object.entries(frame.columns)) {
    newCols[k] = new Float64Array(v);
  }
  newCols['drawdown'] = out;

  return {
    symbols: [...frame.symbols],
    symbol_idx: new Uint16Array(frame.symbol_idx),
    date_days: new Int32Array(frame.date_days),
    columns: newCols,
    n: frame.n,
  };
}

