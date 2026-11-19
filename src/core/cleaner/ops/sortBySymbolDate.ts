/**
 * Clean operation: sort_by_symbol_date
 * Stable sort by symbol name then date_days ascending.
 * Always applied at the end of the cleaning pipeline.
 * Pure function: creates a new RawDataset without mutating input.
 */

import type { RawDataset } from '../../dataset';

export interface SortResult {
  dataset: RawDataset;
  outlierFlags?: Uint8Array;
}

export function sortBySymbolDate(
  raw: RawDataset,
  outlierFlags?: Uint8Array
): SortResult {
  const count = raw.symbol_idx.length;
  if (count <= 1) {
    return { dataset: raw, outlierFlags };
  }

  // Generate index array for stable sort
  const indices = new Array<number>(count);
  for (let i = 0; i < count; i++) indices[i] = i;

  indices.sort((a, b) => {
    // 1. Primary sort: symbol name
    const symA = raw.symbols[raw.symbol_idx[a]];
    const symB = raw.symbols[raw.symbol_idx[b]];
    const symComp = symA.localeCompare(symB);
    if (symComp !== 0) return symComp;

    // 2. Secondary sort: date_days
    const dateComp = raw.date_days[a] - raw.date_days[b];
    if (dateComp !== 0) return dateComp;

    // 3. Stable tie-break by source row or original index
    return a - b;
  });

  // Check if already sorted
  let alreadySorted = true;
  for (let i = 0; i < count; i++) {
    if (indices[i] !== i) {
      alreadySorted = false;
      break;
    }
  }

  if (alreadySorted) {
    return { dataset: raw, outlierFlags };
  }

  const newSymbolIdx = new Uint16Array(count);
  const newDateDays = new Int32Array(count);
  const newOpen = new Float64Array(count);
  const newHigh = new Float64Array(count);
  const newLow = new Float64Array(count);
  const newClose = new Float64Array(count);
  const newVolume = new Float64Array(count);
  const newSourceRow = new Int32Array(count);
  const newFlags = outlierFlags ? new Uint8Array(count) : undefined;
  const newTradeValue = raw.trade_value ? new Float64Array(count) : undefined;
  const newSector = raw.sector ? new Array<string>(count) : undefined;
  const newExchange = raw.exchange ? new Array<string>(count) : undefined;

  for (let j = 0; j < count; j++) {
    const idx = indices[j];
    newSymbolIdx[j] = raw.symbol_idx[idx];
    newDateDays[j] = raw.date_days[idx];
    newOpen[j] = raw.open[idx];
    newHigh[j] = raw.high[idx];
    newLow[j] = raw.low[idx];
    newClose[j] = raw.close[idx];
    newVolume[j] = raw.volume[idx];
    newSourceRow[j] = raw.source_row ? raw.source_row[idx] : idx + 1;

    if (newFlags && outlierFlags) newFlags[j] = outlierFlags[idx];
    if (newTradeValue && raw.trade_value) newTradeValue[j] = raw.trade_value[idx];
    if (newSector && raw.sector) newSector[j] = raw.sector[idx];
    if (newExchange && raw.exchange) newExchange[j] = raw.exchange[idx];
  }

  const newDataset: RawDataset = {
    n: count,
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

  return { dataset: newDataset, outlierFlags: newFlags };
}
