/**
 * Clean operation: drop_exact_duplicates
 * Drops exact duplicate rows (identical in symbol, date, open, high, low, close, volume), keeping the first.
 * Pure function: creates a new RawDataset without mutating input.
 */

import type { RawDataset } from '../../dataset';

export interface DropDuplicatesResult {
  dataset: RawDataset;
  droppedIndices: number[];
}

export function dropExactDuplicates(raw: RawDataset): DropDuplicatesResult {
  const count = raw.symbol_idx.length;
  const seen = new Set<string>();
  const keepIndices: number[] = [];
  const droppedIndices: number[] = [];

  for (let i = 0; i < count; i++) {
    const sym = raw.symbols[raw.symbol_idx[i]];
    const d = raw.date_days[i];
    const o = raw.open[i];
    const h = raw.high[i];
    const l = raw.low[i];
    const c = raw.close[i];
    const v = raw.volume[i];

    const key = `${sym}|${d}|${o}|${h}|${l}|${c}|${v}`;
    if (seen.has(key)) {
      droppedIndices.push(i);
    } else {
      seen.add(key);
      keepIndices.push(i);
    }
  }

  if (droppedIndices.length === 0) {
    return { dataset: raw, droppedIndices: [] };
  }

  const n = keepIndices.length;
  const newSymbolIdx = new Uint16Array(n);
  const newDateDays = new Int32Array(n);
  const newOpen = new Float64Array(n);
  const newHigh = new Float64Array(n);
  const newLow = new Float64Array(n);
  const newClose = new Float64Array(n);
  const newVolume = new Float64Array(n);
  const newSourceRow = new Int32Array(n);
  const newTradeValue = raw.trade_value ? new Float64Array(n) : undefined;
  const newSector = raw.sector ? new Array<string>(n) : undefined;
  const newExchange = raw.exchange ? new Array<string>(n) : undefined;

  for (let j = 0; j < n; j++) {
    const idx = keepIndices[j];
    newSymbolIdx[j] = raw.symbol_idx[idx];
    newDateDays[j] = raw.date_days[idx];
    newOpen[j] = raw.open[idx];
    newHigh[j] = raw.high[idx];
    newLow[j] = raw.low[idx];
    newClose[j] = raw.close[idx];
    newVolume[j] = raw.volume[idx];
    newSourceRow[j] = raw.source_row ? raw.source_row[idx] : idx + 1;

    if (newTradeValue && raw.trade_value) newTradeValue[j] = raw.trade_value[idx];
    if (newSector && raw.sector) newSector[j] = raw.sector[idx];
    if (newExchange && raw.exchange) newExchange[j] = raw.exchange[idx];
  }

  const newDataset: RawDataset = {
    n: newSymbolIdx.length,
    symbols: [...raw.symbols],
    symbol_idx: newSymbolIdx,
    date_days: newDateDays,
    open: newOpen,
    high: newHigh,
    low: newLow,
    close: newClose,
    volume: newVolume,
    source_row: newSourceRow,
    trade_value: newTradeValue,
    sector: newSector,
    exchange: newExchange,
  };

  return { dataset: newDataset, droppedIndices };
}
