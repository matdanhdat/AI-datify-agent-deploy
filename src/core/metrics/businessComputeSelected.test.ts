import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BusinessTable } from '../businessTable';
import { validateBytes } from '../validator';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';
import {
  computeSelected,
  findExtremesWithTies,
  evaluateCodeConfidence,
  generateCodeDataLimits,
} from './businessComputeSelected';
import { buildBusinessFactsFromSelected } from '../narrative/factsBuilder';
import { resolveBusinessRoles } from './businessRoles';

describe('businessComputeSelected - Single-pass Selective Calculator (Prompt 1D-1 Phần 1)', () => {
  // Helper to load and clean a sample file
  const loadCleanTable = async (relPath: string) => {
    const csvPath = path.resolve(__dirname, '../../../', relPath);
    const bytes = fs.readFileSync(csvPath);
    const val = await validateBytes(path.basename(relPath), new Uint8Array(bytes));
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) throw new Error('Validation failed');
    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const profile: any = {
      kind: 'business',
      total_rows: cleanRes.cleanTable.n,
      total_columns: cleanRes.cleanTable.columns.length,
      skipped_blank_rows: val.summary.skipped_blank_rows || 0,
      trimmed_cells_count: 0,
      exact_duplicates_count: 0,
      blank_dimension_cells_count: 0,
      columns_summary: [],
    };
    return {
      table: cleanRes.cleanTable,
      profile,
      droppedCount: cleanRes.droppedCount,
    };
  };

  describe('1. Chỉ-tính-đúng-chỉ-số-chọn (Selective computation)', () => {
    it('returns ONLY selected metric keys and computes no unrequested metrics', async () => {
      const { table, profile } = await loadCleanTable('samples/business/du-lieu-test-ban-le.csv');
      const selected = ['total_revenue'];
      const output = computeSelected(table, selected, { profile });

      // Only total_revenue is present in metrics object
      expect(Object.keys(output.metrics)).toEqual(['total_revenue']);
      expect(output.metrics.total_revenue.status).toBe('tính được');
      expect(output.metrics.total_revenue.answerText).toContain('1.135.530.000');

      // Unselected metrics are completely absent
      expect(output.metrics.total_orders).toBeUndefined();
      expect(output.metrics.aov).toBeUndefined();
      expect(output.metrics.gross_profit).toBeUndefined();
      expect(output.metrics.channel_product_matrix).toBeUndefined();
    });

    it('returns exactly two requested metrics when two are passed', async () => {
      const { table } = await loadCleanTable('samples/business/du-lieu-test-ban-le.csv');
      const selected = ['total_orders', 'aov'];
      const output = computeSelected(table, selected);

      expect(Object.keys(output.metrics).sort()).toEqual(['aov', 'total_orders']);
      expect(output.metrics.total_orders.answerText).toContain('3.342');
      expect(output.metrics.aov.answerText).toContain('339.775,58');
    });
  });

  describe('2. Hòa hạng (Strict tie-breaking)', () => {
    it('findExtremesWithTies correctly identifies ties in custom lists', () => {
      const items = [
        { name: 'A', score: 55.48 },
        { name: 'B', score: 55.48 },
        { name: 'C', score: 42.0 },
      ];
      const ext = findExtremesWithTies(items, (it) => it.score, true);
      expect(ext.hasMaxTie).toBe(true);
      expect(ext.maxItems.length).toBe(2);
      expect(ext.maxItems.map((i) => i.name)).toEqual(['A', 'B']);
      expect(ext.hasMinTie).toBe(false);
      expect(ext.minItems[0].name).toBe('C');
    });

    it('Retail Matrix: identifies tie in highest margin (Website × Túi tote & Cửa hàng × Túi tote at 55.48%)', async () => {
      const { table } = await loadCleanTable('samples/business/du-lieu-test-ban-le.csv');
      const output = computeSelected(table, ['channel_product_matrix']);

      const matrixRes = output.metrics.channel_product_matrix;
      expect(matrixRes).toBeDefined();
      expect(matrixRes.status).toBe('tính được');
      // Must contain both top combinations and the word "hòa"
      expect(matrixRes.answerText).toContain('hòa:');
      expect(matrixRes.answerText).toContain('Website × Túi tote');
      expect(matrixRes.answerText).toContain('Cửa hàng × Túi tote');
      expect(matrixRes.answerText).toContain('55,48%');
      // Lowest margin is unique: Sàn thương mại điện tử × Quần jeans at 42,39%
      expect(matrixRes.answerText).toContain('Sàn thương mại điện tử × Quần jeans');
      expect(matrixRes.answerText).toContain('42,39%');
    });

    it('Auto Regions: identifies tie in lowest revenue region (Hà Nội & Đà Nẵng at 48 tỷ)', async () => {
      const { table } = await loadCleanTable('samples/business/o-to-thieu-kenh-thieu-gia-von.csv');
      const output = computeSelected(table, ['revenue_by_region']);

      const regRes = output.metrics.revenue_by_region;
      expect(regRes).toBeDefined();
      expect(regRes.status).toBe('tính được');
      // Highest is TP.HCM (51.3 tỷ)
      expect(regRes.answerText).toContain('TP.HCM');
      expect(regRes.answerText).toContain('51.300.000.000 VND');
      // Lowest is tied: Hà Nội and Đà Nẵng at 43.05 tỷ
      expect(regRes.answerText).toContain('thấp nhất');
      expect(regRes.answerText).toContain('43.050.000.000 VND');
      expect(regRes.answerText).toContain('hòa:');
      expect(regRes.answerText).toMatch(/Đà Nẵng.*Hà Nội|Hà Nội.*Đà Nẵng/);
    });
  });

  describe('3. Độ tin cậy 4 ca (CAO / TRUNG BÌNH / THẤP / Chọn tay)', () => {
    it('Case 1 - CAO: thieu-gia-von selecting only feasible metrics', async () => {
      const { table } = await loadCleanTable('samples/business/thieu-gia-von-thieu-san-pham.csv');
      const feasible5 = [
        'total_revenue',
        'revenue_by_channel',
        'revenue_by_region',
        'revenue_by_month',
        'revenue_growth',
      ];
      const output = computeSelected(table, feasible5);

      expect(output.confidence.level).toBe('HIGH');
      expect(output.confidence.level_vi).toBe('CAO');
      expect(output.confidence.reasons.length).toBe(0);
    });

    it('Case 2 - TRUNG BÌNH: thieu-gia-von selecting all 13 metrics (has locked metrics)', async () => {
      const { table } = await loadCleanTable('samples/business/thieu-gia-von-thieu-san-pham.csv');
      const all13 = [
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
      const output = computeSelected(table, all13);

      expect(output.confidence.level).toBe('MEDIUM');
      expect(output.confidence.level_vi).toBe('TRUNG BÌNH');
      expect(output.confidence.reasons.some((r) => r.includes('bị khóa'))).toBe(true);
    });

    it('Case 3 - THẤP: cot-la-6-dong (6 rows < 10 rows)', async () => {
      const { table } = await loadCleanTable('samples/business/cot-la-6-dong.csv');
      const output = computeSelected(table, ['total_revenue']);

      expect(output.confidence.level).toBe('LOW');
      expect(output.confidence.level_vi).toBe('THẤP');
      expect(output.confidence.warning).toBe('Dữ liệu ít (6 dòng), kết luận chỉ mang tính tham khảo.');
      expect(output.confidence.reasons).toContain('Dữ liệu ít (6 dòng), kết luận chỉ mang tính tham khảo.');
    });

    it('Case 4 - Cột chọn tay: does NOT demote to medium/low purely because of user choice', async () => {
      const { table } = await loadCleanTable('samples/business/cot-la-6-dong.csv');
      // Simulate user manual role choice on revenue column
      const revCol = table.columns.find((c) => c.key === 'Khoản thu KH');
      if (revCol) {
        (revCol as any).userChosenRole = 'revenue';
      }
      const roles = resolveBusinessRoles(table);
      (roles.revenue as any).userChosen = true;

      // evaluate confidence directly with 50 rows simulated table to isolate userChosen check
      const mockTable: any = { ...table, n: 50 };
      const res = evaluateCodeConfidence(mockTable, roles, {}, 21000000, 12600000);

      // Not demoted to MEDIUM or LOW because of user choice
      expect(res.level).toBe('HIGH');
      expect(res.level_vi).toBe('CAO');
    });
  });

  describe('4. Giới hạn dữ liệu do CODE sinh (generateCodeDataLimits)', () => {
    it('generates accurate, code-driven limits from table state and locked metrics', async () => {
      const { table, profile } = await loadCleanTable('samples/business/thieu-gia-von-thieu-san-pham.csv');
      const all13 = [
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
      const output = computeSelected(table, all13, { profile });
      const directLimits = generateCodeDataLimits(table, resolveBusinessRoles(table), output.metrics, profile);
      expect(directLimits.length).toBeGreaterThan(0);

      expect(output.dataLimits.length).toBeGreaterThan(0);
      // Missing role columns
      expect(output.dataLimits.some((l) => l.includes('thiếu các cột vai trò'))).toBe(true);
      // Row counts
      expect(output.dataLimits.some((l) => l.includes('54 dòng hợp lệ sau làm sạch'))).toBe(true);
      // Locked metrics mentioned
      expect(output.dataLimits.some((l) => l.includes('bị khóa'))).toBe(true);
    });
  });

  describe('5. Chỉ số khóa trả lý do nguyên văn feasibility', () => {
    it('returns exact verbatim feasibility reasons for all 8 locked metrics on thieu-gia-von', async () => {
      const { table } = await loadCleanTable('samples/business/thieu-gia-von-thieu-san-pham.csv');
      const all13 = [
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
      const output = computeSelected(table, all13);

      // 5 feasible
      expect(output.metrics.total_revenue.status).toBe('tính được');
      expect(output.metrics.revenue_by_channel.status).toBe('tính được');
      expect(output.metrics.revenue_by_region.status).toBe('tính được');
      expect(output.metrics.revenue_by_month.status).toBe('tính được');
      expect(output.metrics.revenue_growth.status).toBe('tính được');

      // 8 locked with exact verbatim reasons from feasibility
      expect(output.metrics.total_orders.reason).toBe('Thiếu cột Số đơn.');
      expect(output.metrics.aov.reason).toBe('Thiếu cột Số đơn.');
      expect(output.metrics.gross_profit.reason).toBe('Thiếu cột Giá vốn hoặc Lợi nhuận gộp.');
      expect(output.metrics.gross_margin.reason).toBe('Thiếu cột Giá vốn hoặc Lợi nhuận gộp.');
      expect(output.metrics.revenue_by_product.reason).toBe('Thiếu cột Sản phẩm.');
      expect(output.metrics.margin_by_channel.reason).toBe('Thiếu cột Giá vốn hoặc Lợi nhuận gộp.');
      expect(output.metrics.margin_by_product.reason).toBe('Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.');
      expect(output.metrics.channel_product_matrix.reason).toBe(
        'Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.'
      );
    });
  });

  describe('6. factsBuilder integration (buildBusinessFactsFromSelected)', () => {
    it('creates enriched FactsTable connected to computeSelected with valid SHA-256 and < 4KB size', async () => {
      const { table } = await loadCleanTable('samples/business/du-lieu-test-ban-le.csv');
      const selected = ['total_revenue', 'total_orders', 'aov'];
      const factsTable = buildBusinessFactsFromSelected(table, selected);

      expect(factsTable.facts.length).toBe(3);
      expect(factsTable.hash).toHaveLength(64);
      expect(factsTable.byte_size).toBeLessThan(4096);
      expect(factsTable.confidence).toBeDefined();
      expect(factsTable.data_limits).toBeDefined();
      expect(factsTable.metrics_result).toBeDefined();
      expect(factsTable.selectedOutput).toBeDefined();
    });
  });

  describe('7. Prompt 2A-1 0c.1: evaluateCodeConfidence AOV unit threshold rules', () => {
    it('does NOT demote when orders mean is < 1000 but AOV is normal (100k)', () => {
      // 12 rows (>= 10 rows), revenue = 12 * 200,000 = 2,400,000. Orders = 12 * 2 = 24.
      // Orders mean = 2 (< 1,000). AOV = 2,400,000 / 24 = 100,000 (normal, between 1,000 and 50B).
      const n = 12;
      const fakeTable: BusinessTable = {
        kind: 'business',
        n,
        source_row: new Int32Array(n),
        columns: [
          {
            key: 'doanh_thu',
            label: 'Doanh thu',
            role: 'measure',
            values: new Float64Array(Array(n).fill(200000)),
          },
          {
            key: 'so_don',
            label: 'Số đơn',
            role: 'measure',
            values: new Float64Array(Array(n).fill(2)),
          },
        ],
      };
      const res = computeSelected(fakeTable, ['total_revenue', 'total_orders', 'aov']);
      expect(res.confidence.level).toBe('HIGH');
      expect(res.confidence.level_vi).toBe('CAO');
    });

    it('demotes to LOW when AOV is 500 đ (< 1,000 đ)', () => {
      // 12 rows, revenue = 12 * 1,000 = 12,000. Orders = 12 * 2 = 24.
      // AOV = 12,000 / 24 = 500 đ (< 1,000 đ).
      const n = 12;
      const fakeTable: BusinessTable = {
        kind: 'business',
        n,
        source_row: new Int32Array(n),
        columns: [
          {
            key: 'doanh_thu',
            label: 'Doanh thu',
            role: 'measure',
            values: new Float64Array(Array(n).fill(1000)),
          },
          {
            key: 'so_don',
            label: 'Số đơn',
            role: 'measure',
            values: new Float64Array(Array(n).fill(2)),
          },
        ],
      };
      const res = computeSelected(fakeTable, ['total_revenue', 'total_orders', 'aov']);
      expect(res.confidence.level).toBe('LOW');
      expect(res.confidence.level_vi).toBe('THẤP');
      expect(res.confidence.reasons.some((r) => r.includes('AOV = 500 đ') && r.includes('bất thường'))).toBe(true);
    });

    it('demotes to LOW when no orders column and avg revenue per row is 500 đ (< 1,000 đ)', () => {
      // 12 rows, revenue = 12 * 500 = 6,000. No orders column.
      // avgRev = 500 đ (< 1,000 đ).
      const n = 12;
      const fakeTable: BusinessTable = {
        kind: 'business',
        n,
        source_row: new Int32Array(n),
        columns: [
          {
            key: 'doanh_thu',
            label: 'Doanh thu',
            role: 'measure',
            values: new Float64Array(Array(n).fill(500)),
          },
        ],
      };
      const res = computeSelected(fakeTable, ['total_revenue']);
      expect(res.confidence.level).toBe('LOW');
      expect(res.confidence.level_vi).toBe('THẤP');
      expect(res.confidence.reasons.some((r) => r.includes('500 đ') && r.includes('bất thường'))).toBe(true);
    });
  });
});
