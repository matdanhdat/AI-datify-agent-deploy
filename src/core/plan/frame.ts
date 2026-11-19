/**
 * Column-oriented Frame Data Structure for Custom Workflow Operations (Prompt P6 Section 8.1).
 * Pure TypeScript - zero external runtime dependencies.
 */

export interface Frame {
  symbols: string[];
  symbol_idx: Uint16Array;
  date_days: Int32Array;
  columns: Record<string, Float64Array>;
  n: number;
}

export function datasetToFrame(dataset: any): Frame {
  if (dataset.open && dataset.symbol_idx && dataset.date_days) {
    const n = dataset.n;
    const columns: Record<string, Float64Array> = {
      open: new Float64Array(dataset.open),
      high: new Float64Array(dataset.high),
      low: new Float64Array(dataset.low),
      close: new Float64Array(dataset.close),
      volume: new Float64Array(dataset.volume),
    };

    return {
      symbols: [...dataset.symbols],
      symbol_idx: new Uint16Array(dataset.symbol_idx),
      date_days: new Int32Array(dataset.date_days),
      columns,
      n,
    };
  }

  // Row-based conversion
  const rows: any[] = dataset.rows || [];
  const n = rows.length;
  const symbols = Array.isArray(dataset.symbols) && dataset.symbols.length > 0
    ? [...dataset.symbols]
    : Array.from(new Set(rows.map((r) => r.symbol)));

  const symbol_idx = new Uint16Array(n);
  const date_days = new Int32Array(n);
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const volume = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    let sIdx = symbols.indexOf(r.symbol);
    if (sIdx === -1) {
      sIdx = symbols.length;
      symbols.push(r.symbol);
    }
    symbol_idx[i] = sIdx;

    const dVal = typeof r.date === 'string' ? Math.floor(Date.parse(r.date) / 86400000) : (r.date_days || 0);
    date_days[i] = isNaN(dVal) ? 0 : dVal;

    open[i] = Number(r.open) || 0;
    high[i] = Number(r.high) || 0;
    low[i] = Number(r.low) || 0;
    close[i] = Number(r.close) || 0;
    volume[i] = Number(r.volume) || 0;
  }

  return {
    symbols,
    symbol_idx,
    date_days,
    columns: { open, high, low, close, volume },
    n,
  };
}

export function cloneFrame(frame: Frame): Frame {
  const newCols: Record<string, Float64Array> = {};
  for (const [k, arr] of Object.entries(frame.columns)) {
    newCols[k] = new Float64Array(arr);
  }

  return {
    symbols: [...frame.symbols],
    symbol_idx: new Uint16Array(frame.symbol_idx),
    date_days: new Int32Array(frame.date_days),
    columns: newCols,
    n: frame.n,
  };
}
