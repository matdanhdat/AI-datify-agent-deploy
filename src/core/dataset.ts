/**
 * Core Columnar Raw Dataset representation for Datify AI Agent.
 * High-performance typed arrays for in-memory numerical calculation and Web Worker transfer.
 */

export interface RawDataset {
  /** Total number of rows */
  n: number;
  /** Normalized unique symbol lookup table (uppercase, trimmed) */
  symbols: string[];
  /** Index into `symbols` for each row */
  symbol_idx: Uint16Array;
  /** Date stored as integer days since 1970-01-01 UTC (time part is stripped) */
  date_days: Int32Array;
  /** Open price array (NaN represents missing cell) */
  open: Float64Array;
  /** High price array (NaN represents missing cell) */
  high: Float64Array;
  /** Low price array (NaN represents missing cell) */
  low: Float64Array;
  /** Close price array (NaN represents missing cell) */
  close: Float64Array;
  /** Volume array (NaN represents missing cell) */
  volume: Float64Array;
  /** Optional: Trading value (VND) */
  trade_value?: Float64Array;
  /** Optional: Industry/Sector per row */
  sector?: string[];
  /** Optional: Exchange (HOSE, HNX, UPCOM) per row */
  exchange?: string[];
  /** Original 1-based source row number in user file */
  source_row: Int32Array;
}

/**
 * Extracts transferable ArrayBuffers from a RawDataset to transfer across Web Worker boundaries with zero-copy.
 */
export function getTransferableBuffers(dataset: RawDataset): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [
    dataset.symbol_idx.buffer as ArrayBuffer,
    dataset.date_days.buffer as ArrayBuffer,
    dataset.open.buffer as ArrayBuffer,
    dataset.high.buffer as ArrayBuffer,
    dataset.low.buffer as ArrayBuffer,
    dataset.close.buffer as ArrayBuffer,
    dataset.volume.buffer as ArrayBuffer,
    dataset.source_row.buffer as ArrayBuffer,
  ];

  if (dataset.trade_value) {
    buffers.push(dataset.trade_value.buffer as ArrayBuffer);
  }

  return buffers;
}

