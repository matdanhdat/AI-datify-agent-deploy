import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateBytes } from '../validator';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';
import { analyzeBusinessTable } from './businessAnalyzer';
import { createSession } from '../../services/sessionService';
import { sessionStore } from '../../services/sessionStore';
import { ArtifactStore } from '../artifacts';
import { getProfileAndProposals, approveCleanGate } from '../../services/cleanService';
import { runAnalysis, getAvailableDatasetMeta } from '../../services/analysisService';
import { runInWorker, WORKER_TIMEOUT_MESSAGE_VI } from '../../workers/workerRunner';
import { ERROR_CODES } from '../errors';
import type { BusinessTable } from '../businessTable';

function buildSyntheticBusinessTable(rowCount: number): BusinessTable {
  const channels = ['Website', 'Sàn TMĐT', 'Cửa hàng'];
  const regions = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
  const products = ['Sơ mi', 'Quần jeans', 'Áo thun', 'Túi tote'];
  const months = ['2026-07', '2026-08', '2026-09', '2026-10'];

  const ids: string[] = new Array(rowCount);
  const timeStrings: string[] = new Array(rowCount);
  const timeVals = new Int32Array(rowCount);
  const chCodes = new Uint16Array(rowCount);
  const rgCodes = new Uint16Array(rowCount);
  const prCodes = new Uint16Array(rowCount);
  const orders = new Float64Array(rowCount);
  const revenue = new Float64Array(rowCount);
  const cogs = new Float64Array(rowCount);
  const profit = new Float64Array(rowCount);
  const sourceRow = new Int32Array(rowCount);

  for (let i = 0; i < rowCount; i++) {
    ids[i] = `DS-${String(i + 1).padStart(5, '0')}`;
    const m = months[i % months.length];
    timeStrings[i] = m;
    const [yr, mo] = m.split('-').map(Number);
    timeVals[i] = (yr - 1970) * 12 + (mo - 1);
    chCodes[i] = i % channels.length;
    rgCodes[i] = (i * 3) % regions.length;
    prCodes[i] = (i * 7) % products.length;
    const o = 10 + (i % 90);
    const rev = o * (250000 + (i % 5) * 25000);
    const cost = Math.round(rev * 0.54);
    orders[i] = o;
    revenue[i] = rev;
    cogs[i] = cost;
    profit[i] = rev - cost;
    sourceRow[i] = i + 2;
  }

  return {
    kind: 'business',
    n: rowCount,
    source_row: sourceRow,
    columns: [
      { key: 'ma_dong', label: 'Mã dòng', role: 'id', values: ids },
      { key: 'thang', label: 'Tháng', role: 'time', granularity: 'month', values: timeVals, raw_labels: timeStrings },
      { key: 'kenh', label: 'Kênh bán', role: 'dimension', categories: channels, codes: chCodes },
      { key: 'khu_vuc', label: 'Khu vực', role: 'dimension', categories: regions, codes: rgCodes },
      { key: 'san_pham', label: 'Sản phẩm', role: 'dimension', categories: products, codes: prCodes },
      { key: 'so_don', label: 'Số đơn', role: 'measure', values: orders },
      { key: 'doanh_thu', label: 'Doanh thu', role: 'measure', values: revenue, unit: 'VND' },
      { key: 'gia_von', label: 'Giá vốn', role: 'measure', values: cogs, unit: 'VND' },
      { key: 'loi_nhuan', label: 'Lợi nhuận gộp', role: 'measure', values: profit, unit: 'VND' },
    ],
  };
}

describe('M3-A: Business Analysis Engine, Exact A6 Answer Key, Watchdog & Performance Budgets', () => {
  const retailCsvPath = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
  const retailBytes = new Uint8Array(fs.readFileSync(retailCsvPath));

  beforeEach(() => {
    sessionStore.clearAll();
    ArtifactStore.clearAll();
  });

  it('1. Hand-calculated 4-row mini dataset matches every formula exactly', () => {
    const table: BusinessTable = {
      kind: 'business',
      n: 4,
      source_row: new Int32Array([2, 3, 4, 5]),
      columns: [
        { key: 'id', label: 'Mã', role: 'id', values: ['A1', 'A2', 'A3', 'A4'] },
        {
          key: 'month',
          label: 'Tháng',
          role: 'time',
          granularity: 'month',
          values: new Int32Array([672, 672, 673, 673]),
          raw_labels: ['2026-01', '2026-01', '2026-02', '2026-02'],
        },
        { key: 'channel', label: 'Kênh bán', role: 'dimension', categories: ['Web', 'Shop'], codes: new Uint16Array([0, 1, 0, 1]) },
        { key: 'region', label: 'Khu vực', role: 'dimension', categories: ['Bắc', 'Nam'], codes: new Uint16Array([0, 1, 0, 1]) },
        { key: 'product', label: 'Sản phẩm', role: 'dimension', categories: ['Áo', 'Quần'], codes: new Uint16Array([0, 1, 0, 1]) },
        { key: 'orders', label: 'Số đơn', role: 'measure', values: new Float64Array([10, 20, 30, 40]) },
        { key: 'revenue', label: 'Doanh thu', role: 'measure', values: new Float64Array([1000, 2000, 3000, 4000]) },
        { key: 'cogs', label: 'Giá vốn', role: 'measure', values: new Float64Array([600, 1000, 1500, 2400]) },
        { key: 'profit', label: 'Lợi nhuận gộp', role: 'measure', values: new Float64Array([400, 1000, 1500, 1600]) },
      ],
    };

    const out = analyzeBusinessTable(table);
    expect(out.summary.totals.orders).toBe(100);
    expect(out.summary.totals.revenue).toBe(10000);
    expect(out.summary.totals.cogs).toBe(5500);
    expect(out.summary.totals.profit).toBe(4500);
    expect(out.summary.totals.gross_margin_pct).toBeCloseTo(45.0, 6);
    expect(out.summary.totals.aov).toBeCloseTo(100.0, 6);

    // MoM: 2026-01 = 3000, 2026-02 = 7000 -> delta = +4000, pct = +133.3333%
    expect(out.summary.by_month[0].key).toBe('2026-01');
    expect(out.summary.by_month[0].revenue).toBe(3000);
    expect(out.summary.by_month[1].key).toBe('2026-02');
    expect(out.summary.by_month[1].revenue).toBe(7000);
    expect(out.summary.by_month[1].mom_revenue_delta).toBe(4000);
    expect(out.summary.by_month[1].mom_revenue_pct).toBeCloseTo((4000 / 3000) * 100, 4);
  });

  it('2. A6 EXACT ANSWER KEY: matches every single number on du-lieu-test-ban-le.csv (48 clean rows)', async () => {
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', retailBytes);
    expect(valRes.ok).toBe(true);
    if (!valRes.ok || !valRes.businessTable) throw new Error('Validation failed');

    const cleaned = runBusinessCleanPipeline(valRes.businessTable, {
      remove_blank_rows: true,
      trim_whitespace: true,
      drop_exact_duplicates: true,
      fill_blank_dimension_label: true,
      sort_natural: true,
    });
    expect(cleaned.valid).toBe(true);
    expect(cleaned.cleanTable.n).toBe(48);

    const t0 = performance.now();
    const out = analyzeBusinessTable(cleaned.cleanTable);
    const elapsedMs = performance.now() - t0;

    // Performance budget: 50 rows < 300 ms
    expect(elapsedMs).toBeLessThan(300);

    const { summary } = out;
    expect(summary.total_rows).toBe(48);

    // Totals
    expect(summary.totals.orders).toBe(3342);
    expect(summary.totals.revenue).toBe(1135530000);
    expect(summary.totals.cogs).toBe(603680000);
    expect(summary.totals.profit).toBe(531850000);
    expect(Number(summary.totals.gross_margin_pct?.toFixed(2))).toBe(46.84);
    expect(Number(summary.totals.aov?.toFixed(2))).toBe(339775.58);

    // By Channel
    const chMap = new Map(summary.by_channel.map((x) => [x.key, x]));
    expect(chMap.get('Website')?.revenue).toBe(454165000);
    expect(chMap.get('Website')?.orders).toBe(1313);
    expect(chMap.get('Website')?.profit).toBe(216547000);

    expect(chMap.get('Sàn thương mại điện tử')?.revenue).toBe(367740000);
    expect(chMap.get('Sàn thương mại điện tử')?.orders).toBe(1110);
    expect(chMap.get('Sàn thương mại điện tử')?.profit).toBe(165300000);

    expect(chMap.get('Cửa hàng')?.revenue).toBe(313625000);
    expect(chMap.get('Cửa hàng')?.orders).toBe(919);
    expect(chMap.get('Cửa hàng')?.profit).toBe(150003000);

    // By Month
    const moMap = new Map(summary.by_month.map((x) => [x.key, x]));
    expect(moMap.get('2026-10')?.revenue).toBe(334216000);
    expect(moMap.get('2026-08')?.revenue).toBe(296557000);
    expect(moMap.get('2026-07')?.revenue).toBe(261246000);
    expect(moMap.get('2026-09')?.revenue).toBe(243511000);

    // By Region
    const rgMap = new Map(summary.by_region.map((x) => [x.key, x]));
    expect(rgMap.get('Miền Trung')?.revenue).toBe(380718000);
    expect(rgMap.get('Miền Bắc')?.revenue).toBe(372836000);
    expect(rgMap.get('Miền Nam')?.revenue).toBe(355558000);
    expect(rgMap.get('Không xác định')?.revenue).toBe(26418000);

    // By Product
    const prMap = new Map(summary.by_product.map((x) => [x.key, x]));
    expect(prMap.get('Sơ mi')?.revenue).toBe(373257000);
    expect(prMap.get('Quần jeans')?.revenue).toBe(363893000);
    expect(prMap.get('Áo thun')?.revenue).toBe(258092000);
    expect(prMap.get('Túi tote')?.revenue).toBe(94768000);
    expect(prMap.get('Không xác định')?.revenue).toBe(45520000);

    // Charts & metrics generated
    expect(out.metrics.length).toBeGreaterThanOrEqual(8);
    expect(out.charts).toHaveLength(4);
  });

  it('3. Full service integration: Upload -> Clean Gate 1 -> Business runAnalysis transitions state cleanly', async () => {
    const s = createSession('Business Analysis Flow');
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', retailBytes);
    if (!valRes.ok || !valRes.businessTable) throw new Error('Validation failed');

    ArtifactStore.put(s.id, 'raw', valRes.businessTable);
    const rec = sessionStore.getRecord(s.id)!;
    rec.state = 'uploaded';
    rec.meta.dataset = valRes.meta;
    sessionStore.setRecord(rec);

    await getProfileAndProposals(s.id);
    const cleanRes = await approveCleanGate(s.id, 'Người Duyệt M3', {
      remove_blank_rows: true,
      trim_whitespace: true,
      drop_exact_duplicates: true,
      fill_blank_dimension_label: true,
      sort_natural: true,
    });

    const meta = getAvailableDatasetMeta(s.id);
    expect(meta?.kind).toBe('business');
    expect(meta?.total_rows).toBe(48);

    const analysis = await runAnalysis(s.id, {
      symbols: ['BUSINESS'],
      date_from: meta!.date_from,
      date_to: meta!.date_to,
      preset: 'all',
    });

    expect(analysis.kind).toBe('business');
    expect(analysis.clean_hash).toBe(cleanRes.cleanArtifact.hash);
    expect(analysis.business_analysis.totals.revenue).toBe(1135530000);
    expect(sessionStore.getRecord(s.id)?.state).toBe('analyzed');
  });

  it('4. Watchdog terminates hanging worker with exact Vietnamese message and handles worker exceptions', async () => {
    const terminate = vi.fn();
    const silentWorker: any = {
      postMessage: vi.fn(),
      terminate,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    };

    await expect(
      runInWorker(silentWorker as Worker, { test: 1 }, {
        inactivityTimeoutMs: 35,
        hardTimeoutMs: 200,
        diagnosticMeta: { stage: 'business_aggregate', rows: 50 },
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WORKER_TIMEOUT,
      message: WORKER_TIMEOUT_MESSAGE_VI,
    });
    expect(terminate).toHaveBeenCalledTimes(1);

    // Worker throws error -> converted to AppError cleanly
    const terminate2 = vi.fn();
    const errorWorker: any = {
      postMessage: vi.fn(() => {
        setTimeout(() => errorWorker.onerror?.({ message: 'Out of memory' }), 10);
      }),
      terminate: terminate2,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    };

    await expect(
      runInWorker(errorWorker as Worker, { test: 1 }, { inactivityTimeoutMs: 200, hardTimeoutMs: 500 })
    ).rejects.toMatchObject({ code: ERROR_CODES.INTERNAL });
    expect(terminate2).toHaveBeenCalledTimes(1);
  });

  it('5. Hard performance budgets in Node: 1,000 rows < 1s and 50,000 rows < 5s', () => {
    const tbl1k = buildSyntheticBusinessTable(1000);
    const t1Start = performance.now();
    const out1k = analyzeBusinessTable(tbl1k);
    const ms1k = performance.now() - t1Start;
    expect(out1k.summary.total_rows).toBe(1000);
    expect(ms1k).toBeLessThan(1000);

    const tbl50k = buildSyntheticBusinessTable(50000);
    const t50Start = performance.now();
    const out50k = analyzeBusinessTable(tbl50k);
    const ms50k = performance.now() - t50Start;
    expect(out50k.summary.total_rows).toBe(50000);
    expect(ms50k).toBeLessThan(5000);
  });

  it('6. Correctly identifies missing metrics/dimensions in thieu-gia-von-thieu-san-pham.csv without silent fallbacks', async () => {
    const csvPath = path.resolve(__dirname, '../../../samples/business/thieu-gia-von-thieu-san-pham.csv');
    const csv = fs.readFileSync(csvPath);
    const val = await validateBytes('thieu-gia-von-thieu-san-pham.csv', new Uint8Array(csv));
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const out = analyzeBusinessTable(cleanRes.cleanTable);

    // Totals: revenue present, everything else missing/null
    expect(out.summary.totals.revenue).toBe(723600000);
    expect(out.summary.totals.orders).toBeNull();
    expect(out.summary.totals.aov).toBeNull();
    expect(out.summary.totals.cogs).toBeNull();
    expect(out.summary.totals.profit).toBeNull();
    expect(out.summary.totals.gross_margin_pct).toBeNull();

    // by_product is empty, no product chart
    expect(out.summary.by_product).toEqual([]);
    expect(out.charts.find((c) => c.id === 'chart_biz_product_revenue')).toBeUndefined();

    // other charts present
    expect(out.charts.find((c) => c.id === 'chart_biz_channel_revenue')).toBeDefined();
    expect(out.charts.find((c) => c.id === 'chart_biz_region_revenue')).toBeDefined();
    expect(out.charts.find((c) => c.id === 'chart_biz_month_trend')).toBeDefined();

    // Unavailable list populated
    expect(out.unavailable?.some((u) => u.id === 'orders_total')).toBe(true);
    expect(out.unavailable?.some((u) => u.id === 'cogs_total')).toBe(true);
    expect(out.unavailable?.some((u) => u.id === 'by_product')).toBe(true);

    // Standardized warnings present
    expect(out.warnings.some((w) => w.includes('Không có cột Giá vốn hoặc Lợi nhuận gộp'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('Không có cột Số đơn'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('Không có cột Sản phẩm'))).toBe(true);
  });

  it('7. (H4 Ca 6) Analyzer handles various combinations of missing columns deterministically', () => {
    function makeCustomTable(
      measures: Array<{ label: string; values: number[] }>,
      dims: Array<{ label: string; categories: string[]; codes: number[] }> = []
    ): BusinessTable {
      const n = measures[0]?.values.length || 2;
      return {
        kind: 'business',
        n,
        source_row: new Int32Array(Array.from({ length: n }, (_, i) => i + 1)),
        columns: [
          ...measures.map((m, idx) => ({
            role: 'measure' as const,
            key: `m_${idx}`,
            label: m.label,
            values: new Float64Array(m.values),
          })),
          ...dims.map((d, idx) => ({
            role: 'dimension' as const,
            key: `d_${idx}`,
            label: d.label,
            categories: d.categories,
            codes: new Uint16Array(d.codes),
          })),
        ],
      };
    }

    // Tổ hợp A: Chỉ có Doanh thu
    const tA = makeCustomTable([{ label: 'Doanh thu', values: [1000, 2000] }]);
    const outA = analyzeBusinessTable(tA);
    expect(outA.summary.totals.revenue).toBe(3000);
    expect(outA.summary.totals.cogs).toBeNull();
    expect(outA.summary.totals.profit).toBeNull();
    expect(outA.summary.totals.gross_margin_pct).toBeNull();
    expect(outA.summary.totals.orders).toBeNull();
    expect(outA.summary.totals.aov).toBeNull();
    expect(outA.summary.by_channel).toHaveLength(0);
    expect(outA.summary.by_product).toHaveLength(0);
    expect(outA.summary.by_region).toHaveLength(0);
    expect(outA.summary.by_month).toHaveLength(0);
    expect(outA.unavailable?.map((u) => u.id)).toEqual(
      expect.arrayContaining(['orders_total', 'aov', 'cogs_total', 'gross_profit_total', 'gross_margin_pct', 'by_channel', 'by_region', 'by_product', 'by_month'])
    );

    // Tổ hợp B: Doanh thu + Kênh bán
    const tB = makeCustomTable(
      [{ label: 'Doanh thu', values: [1000, 2000] }],
      [{ label: 'Kênh bán', categories: ['Online', 'Offline'], codes: [0, 1] }]
    );
    const outB = analyzeBusinessTable(tB);
    expect(outB.summary.totals.revenue).toBe(3000);
    expect(outB.summary.by_channel).toHaveLength(2);
    expect(outB.summary.by_product).toHaveLength(0);
    expect(outB.unavailable?.some((u) => u.id === 'by_channel')).toBe(false);
    expect(outB.unavailable?.some((u) => u.id === 'by_product')).toBe(true);

    // Tổ hợp C: Doanh thu + Giá vốn (không có lợi nhuận)
    const tC = makeCustomTable([
      { label: 'Doanh thu', values: [1000, 2000] },
      { label: 'Giá vốn', values: [600, 1200] },
    ]);
    const outC = analyzeBusinessTable(tC);
    expect(outC.summary.totals.revenue).toBe(3000);
    expect(outC.summary.totals.cogs).toBe(1800);
    expect(outC.summary.totals.profit).toBe(1200); // tính ra
    expect(Number(outC.summary.totals.gross_margin_pct?.toFixed(2))).toBe(40);
  });

  describe('E4: businessAnalyzer month handling with missing/invalid periods', () => {
    it('excludes rows without period from by_month, preserves total revenue and emits warning', () => {
      const table: BusinessTable = {
        kind: 'business',
        n: 5,
        source_row: new Int32Array([1, 2, 3, 4, 5]),
        columns: [
          {
            role: 'time',
            key: 'month',
            label: 'Tháng',
            granularity: 'month',
            values: new Int32Array([678, 679, 680, -1, -1]),
            raw_labels: ['2026-07', '2026-08', '2026-09', '', '   '],
          },
          {
            role: 'measure',
            key: 'revenue',
            label: 'Doanh thu',
            values: new Float64Array([1000000, 2000000, 3000000, 400000, 500000]),
          },
          {
            role: 'dimension',
            key: 'channel',
            label: 'Kênh bán',
            categories: ['Online', 'Offline'],
            codes: new Uint16Array([0, 1, 0, 1, 0]),
          },
        ],
      };

      const out = analyzeBusinessTable(table);
      expect(out.summary.totals.revenue).toBe(6900000);
      expect(out.rows_without_period).toBe(2);

      // by_month has 3 valid months, does NOT contain any 1970 or empty
      expect(out.summary.by_month).toHaveLength(3);
      expect(out.summary.by_month.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09']);
      const monthlyTotal = out.summary.by_month.reduce((acc, m) => acc + m.revenue, 0);
      expect(monthlyTotal).toBe(6000000);
      expect(out.summary.totals.revenue).toBe(monthlyTotal + 900000);

      // Warning emitted
      expect(
        out.warnings.some((w) =>
          w.includes('Có 2 dòng không có tháng hợp lệ: các dòng này không đưa vào xu hướng theo tháng nhưng vẫn được tính vào tổng và các chiều khác.')
        )
      ).toBe(true);
    });

    it('sets by_month = [] and populates unavailable when all rows lack valid month', () => {
      const table: BusinessTable = {
        kind: 'business',
        n: 3,
        source_row: new Int32Array([1, 2, 3]),
        columns: [
          {
            role: 'time',
            key: 'month',
            label: 'Tháng',
            granularity: 'month',
            values: new Int32Array([-1, -1, -1]),
            raw_labels: ['', '   ', 'invalid'],
          },
          {
            role: 'measure',
            key: 'revenue',
            label: 'Doanh thu',
            values: new Float64Array([1000000, 2000000, 3000000]),
          },
        ],
      };

      const out = analyzeBusinessTable(table);
      expect(out.summary.totals.revenue).toBe(6000000);
      expect(out.summary.by_month).toHaveLength(0);
      expect(out.unavailable?.some((u) => u.id === 'by_month')).toBe(true);
      expect(
        out.warnings.some((w) =>
          w.includes('Cột Tháng không có giá trị hợp lệ: các phân tích theo tháng không được tính.')
        )
      ).toBe(true);
    });
  });
});
