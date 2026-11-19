/**
 * Outlier detection using Median Absolute Deviation (MAD) of daily log-returns (Section 5.3).
 * Dual condition: z_t > OUTLIER_Z AND |r_t| > OUTLIER_MIN_ABS_RET (default 10%).
 * Skips symbols with fewer than 10 sessions.
 * Pure mathematical functions - zero side effects.
 */

import { CLEAN_CONFIG } from './cleanConfig';

/**
 * Calculates median of an array of numbers. Returns 0 for empty array.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates Median Absolute Deviation (MAD) of an array of numbers relative to their median.
 */
export function calculateMad(values: number[], median: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map((v) => Math.abs(v - median));
  return calculateMedian(deviations);
}

export interface SymbolSeriesPoint {
  index: number;
  date_days: number;
  close: number;
}

/**
 * Detects outlier rows for a single symbol's price series.
 * Requires inputs to be sorted by date_days and free of duplicate dates and missing prices.
 * Returns array of original row indices that are flagged as outliers.
 */
export function detectSymbolOutliers(
  points: SymbolSeriesPoint[],
  outlierZ: number = CLEAN_CONFIG.OUTLIER_Z,
  minAbsRet: number = CLEAN_CONFIG.OUTLIER_MIN_ABS_RET
): number[] {
  // Symbols with fewer than 10 sessions are skipped
  if (points.length < CLEAN_CONFIG.OUTLIER_MIN_SERIES_LEN) {
    return [];
  }

  // 1. Calculate daily log returns: r_t = ln(close_t / close_{t-1})
  const returns: number[] = [];
  const returnIndices: number[] = [];

  for (let t = 1; t < points.length; t++) {
    const prevClose = points[t - 1].close;
    const currClose = points[t].close;
    if (prevClose > 0 && currClose > 0) {
      const r = Math.log(currClose / prevClose);
      returns.push(r);
      returnIndices.push(points[t].index);
    }
  }

  if (returns.length === 0) return [];

  // 2. Compute median m and MAD of returns
  const median = calculateMedian(returns);
  const mad = calculateMad(returns, median);

  const flaggedOriginalIndices: number[] = [];

  // 3. Dual condition scoring
  for (let i = 0; i < returns.length; i++) {
    const r = returns[i];
    const absRet = Math.abs(r);

    if (mad > 0) {
      const z = Math.abs(r - median) / (1.4826 * mad);
      if (z > outlierZ && absRet > minAbsRet) {
        flaggedOriginalIndices.push(returnIndices[i]);
      }
    } else {
      // If MAD === 0 (all returns identical), use only |r_t| > minAbsRet
      if (absRet > minAbsRet) {
        flaggedOriginalIndices.push(returnIndices[i]);
      }
    }
  }

  return flaggedOriginalIndices;
}

