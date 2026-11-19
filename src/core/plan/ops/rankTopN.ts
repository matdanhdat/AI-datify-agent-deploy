/**
 * rank_top_n Operation (Prompt P6 Section 8.1)
 * Computes a metric for each symbol and ranks top N.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';
import { welfordStats, computeMaxDrawdown } from '../../metrics/math';

export interface RankTopNParams {
  metric: 'period_return' | 'ann_vol' | 'max_dd' | 'avg_volume' | 'win_rate';
  n: number;
  order: 'desc' | 'asc';
}

export interface RankedItem {
  rank: number;
  symbol: string;
  metric: string;
  value: number;
  formatted: string;
}

export function rankTopN(frame: Frame, params: RankTopNParams): RankedItem[] {
  const metric = params.metric;
  const n = Math.max(1, Math.min(10, params.n));
  const order = params.order || 'desc';

  const results: Array<{ symbol: string; value: number }> = [];

  for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
    const sName = frame.symbols[sIdx];
    const indices: number[] = [];
    for (let i = 0; i < frame.n; i++) {
      if (frame.symbol_idx[i] === sIdx) indices.push(i);
    }

    if (indices.length < 2) continue;

    const close = frame.columns.close;
    const volume = frame.columns.volume;

    let val = 0;

    if (metric === 'period_return') {
      const pStart = close[indices[0]];
      const pEnd = close[indices[indices.length - 1]];
      val = pStart > 0 ? pEnd / pStart - 1.0 : 0;
    } else if (metric === 'ann_vol') {
      const m = indices.length;
      const rets = new Float64Array(m - 1);
      for (let k = 1; k < m; k++) {
        rets[k - 1] = close[indices[k]] / close[indices[k - 1]] - 1.0;
      }
      val = welfordStats(rets).stdev * Math.sqrt(252);
    } else if (metric === 'max_dd') {
      const prices = new Float64Array(indices.length);
      for (let k = 0; k < indices.length; k++) prices[k] = close[indices[k]];
      val = computeMaxDrawdown(prices).maxDrawdown;
    } else if (metric === 'avg_volume') {
      let sumVol = 0;
      for (let k = 0; k < indices.length; k++) sumVol += volume[indices[k]];
      val = indices.length > 0 ? sumVol / indices.length : 0;
    } else if (metric === 'win_rate') {
      let upDays = 0;
      let total = 0;
      for (let k = 1; k < indices.length; k++) {
        const ret = close[indices[k]] / close[indices[k - 1]] - 1.0;
        if (!isNaN(ret)) {
          total++;
          if (ret > 0) upDays++;
        }
      }
      val = total > 0 ? upDays / total : 0;
    }

    results.push({ symbol: sName, value: val });
  }

  results.sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));

  return results.slice(0, n).map((item, idx) => {
    let formatted = '';
    if (metric === 'period_return' || metric === 'ann_vol' || metric === 'max_dd' || metric === 'win_rate') {
      formatted = `${(item.value * 100).toFixed(2).replace('.', ',')}%`;
    } else {
      formatted = Math.round(item.value).toLocaleString('vi-VN');
    }

    return {
      rank: idx + 1,
      symbol: item.symbol,
      metric,
      value: item.value,
      formatted,
    };
  });
}

