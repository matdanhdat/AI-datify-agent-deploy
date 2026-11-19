/**
 * resample_ohlcv Operation (Prompt P6 Section 8.1)
 * Resamples OHLCV bars by week or month:
 * open = first, high = max, low = min, close = last, volume = sum.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';

export interface ResampleOhlcvParams {
  freq: 'week' | 'month';
}

function getPeriodKey(dateDays: number, freq: 'week' | 'month'): string {
  const d = new Date(dateDays * 86400000);
  if (freq === 'month') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  // Week key: determine Monday-based week
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
  const mondayDays = dateDays - dayOfWeek;
  const mondayDate = new Date(mondayDays * 86400000);
  return `${mondayDate.getUTCFullYear()}-W${Math.floor(mondayDays / 7)}`;
}

export function resampleOhlcv(frame: Frame, params: ResampleOhlcvParams): Frame {
  interface BarBucket {
    symbolIdx: number;
    lastDateDays: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  const buckets = new Map<string, BarBucket>();

  for (let i = 0; i < frame.n; i++) {
    const sIdx = frame.symbol_idx[i];
    const dDays = frame.date_days[i];
    const pKey = `${sIdx}:${getPeriodKey(dDays, params.freq)}`;

    const o = frame.columns.open[i];
    const h = frame.columns.high[i];
    const l = frame.columns.low[i];
    const c = frame.columns.close[i];
    const v = frame.columns.volume[i];

    if (!buckets.has(pKey)) {
      buckets.set(pKey, {
        symbolIdx: sIdx,
        lastDateDays: dDays,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      });
    } else {
      const b = buckets.get(pKey)!;
      b.lastDateDays = dDays;
      b.high = Math.max(b.high, h);
      b.low = Math.min(b.low, l);
      b.close = c;
      b.volume += v;
    }
  }

  const newN = buckets.size;
  const newSymbolIdx = new Uint16Array(newN);
  const newDateDays = new Int32Array(newN);
  const newOpen = new Float64Array(newN);
  const newHigh = new Float64Array(newN);
  const newLow = new Float64Array(newN);
  const newClose = new Float64Array(newN);
  const newVolume = new Float64Array(newN);

  let idx = 0;
  for (const b of buckets.values()) {
    newSymbolIdx[idx] = b.symbolIdx;
    newDateDays[idx] = b.lastDateDays;
    newOpen[idx] = b.open;
    newHigh[idx] = b.high;
    newLow[idx] = b.low;
    newClose[idx] = b.close;
    newVolume[idx] = b.volume;
    idx++;
  }

  return {
    symbols: [...frame.symbols],
    symbol_idx: newSymbolIdx,
    date_days: newDateDays,
    columns: {
      open: newOpen,
      high: newHigh,
      low: newLow,
      close: newClose,
      volume: newVolume,
    },
    n: newN,
  };
}

