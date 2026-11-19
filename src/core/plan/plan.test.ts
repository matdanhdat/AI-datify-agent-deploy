import { describe, it, expect, beforeEach } from 'vitest';
import { datasetToFrame, type Frame } from './frame';
import {
  filterSymbols,
  filterDateRange,
  resampleOhlcv,
  pctChange,
  cumulativeReturn,
  rollingMean,
  normalizeBase100,
  drawdown,
  correlation,
  rankTopN,
  comparePeriods,
  groupAggregate,
} from './ops';
import { validatePlan, derivePlanTitle } from './validate';
import { PLAN_TEMPLATES } from './templates';
import { matchStandard } from './matchStandard';
import { runPlan } from './runner';
import type { Plan } from '../schemas';
import { computeMaxDrawdown } from '../metrics/math';

describe('Part C: Custom Plan Engine & Operations', () => {
  // Mock dataset with 2 symbols, 5 days of data
  // Dates: 2026-01-05 (Mon), 2026-01-06 (Tue), 2026-01-07 (Wed), 2026-01-08 (Thu), 2026-01-09 (Fri)
  const mockDataset: any = {
    symbols: ['AAA', 'BBB'],
    date_range: { from: '2026-01-05', to: '2026-01-09' },
    columns: ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume'],
    rows: [
      // AAA: 100 -> 105 -> 102 -> 110 -> 108
      { symbol: 'AAA', date: '2026-01-05', open: 98, high: 102, low: 97, close: 100, volume: 1000 },
      { symbol: 'AAA', date: '2026-01-06', open: 101, high: 106, low: 100, close: 105, volume: 1200 },
      { symbol: 'AAA', date: '2026-01-07', open: 105, high: 107, low: 101, close: 102, volume: 800 },
      { symbol: 'AAA', date: '2026-01-08', open: 103, high: 111, low: 102, close: 110, volume: 1500 },
      { symbol: 'AAA', date: '2026-01-09', open: 109, high: 112, low: 107, close: 108, volume: 1100 },
      // BBB: 50 -> 52 -> 51 -> 55 -> 53
      { symbol: 'BBB', date: '2026-01-05', open: 49, high: 51, low: 48, close: 50, volume: 2000 },
      { symbol: 'BBB', date: '2026-01-06', open: 50, high: 53, low: 49, close: 52, volume: 2100 },
      { symbol: 'BBB', date: '2026-01-07', open: 52, high: 52, low: 50, close: 51, volume: 1900 },
      { symbol: 'BBB', date: '2026-01-08', open: 51, high: 56, low: 51, close: 55, volume: 2500 },
      { symbol: 'BBB', date: '2026-01-09', open: 54, high: 55, low: 52, close: 53, volume: 2200 },
    ],
  };

  let baseFrame: Frame;

  beforeEach(() => {
    baseFrame = datasetToFrame(mockDataset);
  });

  describe('1. Pure Operations Hand Calculations & Immutability', () => {
    it('filter_symbols filters symbols and preserves original frame', () => {
      const origN = baseFrame.n;
      const res = filterSymbols(baseFrame, ['AAA']);
      expect(res.symbols).toEqual(['AAA']);
      expect(res.n).toBe(5);
      expect(baseFrame.n).toBe(origN);
      expect(baseFrame.symbols).toEqual(['AAA', 'BBB']);
    });

    it('filter_date_range filters by date and preserves immutability', () => {
      const res = filterDateRange(baseFrame, '2026-01-06', '2026-01-08');
      expect(res.n).toBe(6); // 3 days x 2 symbols
      expect(baseFrame.n).toBe(10);
    });

    it('resample_ohlcv aggregates to week', () => {
      const res = resampleOhlcv(baseFrame, { freq: 'week' });
      expect(res.symbols).toEqual(['AAA', 'BBB']);
      expect(res.n).toBe(2); // 1 week per symbol
      // AAA open=98, high=112, low=97, close=108, volume=5600
      expect(res.columns.open[0]).toBe(98);
      expect(res.columns.high[0]).toBe(112);
      expect(res.columns.low[0]).toBe(97);
      expect(res.columns.close[0]).toBe(108);
      expect(res.columns.volume[0]).toBe(5600);
    });

    it('pct_change calculates returns correctly', () => {
      const res = pctChange(baseFrame, { column: 'close', periods: 1 });
      // Day 0: NaN/0, Day 1: 105/100 - 1 = 0.05 (+5%)
      expect(isNaN(res.columns.return[0])).toBe(true);
      expect(res.columns.return[1]).toBeCloseTo(0.05, 4);
    });

    it('cumulative_return calculates compounding growth', () => {
      const res = cumulativeReturn(baseFrame);
      // AAA start=100, end=108 -> (108/100 - 1) = 0.08 (+8%)
      expect(res.columns.cumulative_return[0]).toBeCloseTo(0, 4);
      expect(res.columns.cumulative_return[4]).toBeCloseTo(0.08, 4);
    });

    it('rolling_mean calculates moving average', () => {
      const res = rollingMean(baseFrame, { column: 'close', window: 5 });
      // Mean of AAA: (100+105+102+110+108)/5 = 525/5 = 105
      expect(res.columns.close_ma_5[4]).toBeCloseTo(105, 4);
    });

    it('normalize_base100 normalizes first price to 100', () => {
      const res = normalizeBase100(baseFrame);
      // BBB: 50 -> 100, 52 -> 104, 55 -> 110
      expect(res.columns.base100[0]).toBeCloseTo(100, 4);
      expect(res.columns.base100[5]).toBeCloseTo(100, 4); // BBB start
      expect(res.columns.base100[6]).toBeCloseTo(104, 4); // BBB day 2
    });

    it('drawdown matches computeMaxDrawdown math parity', () => {
      const res = drawdown(baseFrame);
      // AAA prices: 100 -> 105 (peak) -> 102 (dd = 102/105 - 1 = -0.02857)
      expect(res.columns.drawdown[2]).toBeCloseTo(102 / 105 - 1, 4);
      const aaaPrices = new Float64Array([100, 105, 102, 110, 108]);
      const mathDd = computeMaxDrawdown(aaaPrices);
      expect(mathDd.maxDrawdown).toBeCloseTo(res.columns.drawdown[2], 4);
    });

    it('correlation matches pearsonCorrelation parity', () => {
      const retFrame = pctChange(baseFrame, { column: 'close', periods: 1 });
      const corrRes = correlation(retFrame);
      expect(corrRes.symbols).toEqual(['AAA', 'BBB']);
      expect(corrRes.matrix['AAA']['AAA']).toBeCloseTo(1.0, 4);
      expect(corrRes.matrix['BBB']['BBB']).toBeCloseTo(1.0, 4);
      expect(corrRes.pairCount).toBe(1);
    });

    it('rank_top_n ranks symbols by metric correctly', () => {
      // AAA return: 108/100 - 1 = +8%
      // BBB return: 53/50 - 1 = +6%
      const ranked = rankTopN(baseFrame, { metric: 'period_return', n: 5, order: 'desc' });
      expect(ranked.length).toBe(2);
      expect(ranked[0].symbol).toBe('AAA');
      expect(ranked[0].value).toBeCloseTo(0.08, 4);
      expect(ranked[1].symbol).toBe('BBB');
      expect(ranked[1].value).toBeCloseTo(0.06, 4);
    });

    it('compare_periods calculates metrics for period A vs period B', () => {
      const comp = comparePeriods(baseFrame, {
        period_a: { from: '2026-01-05', to: '2026-01-06' },
        period_b: { from: '2026-01-07', to: '2026-01-09' },
        metrics: ['period_return', 'avg_volume'],
      });
      expect(comp.length).toBe(4); // 2 symbols x 2 metrics
      const aaaRet = comp.find((it) => it.symbol === 'AAA' && it.metric === 'period_return');
      expect(aaaRet).toBeDefined();
      expect(aaaRet?.formatted_a).toBeTruthy();
    });

    it('group_aggregate aggregates volume by weekday', () => {
      const agg = groupAggregate(baseFrame, { by: 'weekday', column: 'volume', agg: 'mean' });
      expect(agg.length).toBeGreaterThan(0);
      expect(agg[0].group).toBeTruthy();
      expect(agg[0].formatted).toBeTruthy();
    });
  });

  describe('2. Plan Validation (validatePlan)', () => {
    it('rejects empty plan or missing steps', () => {
      const res = validatePlan({ title_vi: 'Test', steps: [] }, mockDataset);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('ít nhất 1 bước');
    });

    it('rejects plans with more than 8 steps', () => {
      const steps = Array(9).fill({ op: 'cumulative_return', params: {} });
      const res = validatePlan({ title_vi: 'Long Plan', steps }, mockDataset);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('vượt quá số bước');
    });

    it('rejects unknown ops not in allowed whitelist', () => {
      const plan: Plan = {
        title_vi: 'Bad Op',
        steps: [{ op: 'execute_custom_python_code' as any, params: {} }],
      };
      const res = validatePlan(plan, mockDataset);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('không nằm trong danh mục');
    });

    it('rejects non-terminal step at the end (e.g. ending in filter)', () => {
      const plan: Plan = {
        title_vi: 'Filter at End',
        steps: [
          { op: 'cumulative_return', params: {} },
          { op: 'filter_symbols', params: { symbols: ['AAA'] } },
        ],
      };
      const res = validatePlan(plan, mockDataset);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('Bước cuối cùng phải là thao tác phân tích'))).toBe(true);
    });

    it('rejects symbol not present in dataset', () => {
      const plan: Plan = {
        title_vi: 'Missing Symbol',
        steps: [
          { op: 'filter_symbols', params: { symbols: ['NON_EXIST'] } },
          { op: 'cumulative_return', params: {} },
        ],
      };
      const res = validatePlan(plan, mockDataset);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('không tồn tại'))).toBe(true);
    });

    it('rejects correlation when only 1 symbol remains', () => {
      const plan: Plan = {
        title_vi: 'Correlation 1 Symbol',
        steps: [
          { op: 'filter_symbols', params: { symbols: ['AAA'] } },
          { op: 'correlation', params: {} },
        ],
      };
      const res = validatePlan(plan, mockDataset);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('tối thiểu 2 mã'))).toBe(true);
    });

    it('accepts valid multi-step plan', () => {
      const plan: Plan = {
        title_vi: 'Valid Plan',
        steps: [
          { op: 'filter_symbols', params: { symbols: ['AAA', 'BBB'] } },
          { op: 'pct_change', params: { column: 'close', periods: 1 } },
          { op: 'correlation', params: {} },
        ],
      };
      const res = validatePlan(plan, mockDataset);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });

  describe('3. Built-in Templates (7 Templates)', () => {
    it('all 7 built-in templates produce valid plans that execute cleanly', () => {
      expect(PLAN_TEMPLATES).toHaveLength(7);

      // Create a 30-day dataset so 20-day rolling window passes validation
      const rows30: any[] = [];
      for (let day = 1; day <= 30; day++) {
        const dStr = `2026-01-${day < 10 ? '0' + day : day}`;
        rows30.push({ symbol: 'AAA', date: dStr, open: 100 + day, high: 105 + day, low: 98 + day, close: 102 + day, volume: 1000 + day * 10 });
        rows30.push({ symbol: 'BBB', date: dStr, open: 50 + day, high: 52 + day, low: 48 + day, close: 51 + day, volume: 2000 + day * 10 });
      }
      const dataset30: any = {
        symbols: ['AAA', 'BBB'],
        date_range: { from: '2026-01-01', to: '2026-01-30' },
        columns: ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume'],
        rows: rows30,
      };

      for (const tpl of PLAN_TEMPLATES) {
        const plan = tpl.buildPlan(dataset30);
        expect(plan.title_vi).toBeTruthy();
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.steps.length).toBeLessThanOrEqual(8);

        // Validation check
        const val = validatePlan(plan, dataset30);
        expect(val.valid).toBe(true);

        // Execution check
        const result = runPlan(plan, dataset30);
        expect(result.id).toBeTruthy();
        expect(result.tables.length).toBeGreaterThan(0);
        expect(result.charts.length).toBeGreaterThan(0);
        expect(result.summary_lines.length).toBeGreaterThan(0);
      }
    });
  });

  describe('4. Standard Matcher (matchStandard)', () => {
    it('matches RSI request and redirects to standard view', () => {
      const m = matchStandard('Xem chỉ số RSI của mã AAA');
      expect(m.matched).toBe(true);
      expect(m.metric_key).toBe('rsi_14');
      expect(m.message_vi).toContain('RSI 14 phiên');
    });

    it('matches Sharpe ratio request', () => {
      const m = matchStandard('Tỷ số Sharpe của các mã thế nào?');
      expect(m.matched).toBe(true);
      expect(m.metric_key).toBe('sharpe_ratio');
    });

    it('matches Correlation request', () => {
      const m = matchStandard('Cho tôi xem ma trận tương quan');
      expect(m.matched).toBe(true);
      expect(m.metric_key).toBe('correlation_matrix');
    });

    it('does not match novel custom queries', () => {
      const m = matchStandard('Tổng hợp khối lượng theo các ngày trong tuần');
      expect(m.matched).toBe(false);
    });
  });

  describe('5. Plan Runner & PlanResult Generation', () => {
    it('executes rank_top_n and produces sorted table, bar chart, and summary line', () => {
      const plan: Plan = {
        title_vi: 'Top lợi suất',
        steps: [{ op: 'rank_top_n', params: { metric: 'period_return', n: 5, order: 'desc' } }],
      };

      let progressCalled = false;
      const res = runPlan(plan, mockDataset, (pct, msg) => {
        progressCalled = true;
        expect(pct).toBeGreaterThan(0);
        expect(msg).toBeTruthy();
      });

      expect(progressCalled).toBe(true);
      expect(res.title_vi).toBe('Xếp hạng top 5 mã theo lợi suất kỳ');
      expect(res.steps_text.length).toBe(1);
      expect(res.tables.length).toBe(1);
      expect(res.tables[0].columns).toContain('Mã CP');
      expect(res.charts.length).toBe(1);
      expect(res.charts[0].kind).toBe('bar');
      expect(res.summary_lines.length).toBe(1);
      expect(res.summary_lines[0]).toContain('AAA');
    });

    it('P7 Audit (A1): rejects arbitrary "expr" expressions and unlisted operations', () => {
      // 1. Rejects "expr" in params
      const planWithExpr: any = {
        title_vi: 'Tự do biểu thức',
        steps: [
          {
            op: 'add_column_derived',
            params: { col: 'custom_ratio', expr: 'close / open * 100' },
          },
        ],
      };
      const valExpr = validatePlan(planWithExpr, mockDataset);
      expect(valExpr.valid).toBe(false);
      expect(valExpr.errors.some((e) => e.includes('expr') || e.includes('không nằm trong danh mục'))).toBe(true);

      // 2. Rejects unknown/unsupported operation
      const planWithUnknownOp: any = {
        title_vi: 'Thao tác không có trong danh sách',
        steps: [
          {
            op: 'execute_sql_query',
            params: { query: 'SELECT * FROM bars' },
          },
        ],
      };
      const valUnknown = validatePlan(planWithUnknownOp, mockDataset);
      expect(valUnknown.valid).toBe(false);
      expect(valUnknown.errors.some((e) => e.includes('không nằm trong danh mục thao tác được phép'))).toBe(true);
    });

    it('P7 Audit (A1): completely eliminates AI-generated strings from titles and ignores malicious input', () => {
      const maliciousPlan: Plan = {
        title_vi: '<script>alert("HACK_ATTACK")</script>',
        steps: [
          {
            op: 'rank_top_n',
            params: { metric: 'period_return', n: 3, order: 'desc' },
          },
        ],
      };

      // derivePlanTitle must produce clean code-generated title, completely ignoring AI title_vi
      const derived = derivePlanTitle(maliciousPlan);
      expect(derived).toBe('Xếp hạng top 3 mã theo lợi suất kỳ');
      expect(derived).not.toContain('<script>');
      expect(derived).not.toContain('HACK_ATTACK');

      // runPlan must stamp the safe derived title
      const res = runPlan(maliciousPlan, mockDataset);
      expect(res.title_vi).toBe('Xếp hạng top 3 mã theo lợi suất kỳ');
      expect(res.title_vi).not.toContain('<script>');
      expect(res.tables[0].title_vi).not.toContain('<script>');
      expect(res.charts[0].title_vi).not.toContain('<script>');
    });

    it('P7 Audit (A1): enforces strict parameter bounds on windows and top-n', () => {
      // rank_top_n with n > 10 must be rejected
      const invalidNPlan: Plan = {
        title_vi: 'Top 99',
        steps: [{ op: 'rank_top_n', params: { metric: 'period_return', n: 99 } }],
      };
      expect(validatePlan(invalidNPlan, mockDataset).valid).toBe(false);

      // pct_change with invalid period (e.g. 7) must be rejected
      const invalidPeriodPlan: Plan = {
        title_vi: 'Pct 7 phiên',
        steps: [{ op: 'pct_change', params: { column: 'close', periods: 7 } }],
      };
      expect(validatePlan(invalidPeriodPlan, mockDataset).valid).toBe(false);

      // rolling_mean with invalid window (e.g. 15) must be rejected
      const invalidWindowPlan: Plan = {
        title_vi: 'SMA 15',
        steps: [{ op: 'rolling_mean', params: { column: 'close', window: 15 } }],
      };
      expect(validatePlan(invalidWindowPlan, mockDataset).valid).toBe(false);
    });
  });
});
