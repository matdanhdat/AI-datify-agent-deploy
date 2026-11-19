/**
 * Clean operation: flag_outliers
 * Flags rows with anomalous daily log-returns using MAD method without altering price data.
 * Produces an outlier_flags Uint8Array (1 = outlier, 0 = normal).
 */

import type { RawDataset } from '../../dataset';
import { detectSymbolOutliers, type SymbolSeriesPoint } from '../outliers';

export interface FlagOutliersResult {
  outlierFlags: Uint8Array;
  flaggedIndices: number[];
  flaggedSymbols: string[];
}

export function flagOutliers(raw: RawDataset): FlagOutliersResult {
  const count = raw.symbol_idx.length;
  const outlierFlags = new Uint8Array(count);
  const flaggedIndices: number[] = [];
  const flaggedSymbolSet = new Set<string>();

  // Process per symbol
  for (let sIdx = 0; sIdx < raw.symbols.length; sIdx++) {
    const symbol = raw.symbols[sIdx];
    const points: SymbolSeriesPoint[] = [];

    for (let i = 0; i < count; i++) {
      if (raw.symbol_idx[i] === sIdx && !isNaN(raw.close[i]) && raw.close[i] > 0) {
        points.push({
          index: i,
          date_days: raw.date_days[i],
          close: raw.close[i],
        });
      }
    }

    // Sort by date_days before return calculation
    points.sort((a, b) => a.date_days - b.date_days);

    const flagged = detectSymbolOutliers(points);
    for (const originalIdx of flagged) {
      outlierFlags[originalIdx] = 1;
      flaggedIndices.push(originalIdx);
      flaggedSymbolSet.add(symbol);
    }
  }

  return {
    outlierFlags,
    flaggedIndices: flaggedIndices.sort((a, b) => a - b),
    flaggedSymbols: Array.from(flaggedSymbolSet),
  };
}

