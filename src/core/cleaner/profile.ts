/**
 * Pure data profiling module (Section 4).
 * Computes descriptive statistics, missing counts, duplicates, zero volumes,
 * date gaps, and outliers across dataset and per symbol.
 */

import type { RawDataset } from '../dataset';
import type { Profile, SymbolProfile } from '../schemas';
import { calculateMedian } from './outliers';
import { detectSymbolOutliers, type SymbolSeriesPoint } from './outliers';

/**
 * Converts integer days since Epoch (1970-01-01 UTC) to ISO string YYYY-MM-DD.
 */
function daysToIsoDate(days: number): string {
  const d = new Date(days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function calculateProfile(raw: RawDataset): Profile {
  const totalRows = raw.symbol_idx.length;
  const symbols = raw.symbols;

  let globalMinDays = Infinity;
  let globalMaxDays = -Infinity;
  let totalMissingCells = 0;
  let totalExactDups = 0;
  let totalOutliers = 0;

  // Track exact duplicate rows dataset-wide
  const seenExact = new Set<string>();
  for (let i = 0; i < totalRows; i++) {
    const s = symbols[raw.symbol_idx[i]];
    const d = raw.date_days[i];
    const o = raw.open[i];
    const h = raw.high[i];
    const l = raw.low[i];
    const c = raw.close[i];
    const v = raw.volume[i];
    const key = `${s}|${d}|${o}|${h}|${l}|${c}|${v}`;
    if (seenExact.has(key)) {
      totalExactDups++;
    } else {
      seenExact.add(key);
    }
  }

  const bySymbol: Record<string, SymbolProfile> = {};

  for (let sIdx = 0; sIdx < symbols.length; sIdx++) {
    const sym = symbols[sIdx];
    let symRows = 0;
    const uniqueDatesSet = new Set<number>();
    let symMinDays = Infinity;
    let symMaxDays = -Infinity;

    let missingOpen = 0;
    let missingHigh = 0;
    let missingLow = 0;
    let missingClose = 0;
    let missingVolume = 0;
    let zeroVolume = 0;

    const symSeenExact = new Set<string>();
    let symExactDups = 0;
    const symKeySeen = new Set<number>();
    let symKeyDups = 0;

    const validCloses: number[] = [];
    const validVolumes: number[] = [];
    const outlierPoints: SymbolSeriesPoint[] = [];

    for (let i = 0; i < totalRows; i++) {
      if (raw.symbol_idx[i] !== sIdx) continue;

      symRows++;
      const d = raw.date_days[i];
      if (d < symMinDays) symMinDays = d;
      if (d > symMaxDays) symMaxDays = d;
      if (d < globalMinDays) globalMinDays = d;
      if (d > globalMaxDays) globalMaxDays = d;

      const o = raw.open[i];
      const h = raw.high[i];
      const l = raw.low[i];
      const c = raw.close[i];
      const v = raw.volume[i];

      if (isNaN(o) || o === null) missingOpen++;
      if (isNaN(h) || h === null) missingHigh++;
      if (isNaN(l) || l === null) missingLow++;
      if (isNaN(c) || c === null) missingClose++;
      if (isNaN(v) || v === null) missingVolume++;
      else if (v === 0) zeroVolume++;

      // Check unique dates
      uniqueDatesSet.add(d);
      if (!isNaN(c) && c !== null) {
        validCloses.push(c);
      }
      if (!isNaN(v) && v !== null && v > 0) {
        validVolumes.push(v);
      }

      // Check exact dups for symbol
      const rowKey = `${d}|${o}|${h}|${l}|${c}|${v}`;
      if (symSeenExact.has(rowKey)) {
        symExactDups++;
      } else {
        symSeenExact.add(rowKey);
      }

      // Check duplicate keys
      if (symKeySeen.has(d)) {
        symKeyDups++;
      } else {
        symKeySeen.add(d);
      }

      if (!isNaN(c) && c > 0) {
        outlierPoints.push({ index: i, date_days: d, close: c });
      }
    }

    // Sort dates to calculate long gaps (> 10 calendar days)
    const sortedDates = Array.from(uniqueDatesSet).sort((a, b) => a - b);
    let longGaps = 0;
    for (let j = 1; j < sortedDates.length; j++) {
      if (sortedDates[j] - sortedDates[j - 1] > 10) {
        longGaps++;
      }
    }

    // Outlier calculation for symbol (using Section 5.3 MAD)
    outlierPoints.sort((a, b) => a.date_days - b.date_days);
    const symOutliers = detectSymbolOutliers(outlierPoints);
    totalOutliers += symOutliers.length;

    // Descriptive stats for close and volume
    const closeMin = validCloses.length > 0 ? Math.min(...validCloses) : 0;
    const closeMax = validCloses.length > 0 ? Math.max(...validCloses) : 0;
    const closeMedian = calculateMedian(validCloses);

    const volMin = validVolumes.length > 0 ? Math.min(...validVolumes) : 0;
    const volMax = validVolumes.length > 0 ? Math.max(...validVolumes) : 0;
    const volMedian = calculateMedian(validVolumes);

    const symTotalMissing =
      missingOpen + missingHigh + missingLow + missingClose + missingVolume;
    totalMissingCells += symTotalMissing;

    bySymbol[sym] = {
      symbol: sym,
      rows: symRows,
      unique_dates: uniqueDatesSet.size,
      date_from: symMinDays !== Infinity ? daysToIsoDate(symMinDays) : '',
      date_to: symMaxDays !== -Infinity ? daysToIsoDate(symMaxDays) : '',
      missing: {
        open: missingOpen,
        high: missingHigh,
        low: missingLow,
        close: missingClose,
        volume: missingVolume,
      },
      missing_rate: {
        open: symRows > 0 ? missingOpen / symRows : 0,
        high: symRows > 0 ? missingHigh / symRows : 0,
        low: symRows > 0 ? missingLow / symRows : 0,
        close: symRows > 0 ? missingClose / symRows : 0,
        volume: symRows > 0 ? missingVolume / symRows : 0,
      },
      exact_duplicates: symExactDups,
      duplicate_keys: symKeyDups,
      zero_volume_sessions: zeroVolume,
      long_gaps_count: longGaps,
      outliers_count: symOutliers.length,
      stats: {
        close_min: closeMin,
        close_median: closeMedian,
        close_max: closeMax,
        vol_min: volMin,
        vol_median: volMedian,
        vol_max: volMax,
      },
    };
  }

  return {
    total_rows: totalRows,
    total_symbols: symbols.length,
    date_from: globalMinDays !== Infinity ? daysToIsoDate(globalMinDays) : '',
    date_to: globalMaxDays !== -Infinity ? daysToIsoDate(globalMaxDays) : '',
    total_missing_cells: totalMissingCells,
    total_outliers: totalOutliers,
    total_exact_duplicates: totalExactDups,
    by_symbol: bySymbol,
  };
}

