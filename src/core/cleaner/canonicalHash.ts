/**
 * Deterministic canonical SHA-256 hashing for clean datasets (Section 8).
 * Row by row in sorted (symbol, date) order.
 * Fixed column sequence with canonical numerical precision.
 * Guarantees identical hash regardless of the UI toggle sequence as long as the active decisions are identical.
 */

import type { RawDataset } from '../dataset';
import { sha256Hex } from '../hash';

export async function computeCanonicalCleanHash(dataset: RawDataset): Promise<string> {
  const count = dataset.symbol_idx.length;
  const lines: string[] = [
    '__PIXEL_CANONICAL_CLEAN_DATASET_V1__',
    `SYMBOLS:${dataset.symbols.join(',')}`,
    `ROWS:${count}`,
  ];

  for (let i = 0; i < count; i++) {
    const sym = dataset.symbols[dataset.symbol_idx[i]];
    const d = dataset.date_days[i];
    const o = dataset.open[i];
    const h = dataset.high[i];
    const l = dataset.low[i];
    const c = dataset.close[i];
    const v = dataset.volume[i];

    // Canonical format: sym|days|open|high|low|close|volume
    // Fixed 4 decimal places for prices, integer for volume
    const line = `${sym}|${d}|${o.toFixed(4)}|${h.toFixed(4)}|${l.toFixed(4)}|${c.toFixed(4)}|${Math.round(v)}`;
    lines.push(line);
  }

  const payload = lines.join('\n');
  return sha256Hex(payload);
}

