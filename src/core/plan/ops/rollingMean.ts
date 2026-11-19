/**
 * rolling_mean Operation (Prompt P6 Section 8.1)
 * Computes rolling simple moving average for close or volume.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';

export interface RollingMeanParams {
  column: 'close' | 'volume';
  window: 5 | 10 | 20 | 50;
}

export function rollingMean(frame: Frame, params: RollingMeanParams): Frame {
  const colName = params.column;
  const w = params.window;
  const src = frame.columns[colName];
  if (!src) return frame;

  const outColName = `${colName}_ma_${w}`;
  const out = new Float64Array(frame.n);

  for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
    const symbolRowIndices: number[] = [];
    for (let i = 0; i < frame.n; i++) {
      if (frame.symbol_idx[i] === sIdx) symbolRowIndices.push(i);
    }

    let runningSum = 0;
    for (let k = 0; k < symbolRowIndices.length; k++) {
      const currIdx = symbolRowIndices[k];
      runningSum += src[currIdx];

      if (k >= w) {
        const dropIdx = symbolRowIndices[k - w];
        runningSum -= src[dropIdx];
      }

      if (k < w - 1) {
        out[currIdx] = NaN;
      } else {
        out[currIdx] = runningSum / w;
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

