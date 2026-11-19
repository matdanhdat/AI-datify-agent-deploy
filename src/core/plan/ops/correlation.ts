/**
 * correlation Operation (Prompt P6 Section 8.1)
 * Computes pairwise Pearson correlation matrix of daily returns across symbols.
 * Requires >= 2 symbols.
 * Reuses computeCorrelation from metrics/math.
 * Pure function - zero mutations.
 */

import type { Frame } from '../frame';
import { computeCorrelation } from '../../metrics/math';

export interface CorrelationResult {
  symbols: string[];
  matrix: Record<string, Record<string, number>>;
  pairCount: number;
}

export function correlation(frame: Frame): CorrelationResult {
  const symbols = frame.symbols;
  const matrix: Record<string, Record<string, number>> = {};

  for (const s of symbols) {
    matrix[s] = {};
    for (const s2 of symbols) {
      if (s === s2) matrix[s][s2] = 1.0;
      else matrix[s][s2] = 0.0;
    }
  }

  if (symbols.length < 2) {
    return { symbols, matrix, pairCount: 0 };
  }

  // Build map of dateDays -> close price per symbol
  const priceByDate = new Map<string, Map<number, number>>();
  for (const s of symbols) priceByDate.set(s, new Map<number, number>());

  for (let i = 0; i < frame.n; i++) {
    const sName = frame.symbols[frame.symbol_idx[i]];
    const dDays = frame.date_days[i];
    const c = frame.columns.close[i];
    priceByDate.get(sName)?.set(dDays, c);
  }

  let pairCount = 0;
  for (let i = 0; i < symbols.length; i++) {
    const sA = symbols[i];
    const mapA = priceByDate.get(sA)!;

    for (let j = i + 1; j < symbols.length; j++) {
      const sB = symbols[j];
      const mapB = priceByDate.get(sB)!;

      // Find common dates sorted
      const commonDates = Array.from(mapA.keys())
        .filter((d) => mapB.has(d))
        .sort((a, b) => a - b);

      if (commonDates.length >= 2) {
        const returnsA: number[] = [];
        const returnsB: number[] = [];

        for (let k = 1; k < commonDates.length; k++) {
          const dPrev = commonDates[k - 1];
          const dCurr = commonDates[k];

          const pA_prev = mapA.get(dPrev)!;
          const pA_curr = mapA.get(dCurr)!;
          const pB_prev = mapB.get(dPrev)!;
          const pB_curr = mapB.get(dCurr)!;

          if (pA_prev > 0 && pB_prev > 0) {
            returnsA.push(pA_curr / pA_prev - 1.0);
            returnsB.push(pB_curr / pB_prev - 1.0);
          }
        }

        const corrVal = computeCorrelation(returnsA, returnsB);
        const rounded = corrVal === null || isNaN(corrVal) ? 0 : Math.round(corrVal * 10000) / 10000;
        matrix[sA][sB] = rounded;
        matrix[sB][sA] = rounded;
        pairCount++;
      }
    }
  }

  return {
    symbols,
    matrix,
    pairCount,
  };
}
