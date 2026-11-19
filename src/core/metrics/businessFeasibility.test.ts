import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BusinessTable, BusinessColumn } from '../businessTable';
import { validateBytes } from '../validator/index';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';
import { resolveBusinessRoles } from './businessRoles';
import {
  BUSINESS_METRIC_CATALOG,
  BUSINESS_ROLE_IDS,
} from './businessCatalog';
import {
  buildBusinessFacts,
  checkFeasibility,
  listFeasibility,
  type BusinessFacts,
} from './businessFeasibility';

function buildSyntheticTable(n: number): BusinessTable {
  const source_row = new Int32Array(n);
  const timeVals = new Int32Array(n);
  const rawTimes: string[] = new Array(n);
  const chCodes = new Uint16Array(n);
  const rgCodes = new Uint16Array(n);
  const prCodes = new Uint16Array(n);
  const revVals = new Float64Array(n);
  const ordVals = new Float64Array(n);
  const cogsVals = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    source_row[i] = i + 1;
    const m = (i % 6) + 1;
    timeVals[i] = (2026 - 1970) * 12 + (m - 1);
    rawTimes[i] = `2026-0${m}`;
    chCodes[i] = i % 3;
    rgCodes[i] = i % 3;
    prCodes[i] = i % 4;
    revVals[i] = 100000 + (i % 10) * 10000;
    ordVals[i] = 1 + (i % 5);
    cogsVals[i] = 50000 + (i % 10) * 5000;
  }

  const columns: BusinessColumn[] = [
    {
      role: 'time',
      key: 'thang',
      label: 'Tháng',
      granularity: 'month',
      values: timeVals,
      raw_labels: rawTimes,
    },
    {
      role: 'dimension',
      key: 'kenh',
      label: 'Kênh bán',
      categories: ['Website', 'Sàn TMĐT', 'Cửa hàng'],
      codes: chCodes,
    },
    {
      role: 'dimension',
      key: 'khuvuc',
      label: 'Khu vực',
      categories: ['Miền Bắc', 'Miền Trung', 'Miền Nam'],
      codes: rgCodes,
    },
    {
      role: 'dimension',
      key: 'sanpham',
      label: 'Sản phẩm',
      categories: ['Áo thun', 'Sơ mi', 'Quần jeans', 'Túi tote'],
      codes: prCodes,
    },
    {
      role: 'measure',
      key: 'doanh_thu',
      label: 'Doanh thu',
      values: revVals,
    },
    {
      role: 'measure',
      key: 'so_don',
      label: 'Số đơn',
      values: ordVals,
    },
    {
      role: 'measure',
      key: 'gia_von',
      label: 'Giá vốn',
      values: cogsVals,
    },
  ];

  return {
    kind: 'business',
    n,
    source_row,
    columns,
  };
}

function makeCaseTable(
  columns: Array<{
    label: string;
    role: 'time' | 'dimension' | 'measure';
    values?: number[];
    categories?: string[];
    codes?: number[];
    raw_labels?: string[];
  }>
): BusinessTable {
  const n = columns[0]?.values?.length || columns[0]?.raw_labels?.length || columns[0]?.codes?.length || 3;
  const source_row = new Int32Array(n);
  for (let i = 0; i < n; i++) source_row[i] = i + 1;

  const cols: BusinessColumn[] = columns.map((c, idx) => {
    if (c.role === 'time') {
      return {
        role: 'time',
        key: `time_${idx}`,
        label: c.label,
        granularity: 'month',
        values: new Int32Array(c.values || new Array(n).fill(672)),
        raw_labels: c.raw_labels || new Array(n).fill('2026-01'),
      };
    }
    if (c.role === 'dimension') {
      return {
        role: 'dimension',
        key: `dim_${idx}`,
        label: c.label,
        categories: c.categories || ['Website', 'Sàn TMĐT', 'Cửa hàng'],
        codes: new Uint16Array(c.codes || new Array(n).fill(0)),
        raw_labels: c.raw_labels,
      };
    }
    return {
      role: 'measure',
      key: `m_${idx}`,
      label: c.label,
      values: new Float64Array(c.values || new Array(n).fill(100)),
    };
  });

  return {
    kind: 'business',
    n,
    source_row,
    columns: cols,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

describe('Prompt 1C-1: Business Feasibility Test Suite', () => {
  // T1: Danh mục
  it('T1: Catalog has exactly 13 metrics, valid structure, serializable to JSON', () => {
    expect(BUSINESS_METRIC_CATALOG).toHaveLength(13);

    const ids = BUSINESS_METRIC_CATALOG.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(13);

    const expectedOrder = [
      'total_revenue',
      'total_orders',
      'aov',
      'gross_profit',
      'gross_margin',
      'revenue_by_channel',
      'revenue_by_region',
      'revenue_by_month',
      'revenue_growth',
      'revenue_by_product',
      'margin_by_channel',
      'margin_by_product',
      'channel_product_matrix',
    ];
    expect(ids).toEqual(expectedOrder);

    for (const m of BUSINESS_METRIC_CATALOG) {
      expect(m.sampleQuestion).toBeTruthy();
      expect(m.sampleQuestion.trim().length).toBeGreaterThan(0);

      // Validate requiredRoles
      for (const r of m.requiredRoles) {
        expect(BUSINESS_ROLE_IDS).toContain(r);
      }

      // Validate requiredAnyOf
      for (const group of m.requiredAnyOf) {
        for (const r of group) {
          expect(BUSINESS_ROLE_IDS).toContain(r);
        }
      }

      // If revenue is in requiredRoles -> positive_sum revenue
      if (m.requiredRoles.includes('revenue')) {
        expect(m.constraints.some((c) => c.type === 'positive_sum' && c.role === 'revenue')).toBe(true);
      }

      // If orders is in requiredRoles -> positive_sum orders
      if (m.requiredRoles.includes('orders')) {
        expect(m.constraints.some((c) => c.type === 'positive_sum' && c.role === 'orders')).toBe(true);
      }

      // If cost/profit group in requiredAnyOf -> positive_sum margin_source
      const hasMarginGroup = m.requiredAnyOf.some(
        (g) => g.includes('cost') && g.includes('profit')
      );
      if (hasMarginGroup) {
        expect(
          m.constraints.some((c) => c.type === 'positive_sum' && c.role === 'margin_source')
        ).toBe(true);
      } else {
        expect(
          m.constraints.some((c) => c.type === 'positive_sum' && (c as any).role === 'margin_source')
        ).toBe(false);
      }

      // min_distinct/min_months references role in requiredRoles
      for (const c of m.constraints) {
        if (c.type === 'min_distinct') {
          expect(m.requiredRoles).toContain(c.role);
        }
        if (c.type === 'min_months') {
          expect(m.requiredRoles).toContain('period');
        }
      }
    }

    // JSON serializability check
    const serialized = JSON.stringify(BUSINESS_METRIC_CATALOG);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(BUSINESS_METRIC_CATALOG);
  });

  // T2: File thật du-lieu-test-ban-le.csv
  it('T2: Real file du-lieu-test-ban-le.csv: 13/13 feasible', async () => {
    const p = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
    const bytes = new Uint8Array(fs.readFileSync(p));
    const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;
    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const roles = resolveBusinessRoles(cleanRes.cleanTable);
    const facts = buildBusinessFacts(cleanRes.cleanTable, roles);

    console.log(
      `FACTS|du-lieu-test-ban-le.csv|marginSource=${facts.marginSource}|revenue=${facts.roleStatus.revenue},orders=${facts.roleStatus.orders},cost=${facts.roleStatus.cost},profit=${facts.roleStatus.profit},product=${facts.roleStatus.product},channel=${facts.roleStatus.channel},region=${facts.roleStatus.region},period=${facts.roleStatus.period}`
    );

    const list = listFeasibility(facts);
    for (const item of list) {
      const reason = item.result.feasible ? '' : item.result.reason;
      console.log(`FEAS|du-lieu-test-ban-le.csv|${item.metricId}|${item.result.feasible}|${reason}`);
    }

    expect(list.every((item) => item.result.feasible)).toBe(true);
  });

  // T3: File thật thieu-gia-von-thieu-san-pham.csv
  it('T3: Real file thieu-gia-von-thieu-san-pham.csv: 5 feasible, 8 not feasible with exact reasons', async () => {
    const p = path.resolve(__dirname, '../../../samples/business/thieu-gia-von-thieu-san-pham.csv');
    const bytes = new Uint8Array(fs.readFileSync(p));
    const val = await validateBytes('thieu-gia-von-thieu-san-pham.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;
    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const roles = resolveBusinessRoles(cleanRes.cleanTable);
    const facts = buildBusinessFacts(cleanRes.cleanTable, roles);

    console.log(
      `FACTS|thieu-gia-von-thieu-san-pham.csv|marginSource=${facts.marginSource}|revenue=${facts.roleStatus.revenue},orders=${facts.roleStatus.orders},cost=${facts.roleStatus.cost},profit=${facts.roleStatus.profit},product=${facts.roleStatus.product},channel=${facts.roleStatus.channel},region=${facts.roleStatus.region},period=${facts.roleStatus.period}`
    );

    const list = listFeasibility(facts);
    for (const item of list) {
      const reason = item.result.feasible ? '' : item.result.reason;
      console.log(`FEAS|thieu-gia-von-thieu-san-pham.csv|${item.metricId}|${item.result.feasible}|${reason}`);
    }

    const feasibleIds = list.filter((item) => item.result.feasible).map((item) => item.metricId);
    expect(feasibleIds).toEqual([
      'total_revenue',
      'revenue_by_channel',
      'revenue_by_region',
      'revenue_by_month',
      'revenue_growth',
    ]);

    expect(checkFeasibility('total_orders', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Số đơn.',
      missingRoles: ['orders'],
      missingAnyOf: [],
    });
    expect(checkFeasibility('aov', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Số đơn.',
      missingRoles: ['orders'],
      missingAnyOf: [],
    });
    expect(checkFeasibility('gross_profit', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.',
      missingRoles: [],
      missingAnyOf: [['cost', 'profit']],
    });
    expect(checkFeasibility('gross_margin', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.',
      missingRoles: [],
      missingAnyOf: [['cost', 'profit']],
    });
    expect(checkFeasibility('revenue_by_product', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Sản phẩm.',
      missingRoles: ['product'],
      missingAnyOf: [],
    });
    expect(checkFeasibility('margin_by_channel', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.',
      missingRoles: [],
      missingAnyOf: [['cost', 'profit']],
    });
    expect(checkFeasibility('margin_by_product', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.',
      missingRoles: ['product'],
      missingAnyOf: [['cost', 'profit']],
    });
    expect(checkFeasibility('channel_product_matrix', facts)).toEqual({
      feasible: false,
      reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.',
      missingRoles: ['product'],
      missingAnyOf: [['cost', 'profit']],
    });
  });

  // T4: K1 (Giá vốn toàn 0)
  it('T4: K1 (cogs all 0) marks cogs as unreliable in resolver, so metrics 4, 5, 11 fail with unreliable cost reason', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02', '2026-03'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT', 'Cửa hàng'], codes: [0, 1, 2] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200, 300] },
      { label: 'Giá vốn', role: 'measure', values: [0, 0, 0] },
    ]);
    const roles = resolveBusinessRoles(table);
    expect(roles.cogs.status).toBe('không đáng tin');
    const facts = buildBusinessFacts(table, roles);
    expect(facts.roleStatus.cost).toBe('unreliable');

    // Metrics 1 & 6 feasible
    expect(checkFeasibility('total_revenue', facts).feasible).toBe(true);
    expect(checkFeasibility('revenue_by_channel', facts).feasible).toBe(true);

    // Metrics 4, 5, 11 fail with unreliable cost
    const res4 = checkFeasibility('gross_profit', facts);
    expect(res4.feasible).toBe(false);
    if (!res4.feasible) {
      expect(res4.reason).toBe('Dữ liệu cột Giá vốn không đáng tin.');
    }

    const res5 = checkFeasibility('gross_margin', facts);
    expect(res5.feasible).toBe(false);
    if (!res5.feasible) {
      expect(res5.reason).toBe('Dữ liệu cột Giá vốn không đáng tin.');
    }

    const res11 = checkFeasibility('margin_by_channel', facts);
    expect(res11.feasible).toBe(false);
    if (!res11.feasible) {
      expect(res11.reason).toBe('Dữ liệu cột Giá vốn không đáng tin.');
    }
  });

  // T5: K7 (Một kênh)
  it('T5: K7 (one channel) fails metric 6 with min_distinct reason, metric 8 feasible', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website'], codes: [0, 0] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res6 = checkFeasibility('revenue_by_channel', facts);
    expect(res6.feasible).toBe(false);
    if (!res6.feasible) {
      expect(res6.reason).toBe('Cột Kênh chỉ có 1 giá trị, không có gì để so sánh.');
    }

    expect(checkFeasibility('revenue_by_month', facts).feasible).toBe(true);
  });

  // T6: K8 (Một tháng)
  it('T6: K8 (one month) fails metrics 8 & 9 with min_months 1 reason, metric 6 feasible', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-01'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT'], codes: [0, 1] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res8 = checkFeasibility('revenue_by_month', facts);
    expect(res8.feasible).toBe(false);
    if (!res8.feasible) {
      expect(res8.reason).toBe('Chỉ có 1 tháng hợp lệ, không đủ để so sánh theo thời gian.');
    }

    const res9 = checkFeasibility('revenue_growth', facts);
    expect(res9.feasible).toBe(false);
    if (!res9.feasible) {
      expect(res9.reason).toBe('Chỉ có 1 tháng hợp lệ, không đủ để so sánh theo thời gian.');
    }

    expect(checkFeasibility('revenue_by_channel', facts).feasible).toBe(true);
  });

  // T7: K9 (Tháng toàn trống)
  it('T7: K9 (months empty) fails metrics 8 & 9 with min_months 0 reason', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['', ''] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT'], codes: [0, 1] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res8 = checkFeasibility('revenue_by_month', facts);
    expect(res8.feasible).toBe(false);
    if (!res8.feasible) {
      expect(res8.reason).toBe('Không dòng nào có tháng hợp lệ.');
    }

    const res9 = checkFeasibility('revenue_growth', facts);
    expect(res9.feasible).toBe(false);
    if (!res9.feasible) {
      expect(res9.reason).toBe('Không dòng nào có tháng hợp lệ.');
    }
  });

  // T8: K6 (Số đơn toàn 0)
  it('T8: K6 (orders all 0) fails metrics 2 & 3 with positive_sum orders reason', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT'], codes: [0, 1] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200] },
      { label: 'Số đơn', role: 'measure', values: [0, 0] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res2 = checkFeasibility('total_orders', facts);
    expect(res2.feasible).toBe(false);
    if (!res2.feasible) {
      expect(res2.reason).toBe('Cột Số đơn không có giá trị dương.');
    }

    const res3 = checkFeasibility('aov', facts);
    expect(res3.feasible).toBe(false);
    if (!res3.feasible) {
      expect(res3.reason).toBe('Cột Số đơn không có giá trị dương.');
    }
  });

  // T9: K10 (Kênh toàn trống)
  it('T9: K10 (channel empty) fails metric 6 with min_distinct 0 reason', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02'] },
      { label: 'Kênh', role: 'dimension', categories: [], codes: [0xffff, 0xffff] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res6 = checkFeasibility('revenue_by_channel', facts);
    expect(res6.feasible).toBe(false);
    if (!res6.feasible) {
      expect(res6.reason).toBe('Cột Kênh không có giá trị nào.');
    }
  });

  // T10: Thiếu nhiều cột
  it('T10: Missing multiple columns formats reasons in exact B1 order, unknown ID returns specific message', () => {
    const facts: BusinessFacts = {
      rowCount: 10,
      roleStatus: {
        revenue: 'ok',
        orders: 'missing',
        cost: 'missing',
        profit: 'missing',
        product: 'missing',
        channel: 'missing',
        region: 'ok',
        period: 'ok',
      },
      marginSource: 'none',
      distinct: { channel: 0, region: 3, product: 0 },
      validMonths: 3,
      sums: { revenue: 1000, orders: 0, margin_source: null },
    };

    // Metric 12 (margin_by_product) requires revenue, product; anyOf cost/profit
    const res12 = checkFeasibility('margin_by_product', facts);
    expect(res12.feasible).toBe(false);
    if (!res12.feasible) {
      expect(res12.reason).toBe('Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.');
    }

    // Metric requiring product and channel
    const customMetricDef = {
      id: 'custom_prod_chan',
      name: 'Custom',
      sampleQuestion: '?',
      requiredRoles: ['product', 'channel'] as any,
      requiredAnyOf: [],
      constraints: [],
      outputs: ['answer'] as any,
    };
    BUSINESS_METRIC_CATALOG.push(customMetricDef);
    try {
      const resCustom = checkFeasibility('custom_prod_chan', facts);
      expect(resCustom.feasible).toBe(false);
      if (!resCustom.feasible) {
        expect(resCustom.reason).toBe('Thiếu cột Sản phẩm, Kênh.');
      }
    } finally {
      BUSINESS_METRIC_CATALOG.pop();
    }

    // Unknown metric ID
    const resUnknown = checkFeasibility('non_existent_metric', facts);
    expect(resUnknown).toEqual({
      feasible: false,
      reason: 'Chỉ số không có trong danh mục.',
      missingRoles: [],
      missingAnyOf: [],
    });
  });

  // T11: Thuần (deep freeze)
  it('T11: Pure function idempotency and deep freeze tolerance', () => {
    const facts: BusinessFacts = deepFreeze({
      rowCount: 10,
      roleStatus: {
        revenue: 'ok',
        orders: 'ok',
        cost: 'ok',
        profit: 'ok',
        product: 'ok',
        channel: 'ok',
        region: 'ok',
        period: 'ok',
      },
      marginSource: 'cost',
      distinct: { channel: 3, region: 3, product: 4 },
      validMonths: 4,
      sums: { revenue: 1000000, orders: 100, margin_source: 500000 },
    });

    const run1 = listFeasibility(facts);
    const run2 = listFeasibility(facts);
    expect(run1).toEqual(run2);
  });

  // T12: Hiệu năng trên 100.000 dòng
  it('T12: Performance on 100,000 synthetic rows takes < 1000 ms', () => {
    const table = buildSyntheticTable(100000);
    const roles = resolveBusinessRoles(table);

    const start = performance.now();
    const facts = buildBusinessFacts(table, roles);
    const results = listFeasibility(facts);
    const duration = performance.now() - start;

    console.log(`T12 execution time for 100,000 rows: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(1000);
    expect(results).toHaveLength(13);
  });

  // T13: K4 (Doanh thu toàn 0)
  it('T13: K4 (revenue all 0) fails metrics 1, 6, 8 with positive_sum revenue; metric 2 reports missing orders', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT'], codes: [0, 1] },
      { label: 'Doanh thu', role: 'measure', values: [0, 0] },
      { label: 'Giá vốn', role: 'measure', values: [10, 20] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res1 = checkFeasibility('total_revenue', facts);
    expect(res1.feasible).toBe(false);
    if (!res1.feasible) {
      expect(res1.reason).toBe('Cột Doanh thu không có giá trị dương.');
    }

    const res6 = checkFeasibility('revenue_by_channel', facts);
    expect(res6.feasible).toBe(false);
    if (!res6.feasible) {
      expect(res6.reason).toBe('Cột Doanh thu không có giá trị dương.');
    }

    const res8 = checkFeasibility('revenue_by_month', facts);
    expect(res8.feasible).toBe(false);
    if (!res8.feasible) {
      expect(res8.reason).toBe('Cột Doanh thu không có giá trị dương.');
    }

    const res2 = checkFeasibility('total_orders', facts);
    expect(res2.feasible).toBe(false);
    if (!res2.feasible) {
      expect(res2.reason).toBe('Thiếu cột Số đơn.');
    }
  });

  // T14: K5 (Doanh thu có cột nhưng toàn trống)
  it('T14: K5 (revenue column empty) fails metrics 1, 6, 8 with positive_sum or missing revenue', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT'], codes: [0, 1] },
      { label: 'Doanh thu', role: 'measure', values: [NaN, NaN] },
      { label: 'Giá vốn', role: 'measure', values: [10, 20] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);

    const res1 = checkFeasibility('total_revenue', facts);
    expect(res1.feasible).toBe(false);
    if (!res1.feasible) {
      expect(res1.reason).toBe('Cột Doanh thu không có giá trị dương.');
    }

    const res6 = checkFeasibility('revenue_by_channel', facts);
    expect(res6.feasible).toBe(false);
    if (!res6.feasible) {
      expect(res6.reason).toBe('Cột Doanh thu không có giá trị dương.');
    }

    const res8 = checkFeasibility('revenue_by_month', facts);
    expect(res8.feasible).toBe(false);
    if (!res8.feasible) {
      expect(res8.reason).toBe('Cột Doanh thu không có giá trị dương.');
    }
  });

  // T15: K2 (Doanh thu + Lợi nhuận gộp, không Giá vốn)
  it('T15: K2 (revenue + profit, no cogs) sets marginSource = profit; metrics 4, 5, 11 feasible; 12 & 13 report missing product', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02', '2026-03'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT', 'Cửa hàng'], codes: [0, 1, 2] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200, 300] },
      { label: 'Lợi nhuận gộp', role: 'measure', values: [40, 90, 120] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);
    expect(facts.marginSource).toBe('profit');

    expect(checkFeasibility('gross_profit', facts).feasible).toBe(true);
    expect(checkFeasibility('gross_margin', facts).feasible).toBe(true);
    expect(checkFeasibility('margin_by_channel', facts).feasible).toBe(true);

    const res12 = checkFeasibility('margin_by_product', facts);
    expect(res12.feasible).toBe(false);
    if (!res12.feasible) {
      expect(res12.reason).toBe('Thiếu cột Sản phẩm.');
    }

    const res13 = checkFeasibility('channel_product_matrix', facts);
    expect(res13.feasible).toBe(false);
    if (!res13.feasible) {
      expect(res13.reason).toBe('Thiếu cột Sản phẩm.');
    }
  });

  // T16: K3 (Lợi nhuận gộp = Doanh thu mọi dòng)
  it('T16: K3 (profit == revenue all rows) marks profit as unreliable; metrics 4, 5, 11 fail with unreliable profit reason; 1 & 6 feasible', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02', '2026-03'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT', 'Cửa hàng'], codes: [0, 1, 2] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200, 300] },
      { label: 'Lợi nhuận gộp', role: 'measure', values: [100, 200, 300] },
    ]);
    const roles = resolveBusinessRoles(table);
    expect(roles.profit.status).toBe('không đáng tin');
    const facts = buildBusinessFacts(table, roles);
    expect(facts.roleStatus.profit).toBe('unreliable');

    expect(checkFeasibility('total_revenue', facts).feasible).toBe(true);
    expect(checkFeasibility('revenue_by_channel', facts).feasible).toBe(true);

    const res4 = checkFeasibility('gross_profit', facts);
    expect(res4.feasible).toBe(false);
    if (!res4.feasible) {
      expect(res4.reason).toBe('Dữ liệu cột Lợi nhuận gộp không đáng tin.');
    }

    const res5 = checkFeasibility('gross_margin', facts);
    expect(res5.feasible).toBe(false);
    if (!res5.feasible) {
      expect(res5.reason).toBe('Dữ liệu cột Lợi nhuận gộp không đáng tin.');
    }

    const res11 = checkFeasibility('margin_by_channel', facts);
    expect(res11.feasible).toBe(false);
    if (!res11.feasible) {
      expect(res11.reason).toBe('Dữ liệu cột Lợi nhuận gộp không đáng tin.');
    }
  });

  // T17: Nhóm anyOf
  it('T17: requiredAnyOf with marginSource none and missing product returns compound reason and populates fields', () => {
    const facts: BusinessFacts = {
      rowCount: 10,
      roleStatus: {
        revenue: 'ok',
        orders: 'ok',
        cost: 'missing',
        profit: 'missing',
        product: 'missing',
        channel: 'ok',
        region: 'ok',
        period: 'ok',
      },
      marginSource: 'none',
      distinct: { channel: 3, region: 3, product: 0 },
      validMonths: 3,
      sums: { revenue: 1000, orders: 50, margin_source: null },
    };

    const res = checkFeasibility('margin_by_product', facts);
    expect(res).toEqual({
      feasible: false,
      reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.',
      missingRoles: ['product'],
      missingAnyOf: [['cost', 'profit']],
    });
  });

  // T18: Thứ tự kiểm bằng facts dựng tay
  it('T18: Handcrafted facts verify exact precedence: Missing > Unreliable > Constraints', () => {
    // (a) channel = unreliable and distinct = 1: Unreliable triggers first
    const factsA: BusinessFacts = {
      rowCount: 5,
      roleStatus: {
        revenue: 'ok',
        orders: 'ok',
        cost: 'ok',
        profit: 'ok',
        product: 'ok',
        channel: 'unreliable',
        region: 'ok',
        period: 'ok',
      },
      marginSource: 'cost',
      distinct: { channel: 1, region: 3, product: 3 },
      validMonths: 3,
      sums: { revenue: 1000, orders: 10, margin_source: 500 },
    };
    const resA = checkFeasibility('revenue_by_channel', factsA);
    expect(resA.feasible).toBe(false);
    if (!resA.feasible) {
      expect(resA.reason).toBe('Dữ liệu cột Kênh không đáng tin.');
    }

    // (b) product = missing and channel = unreliable: Missing triggers first
    const factsB: BusinessFacts = {
      rowCount: 5,
      roleStatus: {
        revenue: 'ok',
        orders: 'ok',
        cost: 'ok',
        profit: 'ok',
        product: 'missing',
        channel: 'unreliable',
        region: 'ok',
        period: 'ok',
      },
      marginSource: 'cost',
      distinct: { channel: 3, region: 3, product: 0 },
      validMonths: 3,
      sums: { revenue: 1000, orders: 10, margin_source: 500 },
    };
    const resB = checkFeasibility('channel_product_matrix', factsB);
    expect(resB.feasible).toBe(false);
    if (!resB.feasible) {
      expect(resB.reason).toBe('Thiếu cột Sản phẩm.');
    }

    // (c) revenue = unreliable and sums.revenue = 0: Unreliable triggers before positive_sum
    const factsC: BusinessFacts = {
      rowCount: 5,
      roleStatus: {
        revenue: 'unreliable',
        orders: 'ok',
        cost: 'ok',
        profit: 'ok',
        product: 'ok',
        channel: 'ok',
        region: 'ok',
        period: 'ok',
      },
      marginSource: 'cost',
      distinct: { channel: 3, region: 3, product: 3 },
      validMonths: 3,
      sums: { revenue: 0, orders: 10, margin_source: 500 },
    };
    const resC = checkFeasibility('total_revenue', factsC);
    expect(resC.feasible).toBe(false);
    if (!resC.feasible) {
      expect(resC.reason).toBe('Dữ liệu cột Doanh thu không đáng tin.');
    }
  });

  // T19: K11 (Có cả Giá vốn lẫn Lợi nhuận gộp)
  it('T19: K11 (both cogs & profit present) sets marginSource = cost; metrics 4 & 5 match true status', () => {
    const table = makeCaseTable([
      { label: 'Tháng', role: 'time', raw_labels: ['2026-01', '2026-02'] },
      { label: 'Kênh', role: 'dimension', categories: ['Website', 'Sàn TMĐT'], codes: [0, 1] },
      { label: 'Doanh thu', role: 'measure', values: [100, 200] },
      { label: 'Giá vốn', role: 'measure', values: [60, 110] },
      { label: 'Lợi nhuận gộp', role: 'measure', values: [40, 90] },
    ]);
    const roles = resolveBusinessRoles(table);
    const facts = buildBusinessFacts(table, roles);
    expect(facts.marginSource).toBe('cost');

    expect(checkFeasibility('gross_profit', facts).feasible).toBe(true);
    expect(checkFeasibility('gross_margin', facts).feasible).toBe(true);
  });
});
