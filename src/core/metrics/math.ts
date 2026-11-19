/**
 * Numerically stable mathematical routines for Quantitative Analysis.
 * Implements Welford algorithm, compensated summation, Wilder smoothing, and Freedman-Diaconis histogram.
 * Pure TypeScript - zero external dependencies.
 */

export interface StatsResult {
  count: number;
  mean: number;
  variance: number;
  stdev: number;
}

/**
 * Computes mean and sample variance (n - 1) in a single pass using Welford's algorithm.
 * Guarantees numerical stability against catastrophic cancellation.
 */
export function welfordStats(values: ArrayLike<number>): StatsResult {
  let count = 0;
  let mean = 0;
  let m2 = 0;

  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (isNaN(x) || !isFinite(x)) continue;

    count++;
    const delta = x - mean;
    mean += delta / count;
    const delta2 = x - mean;
    m2 += delta * delta2;
  }

  if (count < 2) {
    return {
      count,
      mean: count === 1 ? mean : 0,
      variance: 0,
      stdev: 0,
    };
  }

  const variance = m2 / (count - 1);
  const stdev = Math.sqrt(Math.max(0, variance));

  return {
    count,
    mean,
    variance,
    stdev,
  };
}

/**
 * Computes simple daily returns: ret_t = price_t / price_{t-1} - 1.
 * Returns array of length n - 1.
 */
export function computeDailyReturns(prices: ArrayLike<number>): Float64Array {
  const n = prices.length;
  if (n < 2) return new Float64Array(0);

  const returns = new Float64Array(n - 1);
  for (let i = 1; i < n; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (prev <= 0 || isNaN(prev) || isNaN(curr)) {
      returns[i - 1] = NaN;
    } else {
      returns[i - 1] = curr / prev - 1.0;
    }
  }
  return returns;
}

/**
 * Computes median of a numerical array without mutating the input.
 */
export function computeMedian(values: ArrayLike<number>): number {
  const valid: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNaN(v) && isFinite(v)) {
      valid.push(v);
    }
  }

  const n = valid.length;
  if (n === 0) return 0;

  valid.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2.0 : valid[mid];
}

export interface DrawdownResult {
  maxDrawdown: number; // Always <= 0
  drawdownSeries: Float64Array; // dd_t = close_t / peak_t - 1
  peakIdx: number;
  troughIdx: number;
}

/**
 * Computes Maximum Drawdown: min(close_t / max(close_1..t) - 1).
 */
export function computeMaxDrawdown(prices: ArrayLike<number>): DrawdownResult {
  const n = prices.length;
  if (n < 2) {
    return {
      maxDrawdown: 0,
      drawdownSeries: new Float64Array(n),
      peakIdx: 0,
      troughIdx: 0,
    };
  }

  const drawdownSeries = new Float64Array(n);
  let runningMax = prices[0];
  let runningMaxIdx = 0;
  let maxDd = 0;
  let bestPeakIdx = 0;
  let bestTroughIdx = 0;

  drawdownSeries[0] = 0;

  for (let t = 1; t < n; t++) {
    const p = prices[t];
    if (isNaN(p) || p <= 0) {
      drawdownSeries[t] = 0;
      continue;
    }

    if (p > runningMax) {
      runningMax = p;
      runningMaxIdx = t;
      drawdownSeries[t] = 0;
    } else {
      const dd = p / runningMax - 1.0;
      drawdownSeries[t] = dd;
      if (dd < maxDd) {
        maxDd = dd;
        bestPeakIdx = runningMaxIdx;
        bestTroughIdx = t;
      }
    }
  }

  return {
    maxDrawdown: maxDd,
    drawdownSeries,
    peakIdx: bestPeakIdx,
    troughIdx: bestTroughIdx,
  };
}

/**
 * Computes Wilder's Smoothed RSI 14.
 * First 14 returns: simple average of gains and losses.
 * Subsequent returns: avg = (prevAvg * 13 + current) / 14.
 * RSI = 100 - (100 / (1 + RS)).
 * Conventions:
 *  - avgLoss === 0 && avgGain > 0 -> 100
 *  - avgGain === 0 && avgLoss === 0 -> 50
 */
export function computeWilderRsi(prices: ArrayLike<number>, period = 14): { rsiSeries: (number | null)[]; lastRsi: number | null } {
  const n = prices.length;
  const rsiSeries: (number | null)[] = new Array(n).fill(null);

  // Requires at least period + 1 prices (14 price changes)
  if (n <= period) {
    return { rsiSeries, lastRsi: null };
  }

  const gains = new Float64Array(n - 1);
  const losses = new Float64Array(n - 1);

  for (let i = 1; i < n; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains[i - 1] = diff;
      losses[i - 1] = 0;
    } else {
      gains[i - 1] = 0;
      losses[i - 1] = Math.abs(diff);
    }
  }

  // Initial average (first 14 changes: indices 0..13)
  let sumGain = 0;
  let sumLoss = 0;
  for (let i = 0; i < period; i++) {
    sumGain += gains[i];
    sumLoss += losses[i];
  }

  let avgGain = sumGain / period;
  let avgLoss = sumLoss / period;

  const calculateRsi = (gain: number, loss: number): number => {
    if (loss === 0) {
      return gain > 0 ? 100.0 : 50.0;
    }
    const rs = gain / loss;
    return 100.0 - 100.0 / (1.0 + rs);
  };

  // First RSI value corresponds to price index = period (14th change)
  rsiSeries[period] = calculateRsi(avgGain, avgLoss);

  // Subsequent smoothed values
  for (let i = period + 1; i < n; i++) {
    const changeIdx = i - 1;
    avgGain = (avgGain * (period - 1) + gains[changeIdx]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[changeIdx]) / period;
    rsiSeries[i] = calculateRsi(avgGain, avgLoss);
  }

  const lastRsi = rsiSeries[n - 1];
  return { rsiSeries, lastRsi };
}

/**
 * Computes Simple Moving Average (SMA) series for a given window.
 * Returns array of length n where points before window - 1 are null.
 */
export function computeSma(prices: ArrayLike<number>, window: number): (number | null)[] {
  const n = prices.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < window || window <= 0) return result;

  let sum = 0;
  for (let i = 0; i < window; i++) {
    sum += prices[i];
  }
  result[window - 1] = sum / window;

  for (let i = window; i < n; i++) {
    sum += prices[i] - prices[i - window];
    result[i] = sum / window;
  }

  return result;
}

/**
 * Computes Pearson sample correlation between two aligned series x and y.
 * Requires at least 2 points.
 */
export function computeCorrelation(x: ArrayLike<number>, y: ArrayLike<number>): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;

  const statsX = welfordStats(x);
  const statsY = welfordStats(y);

  if (statsX.stdev === 0 || statsY.stdev === 0) return null;

  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - statsX.mean) * (y[i] - statsY.mean);
  }
  cov = cov / (n - 1);

  const r = cov / (statsX.stdev * statsY.stdev);
  // Clamp to [-1, 1] against numerical overshoot
  return Math.max(-1.0, Math.min(1.0, r));
}

export interface HistogramResult {
  edges: number[];
  counts: number[];
}

/**
 * Computes Histogram bin edges and counts using Freedman-Diaconis rule.
 * Guarantees that 0 is exactly one of the bin edges to split positive and negative returns cleanly.
 */
export function computeFreedmanDiaconisHistogram(
  values: ArrayLike<number>,
  minBins = 10,
  maxBins = 40
): HistogramResult {
  const valid: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNaN(v) && isFinite(v)) valid.push(v);
  }

  const n = valid.length;
  if (n === 0) {
    return { edges: [-0.05, 0, 0.05], counts: [0, 0] };
  }

  valid.sort((a, b) => a - b);
  const minVal = valid[0];
  const maxVal = valid[n - 1];

  if (minVal === maxVal) {
    return {
      edges: [minVal - 0.01, 0, maxVal + 0.01],
      counts: [minVal < 0 ? n : 0, minVal >= 0 ? n : 0],
    };
  }

  const q25 = valid[Math.floor(n * 0.25)];
  const q75 = valid[Math.floor(n * 0.75)];
  const iqr = q75 - q25;

  let binWidth = iqr > 0 ? (2.0 * iqr) / Math.cbrt(n) : (maxVal - minVal) / 20;
  if (binWidth <= 0) binWidth = (maxVal - minVal) / 20;

  let numBins = Math.round((maxVal - minVal) / binWidth);
  numBins = Math.max(minBins, Math.min(maxBins, numBins));
  binWidth = (maxVal - minVal) / numBins;
  if (!isFinite(binWidth) || binWidth <= 0) {
    return {
      edges: [minVal, 0, maxVal].sort((a, b) => a - b),
      counts: [n, 0],
    };
  }

  // Align bins so that 0 is an exact edge
  let kMin = Math.floor(minVal / binWidth);
  let kMax = Math.ceil(maxVal / binWidth);

  // Safety ceiling: prevent runaway edge generation on extreme numeric ratios
  if (!isFinite(kMin) || !isFinite(kMax) || kMax - kMin > maxBins + 10) {
    kMin = 0;
    kMax = numBins;
    const edgesFallback: number[] = [];
    for (let k = 0; k <= numBins; k++) {
      edgesFallback.push(Math.round((minVal + k * binWidth) * 10000) / 10000);
    }
    if (!edgesFallback.some((e) => Math.abs(e) < 1e-6)) {
      edgesFallback.push(0);
      edgesFallback.sort((a, b) => a - b);
    }
    const countsFallback = new Array(edgesFallback.length - 1).fill(0);
    const binCount = countsFallback.length;
    for (let idx = 0; idx < n; idx++) {
      const v = valid[idx];
      let lo = 0;
      let hi = binCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (v < edgesFallback[mid + 1]) hi = mid;
        else lo = mid + 1;
      }
      if (v >= edgesFallback[lo] && (lo === binCount - 1 ? v <= edgesFallback[lo + 1] : v < edgesFallback[lo + 1])) {
        countsFallback[lo]++;
      }
    }
    return { edges: edgesFallback, counts: countsFallback };
  }

  const edges: number[] = [];
  for (let k = kMin; k <= kMax; k++) {
    // Round edge slightly to avoid floating precision noise
    const edge = Math.round(k * binWidth * 10000) / 10000;
    edges.push(edge);
  }

  // Ensure 0 is in the edges list
  if (!edges.some((e) => Math.abs(e) < 1e-6)) {
    edges.push(0);
    edges.sort((a, b) => a - b);
  }

  // Binary search binning: O(n log bins) instead of O(n * bins)
  const binCount = edges.length - 1;
  const counts = new Array(binCount).fill(0);
  for (let idx = 0; idx < n; idx++) {
    const v = valid[idx];
    let lo = 0;
    let hi = binCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v < edges[mid + 1]) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    if (lo === binCount - 1) {
      if (v >= edges[lo] && v <= edges[lo + 1]) {
        counts[lo]++;
      }
    } else if (v >= edges[lo] && v < edges[lo + 1]) {
      counts[lo]++;
    }
  }

  return { edges, counts };
}

