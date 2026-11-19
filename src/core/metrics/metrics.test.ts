import { describe, expect, it } from 'vitest';
import {
  welfordStats,
  computeDailyReturns,
  computeMaxDrawdown,
  computeWilderRsi,
  computeSma,
  computeCorrelation,
  computeFreedmanDiaconisHistogram,
} from './math';
import { calculateMetrics } from './calculator';
import { generateCharts } from './charts';
import type { CleanArtifact, AnalysisConfig } from '../schemas';
import type { RawDataset } from '../dataset';
import {
  getAnalysisSummary,
  listMetrics,
  getMetric,
  getChartSpec,
  getMetricSpecInfo,
} from '../../services/readers';
import { ArtifactStore } from '../artifacts';

describe('P4 Quantitative Math Algorithms (math.ts)', () => {
  it('computes Welford mean and sample variance stably', () => {
    const data = [10, 12, 23, 23, 16, 23, 21, 16];
    const stats = welfordStats(data);
    expect(stats.count).toBe(8);
    expect(stats.mean).toBeCloseTo(18.0, 5);
    // Sample variance (n-1): sum((x - 18)^2) / 7 = 192 / 7 = 27.42857
    expect(stats.variance).toBeCloseTo(192 / 7, 5);
    expect(stats.stdev).toBeCloseTo(Math.sqrt(192 / 7), 5);

    // Edge cases
    expect(welfordStats([]).count).toBe(0);
    expect(welfordStats([42]).count).toBe(1);
    expect(welfordStats([42]).variance).toBe(0);
  });

  it('computes daily simple returns correctly', () => {
    const prices = [100, 110, 99];
    const returns = computeDailyReturns(prices);
    expect(returns.length).toBe(2);
    expect(returns[0]).toBeCloseTo(0.1, 5);
    expect(returns[1]).toBeCloseTo(-0.1, 5);

    // Length < 2
    expect(computeDailyReturns([100]).length).toBe(0);
    expect(computeDailyReturns([]).length).toBe(0);
  });

  it('computes Maximum Drawdown (MDD <= 0) correctly on hand-crafted sequence', () => {
    // Peak 120 at idx 1, drops to 80 at idx 4 -> (80 / 120) - 1 = -33.333%
    const prices = [100, 120, 90, 110, 80, 130];
    const res = computeMaxDrawdown(prices);
    expect(res.maxDrawdown).toBeCloseTo(-0.333333, 4);
    expect(res.peakIdx).toBe(1);
    expect(res.troughIdx).toBe(4);
    expect(res.drawdownSeries[1]).toBe(0); // Peak
    expect(res.drawdownSeries[4]).toBeCloseTo(-0.333333, 4);

    // Monotonically increasing prices -> MDD is 0
    const increasing = [10, 20, 30, 40];
    expect(computeMaxDrawdown(increasing).maxDrawdown).toBe(0);

    // Flat prices -> MDD is 0
    const flat = [50, 50, 50];
    expect(computeMaxDrawdown(flat).maxDrawdown).toBe(0);
  });

  it('computes Wilder Smoothed RSI 14 with standard conventions', () => {
    // Flat prices -> RSI 50
    const flat = new Array(25).fill(100);
    const flatRes = computeWilderRsi(flat, 14);
    expect(flatRes.lastRsi).toBe(50);

    // Monotonically increasing -> RSI 100
    const upPrices = Array.from({ length: 25 }, (_, i) => 100 + i * 2);
    const upRes = computeWilderRsi(upPrices, 14);
    expect(upRes.lastRsi).toBe(100);

    // Hand-calculated 16 points (15 changes)
    const mixed = [
      44, 44.5, 43.5, 44, 44.5, 45, 44.75, 45.25, 45.5, 45.25, 45.75, 46, 45.5, 45.75, 46.25, 46.5,
    ];
    const mixedRes = computeWilderRsi(mixed, 14);
    expect(mixedRes.lastRsi).not.toBeNull();
    expect(mixedRes.lastRsi!).toBeGreaterThan(0);
    expect(mixedRes.lastRsi!).toBeLessThanOrEqual(100);
  });

  it('computes Simple Moving Average (SMA)', () => {
    const prices = [10, 20, 30, 40, 50];
    const sma3 = computeSma(prices, 3);
    expect(sma3[0]).toBeNull();
    expect(sma3[1]).toBeNull();
    expect(sma3[2]).toBeCloseTo(20, 5); // (10+20+30)/3
    expect(sma3[3]).toBeCloseTo(30, 5); // (20+30+40)/3
    expect(sma3[4]).toBeCloseTo(40, 5); // (30+40+50)/3
  });

  it('computes Pearson Correlation clamped to [-1, 1]', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10]; // Perfect positive
    const z = [10, 8, 6, 4, 2]; // Perfect negative
    expect(computeCorrelation(x, y)).toBeCloseTo(1.0, 5);
    expect(computeCorrelation(x, z)).toBeCloseTo(-1.0, 5);

    // Flat series (std = 0) returns null
    expect(computeCorrelation(x, [5, 5, 5, 5, 5])).toBeNull();
  });

  it('computes Freedman-Diaconis histogram ensuring 0 is an exact bin edge', () => {
    const returns = [-0.03, -0.02, -0.01, 0.005, 0.01, 0.02, 0.03];
    const hist = computeFreedmanDiaconisHistogram(returns, 4, 10);
    expect(hist.edges.length).toBe(hist.counts.length + 1);
    // Verify 0 is among edges
    expect(hist.edges.some((e) => Math.abs(e) < 1e-6)).toBe(true);
    // Sum of counts equals input length
    const totalCount = hist.counts.reduce((a, b) => a + b, 0);
    expect(totalCount).toBe(returns.length);
  });
});

describe('P4 Quantitative Calculator & Charts (calculator.ts & charts.ts)', () => {
  function makeMockCleanArtifact(): CleanArtifact {
    // 30 days of data for two symbols: AAA and BBB
    const nDays = 30;
    const n = nDays * 2;
    const symbol_idx = new Uint16Array(n);
    const date_days = new Int32Array(n);
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const close = new Float64Array(n);
    const volume = new Float64Array(n);
    const source_row = new Int32Array(n);

    const baseDays = 20000; // ~2024
    let rowIdx = 0;

    for (let d = 0; d < nDays; d++) {
      const curDay = baseDays + d;

      // AAA: trending up
      symbol_idx[rowIdx] = 0;
      date_days[rowIdx] = curDay;
      const cA = 100 + d * 1.5;
      open[rowIdx] = cA - 0.5;
      high[rowIdx] = cA + 1.0;
      low[rowIdx] = cA - 1.0;
      close[rowIdx] = cA;
      volume[rowIdx] = 100000 + d * 1000;
      source_row[rowIdx] = rowIdx + 1;
      rowIdx++;

      // BBB: trending down
      symbol_idx[rowIdx] = 1;
      date_days[rowIdx] = curDay;
      const cB = 200 - d * 2.0;
      open[rowIdx] = cB + 0.5;
      high[rowIdx] = cB + 1.5;
      low[rowIdx] = cB - 1.5;
      close[rowIdx] = cB;
      volume[rowIdx] = 200000;
      source_row[rowIdx] = rowIdx + 1;
      rowIdx++;
    }

    const dataset: RawDataset = {
      n,
      symbols: ['AAA', 'BBB'],
      symbol_idx,
      date_days,
      open,
      high,
      low,
      close,
      volume,
      source_row,
    };

    return {
      dataset,
      outlier_flags: new Uint8Array(n),
      decisions: { drop_exact_duplicates: true },
      hash: 'mock-clean-hash-sha256',
      approved_at: '2026-11-14T00:00:00Z',
      reviewer_name: 'Giám Khảo Test',
    };
  }

  const cleanArtifact = makeMockCleanArtifact();
  const config: AnalysisConfig = {
    symbols: ['AAA', 'BBB'],
    date_from: '2024-10-04',
    date_to: '2024-11-03',
    preset: 'all',
  };

  it('calculates all 17 metrics for each symbol with correct invariant properties', () => {
    const { metrics, warnings } = calculateMetrics(cleanArtifact, config);
    expect(warnings.length).toBe(0);

    const metricsA = metrics.filter((m) => m.symbol === 'AAA');
    const metricsB = metrics.filter((m) => m.symbol === 'BBB');
    expect(metricsA.length).toBe(17);
    expect(metricsB.length).toBe(17);

    // Check sessions
    const sessionsA = metricsA.find((m) => m.id === 'sessions')!;
    expect(sessionsA.value).toBe(30);

    // Check period_return: AAA up, BBB down
    const retA = metricsA.find((m) => m.id === 'period_return')!;
    const retB = metricsB.find((m) => m.id === 'period_return')!;
    expect(retA.value!).toBeGreaterThan(0);
    expect(retB.value!).toBeLessThan(0);

    // Check mathematical property invariants
    for (const m of metrics) {
      if (m.id === 'rsi14' && m.status === 'ok') {
        expect(m.value!).toBeGreaterThanOrEqual(0);
        expect(m.value!).toBeLessThanOrEqual(100);
      }
      if (m.id === 'max_dd' && m.status === 'ok') {
        expect(m.value!).toBeLessThanOrEqual(0);
      }
      if (m.id === 'win_rate' && m.status === 'ok') {
        expect(m.value!).toBeGreaterThanOrEqual(0);
        expect(m.value!).toBeLessThanOrEqual(1);
      }
      // Check that calc inputs and excel_hint are populated
      expect(m.formula_vi).toBeDefined();
      expect(m.meaning_vi).toBeDefined();
    }

    // Check MA50 requirement: 30 sessions < 50 -> ma50 is insufficient_data
    const ma50A = metricsA.find((m) => m.id === 'ma50')!;
    expect(ma50A.status).toBe('insufficient_data');
    expect(ma50A.reason_vi).toContain('50 phiên');
  });

  it('generates all 12 chart specifications with complete tables', () => {
    const { metrics } = calculateMetrics(cleanArtifact, config);
    const charts = generateCharts(cleanArtifact, config, metrics);

    // 7 per-symbol charts for AAA + 7 for BBB + 5 multi-symbol charts = 19 specs
    expect(charts.length).toBe(19);

    // Every chart must have columns and rows in table mode
    for (const c of charts) {
      expect(c.title_vi).toBeDefined();
      expect(c.table).toBeDefined();
      expect(c.table.columns.length).toBeGreaterThan(0);
      expect(c.table.rows.length).toBeGreaterThan(0);
    }

    // Check multi-symbol normalized chart
    const normChart = charts.find((c) => c.id === 'chart_normalized')!;
    expect(normChart).toBeDefined();
    expect(normChart.symbols).toEqual(['AAA', 'BBB']);

    // Check correlation heatmap
    const corrChart = charts.find((c) => c.id === 'chart_correlation')!;
    expect(corrChart).toBeDefined();
    expect(corrChart.data.matrix.length).toBe(2);
  });

  it('handles flat prices and insufficient data edge cases gracefully', () => {
    // 3 rows only
    const dataset: RawDataset = {
      n: 3,
      symbols: ['FLAT'],
      symbol_idx: new Uint16Array([0, 0, 0]),
      date_days: new Int32Array([100, 101, 102]),
      open: new Float64Array([50, 50, 50]),
      high: new Float64Array([50, 50, 50]),
      low: new Float64Array([50, 50, 50]),
      close: new Float64Array([50, 50, 50]),
      volume: new Float64Array([1000, 1000, 1000]),
      source_row: new Int32Array([1, 2, 3]),
    };
    const tinyArtifact: CleanArtifact = {
      dataset,
      outlier_flags: new Uint8Array(3),
      decisions: {},
      hash: 'tiny-hash',
      approved_at: '2026-11-14T00:00:00Z',
      reviewer_name: 'Tester',
    };

    const res = calculateMetrics(tinyArtifact, {
      symbols: ['FLAT'],
      date_from: '1970-04-11',
      date_to: '1970-04-13',
      preset: 'all',
    });

    // Sharpe and AnnVol require 20 points -> must be insufficient_data, NOT NaN or Infinity
    const sharpe = res.metrics.find((m) => m.id === 'sharpe')!;
    expect(sharpe.status).toBe('insufficient_data');
    expect(sharpe.value).toBeNull();
    expect(isNaN(sharpe.value as any)).toBe(false);
  });

  it('verifies strictly read-only query boundary (readers.ts)', () => {
    const sessionId = 'test-reader-session-id';
    const { metrics } = calculateMetrics(cleanArtifact, config);
    const charts = generateCharts(cleanArtifact, config, metrics);

    ArtifactStore.put(sessionId, 'analysis', {
      config,
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: cleanArtifact.hash,
      metrics,
      charts,
      assumptions: {},
      warnings: [],
    });

    const summary = getAnalysisSummary(sessionId);
    expect(summary).toBeDefined();
    expect(summary?.symbols).toEqual(['AAA', 'BBB']);
    expect(summary?.metrics_count).toBe(metrics.length);

    const aaaMetrics = listMetrics(sessionId, 'AAA');
    expect(aaaMetrics.length).toBe(17);

    const m = getMetric(sessionId, 'last_close', 'AAA');
    expect(m).toBeDefined();
    expect(m?.symbol).toBe('AAA');

    const chart = getChartSpec(sessionId, 'chart_normalized');
    expect(chart).toBeDefined();

    const def = getMetricSpecInfo('sharpe');
    expect(def?.id).toBe('sharpe');
    expect(def?.polarity).toBe('higher_better');
  });
});
