/**
 * group_aggregate Operation (Prompt P6 Section 8.1)
 * Groups data by symbol, month, or weekday and computes aggregations (mean, sum, min, max, std, count).
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';
import { welfordStats } from '../../metrics/math';

export interface GroupAggregateParams {
  by: 'symbol' | 'month' | 'weekday';
  column: 'return' | 'volume' | 'range';
  agg: 'mean' | 'sum' | 'min' | 'max' | 'std' | 'count';
}

export interface GroupAggregateItem {
  group: string;
  count: number;
  value: number;
  formatted: string;
}

const WEEKDAY_NAMES = [
  'Chủ Nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];

export function groupAggregate(
  frame: Frame,
  params: GroupAggregateParams
): GroupAggregateItem[] {
  const { by, column, agg } = params;

  // Extract source values for column
  const values = new Float64Array(frame.n);
  if (column === 'volume') {
    values.set(frame.columns.volume);
  } else if (column === 'range') {
    for (let i = 0; i < frame.n; i++) {
      const h = frame.columns.high[i];
      const l = frame.columns.low[i];
      const c = frame.columns.close[i];
      values[i] = c > 0 ? (h - l) / c : 0;
    }
  } else {
    // Return column: pct change or daily return
    if (frame.columns.return) {
      values.set(frame.columns.return);
    } else {
      // Compute 1-day returns per symbol
      for (let sIdx = 0; sIdx < frame.symbols.length; sIdx++) {
        let prevClose = -1;
        for (let i = 0; i < frame.n; i++) {
          if (frame.symbol_idx[i] === sIdx) {
            const curr = frame.columns.close[i];
            values[i] = prevClose > 0 ? curr / prevClose - 1.0 : NaN;
            prevClose = curr;
          }
        }
      }
    }
  }

  // Group values
  const groups = new Map<string, number[]>();

  for (let i = 0; i < frame.n; i++) {
    const val = values[i];
    if (isNaN(val)) continue;

    let groupKey = '';
    const d = new Date(frame.date_days[i] * 86400000);

    if (by === 'symbol') {
      groupKey = frame.symbols[frame.symbol_idx[i]];
    } else if (by === 'month') {
      groupKey = `Tháng ${d.getUTCMonth() + 1}`;
    } else if (by === 'weekday') {
      groupKey = WEEKDAY_NAMES[d.getUTCDay()];
    }

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(val);
  }

  const results: GroupAggregateItem[] = [];

  for (const [grp, arr] of groups.entries()) {
    if (arr.length === 0) continue;

    let aggVal = 0;
    if (agg === 'count') {
      aggVal = arr.length;
    } else if (agg === 'sum') {
      aggVal = arr.reduce((acc, x) => acc + x, 0);
    } else if (agg === 'min') {
      aggVal = Math.min(...arr);
    } else if (agg === 'max') {
      aggVal = Math.max(...arr);
    } else if (agg === 'std') {
      aggVal = welfordStats(arr).stdev;
    } else {
      // mean
      aggVal = arr.reduce((acc, x) => acc + x, 0) / arr.length;
    }

    let formatted = '';
    if (agg === 'count') {
      formatted = aggVal.toLocaleString('vi-VN');
    } else if (column === 'volume') {
      formatted = Math.round(aggVal).toLocaleString('vi-VN');
    } else {
      formatted = `${(aggVal * 100).toFixed(2).replace('.', ',')}%`;
    }

    results.push({
      group: grp,
      count: arr.length,
      value: aggVal,
      formatted,
    });
  }

  // Sort groups naturally
  if (by === 'month') {
    results.sort((a, b) => {
      const mA = parseInt(a.group.replace('Tháng ', ''), 10);
      const mB = parseInt(b.group.replace('Tháng ', ''), 10);
      return mA - mB;
    });
  }

  return results;
}

