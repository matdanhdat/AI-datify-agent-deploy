/**
 * rolling_volatility Operation (Prompt P6 Section 8.1)
 * Computes rolling annualized volatility (sample stdev of daily returns * sqrt(252)).
 * Reuses exact formula from metricSpec.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';
import { welfordStats } from '../../metrics/math';

export interface RollingVolatilityParams {
  window: 10 | 20 | 60;
}

export function rollingVolatility(frame: Frame, params: RollingVolatilityParams): Frame {
  const w = params.window;
  const close = frame.columns.close;
  if (!close) return frame;

  const outColName = `rolling_vol_${w}`;
  const out = new Float64Array(frame.n);

  for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
    const symbolRowIndices: number[] = [];
    for (let i = 0; i < frame.n; i++) {
      if (frame.symbol_idx[i] === sIdx) symbolRowIndices.push(i);
    }

    const m = symbolRowIndices.length;
    // Calculate daily returns first
    const dailyReturns = new Float64Array(m);
    dailyReturns[0] = NaN;
    for (let k = 1; k < m; k++) {
      const prev = close[symbolRowIndices[k - 1]];
      const curr = close[symbolRowIndices[k]];
      dailyReturns[k] = prev > 0 ? curr / prev - 1.0 : NaN;
    }

    for (let k = 0; k < m; k++) {
      const currIdx = symbolRowIndices[k];
      if (k < w) {
        out[currIdx] = NaN;
      } else {
        const windowSlice = dailyReturns.subarray(k - w + 1, k + 1);
        const stats = welfordStats(windowSlice);
        out[currIdx] = stats.stdev * Math.sqrt(252);
      }
    }
  }

  const newCols: Record<string, Float64Array> = {};
  for (const [k, v] of Object.entries(frame.columns)) {
    newCols[k] = new Float64Array(v);
  }
  newCols[outColName] = out;

  return {
    symbols: [...frame.symbols],
    symbol_idx: new Uint16Array(frame.symbol_idx),
    date_days: new Int32Array(frame.date_days),
    columns: newCols,
    n: frame.n,
  };
}

