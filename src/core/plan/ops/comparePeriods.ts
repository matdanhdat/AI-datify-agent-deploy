/**
 * compare_periods Operation (Prompt P6 Section 8.1)
 * Compares financial metrics across two distinct date intervals (Period A vs Period B).
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';
import { filterDateRange } from './filterDateRange';
import { welfordStats, computeMaxDrawdown } from '../../metrics/math';

export interface ComparePeriodsParams {
  period_a: { from: string; to: string };
  period_b: { from: string; to: string };
  metrics: Array<'period_return' | 'ann_vol' | 'avg_volume' | 'max_dd'>;
}

export interface PeriodComparisonItem {
  symbol: string;
  metric: string;
  val_a: number;
  val_b: number;
  delta: number;
  formatted_a: string;
  formatted_b: string;
  formatted_delta: string;
}

function calculateMetricForSymbol(
  subFrame: Frame,
  sName: string,
  metric: string
): number {
  const sIdx = subFrame.symbols.indexOf(sName);
  if (sIdx === -1) return 0;

  const indices: number[] = [];
  for (let i = 0; i < subFrame.n; i++) {
    if (subFrame.symbol_idx[i] === sIdx) indices.push(i);
  }

  if (indices.length < 2) return 0;

  const close = subFrame.columns.close;
  const volume = subFrame.columns.volume;

  if (metric === 'period_return') {
    const pStart = close[indices[0]];
    const pEnd = close[indices[indices.length - 1]];
    return pStart > 0 ? pEnd / pStart - 1.0 : 0;
  }
  if (metric === 'ann_vol') {
    const m = indices.length;
    const rets = new Float64Array(m - 1);
    for (let k = 1; k < m; k++) {
      rets[k - 1] = close[indices[k]] / close[indices[k - 1]] - 1.0;
    }
    return welfordStats(rets).stdev * Math.sqrt(252);
  }
  if (metric === 'max_dd') {
    const prices = new Float64Array(indices.length);
    for (let k = 0; k < indices.length; k++) prices[k] = close[indices[k]];
    return computeMaxDrawdown(prices).maxDrawdown;
  }
  if (metric === 'avg_volume') {
    let sumVol = 0;
    for (let k = 0; k < indices.length; k++) sumVol += volume[indices[k]];
    return indices.length > 0 ? sumVol / indices.length : 0;
  }

  return 0;
}

export function comparePeriods(
  frame: Frame,
  params: ComparePeriodsParams
): PeriodComparisonItem[] {
  const frameA = filterDateRange(frame, params.period_a);
  const frameB = filterDateRange(frame, params.period_b);

  const metricsToCompare =
    params.metrics && params.metrics.length > 0
      ? params.metrics
      : ['period_return', 'ann_vol', 'max_dd', 'avg_volume'];

  const results: PeriodComparisonItem[] = [];

  for (const sym of frame.symbols) {
    for (const m of metricsToCompare) {
      const valA = calculateMetricForSymbol(frameA, sym, m);
      const valB = calculateMetricForSymbol(frameB, sym, m);
      const delta = valB - valA;

      let formattedA = '';
      let formattedB = '';
      let formattedDelta = '';

      if (m === 'avg_volume') {
        formattedA = Math.round(valA).toLocaleString('vi-VN');
        formattedB = Math.round(valB).toLocaleString('vi-VN');
        formattedDelta = `${delta >= 0 ? '+' : ''}${Math.round(delta).toLocaleString('vi-VN')}`;
      } else {
        formattedA = `${(valA * 100).toFixed(2).replace('.', ',')}%`;
        formattedB = `${(valB * 100).toFixed(2).replace('.', ',')}%`;
        formattedDelta = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(2).replace('.', ',')}%`;
      }

      results.push({
        symbol: sym,
        metric: m,
        val_a: valA,
        val_b: valB,
        delta,
        formatted_a: formattedA,
        formatted_b: formattedB,
        formatted_delta: formattedDelta,
      });
    }
  }

  return results;
}

