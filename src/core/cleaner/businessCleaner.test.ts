import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  removeBlankRows,
  trimWhitespace,
  dropExactDuplicates,
  fillBlankDimensionLabel,
  sortNatural,
  calculateBusinessProfile,
  generateBusinessProposals,
  runBusinessCleanPipeline,
  computeBusinessCanonicalHash,
  calculateBusinessAggregates,
} from './businessCleaner';
import { validateBytes } from '../validator';
import type { BusinessTable } from '../businessTable';

describe('Standardized Business Cleaning Engine (Prompt E1)', () => {
  const filePath = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
  const fileBytes = new Uint8Array(fs.readFileSync(filePath));

  async function loadTestTable(): Promise<BusinessTable> {
    const res = await validateBytes('du-lieu-test-ban-le.csv', fileBytes);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('Validation failed');
    expect(res.businessTable).toBeDefined();
    return res.businessTable!;
  }

  it('1. Verifies initial validation and table extraction', async () => {
    const table = await loadTestTable();
    // 52 lines in CSV (1 header + 50 data rows + 2 blank rows skipped during parsing)
    expect(table.n).toBe(50);
    expect(table.columns.length).toBe(9);
  });

  it('2. Operation 1: remove_blank_rows removes pure blank rows', async () => {
    const table = await loadTestTable();
    const res = removeBlankRows(table);
    // Since the 2 blank rows were skipped by parser, table has 50 valid content rows
    expect(res.table.n).toBe(50);
  });

  it('3. Operation 2: trim_whitespace trims 4 padded cells', async () => {
    const table = await loadTestTable();
    const res = trimWhitespace(table);
    expect(res.trimmed_cells).toBe(4);
    expect(res.table.n).toBe(50);

    // Verify the 4 trimmed cells
    const cols = res.changed_cells.map((c) => ({
      column: c.column,
      before: c.before,
      after: c.after,
    }));
    expect(cols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ before: ' Website ', after: 'Website' }),
        expect.objectContaining({ before: '  Miền Bắc', after: 'Miền Bắc' }),
        expect.objectContaining({ before: 'Túi tote ', after: 'Túi tote' }),
        expect.objectContaining({ before: 'Sàn thương mại điện tử ', after: 'Sàn thương mại điện tử' }),
      ])
    );
  });

  it('4. Operation 3: drop_exact_duplicates drops DS-008 and DS-043', async () => {
    const table = await loadTestTable();
    const trimmed = trimWhitespace(table).table;
    const res = dropExactDuplicates(trimmed);
    expect(res.dropped_rows).toBe(2);
    expect(res.table.n).toBe(48);
    expect(res.dropped_ids).toEqual(['DS-008', 'DS-043']);
  });

  it('5. Operation 4: fill_blank_dimension_label labels 3 empty dimension cells', async () => {
    const table = await loadTestTable();
    const trimmed = trimWhitespace(table).table;
    const deduped = dropExactDuplicates(trimmed).table;
    const res = fillBlankDimensionLabel(deduped, 'Không xác định');

    expect(res.filled_cells).toBe(3);
    expect(res.table.n).toBe(48);

    const changedIds = res.changed_cells.map((c) => c.original_id);
    expect(changedIds).toEqual(['DS-009', 'DS-024', 'DS-039']);
  });

  it('6. Operation 5: sort_natural sorts stably from DS-001 to DS-048', async () => {
    const table = await loadTestTable();
    const trimmed = trimWhitespace(table).table;
    const deduped = dropExactDuplicates(trimmed).table;
    const filled = fillBlankDimensionLabel(deduped, 'Không xác định').table;
    const sorted = sortNatural(filled);

    expect(sorted.n).toBe(48);
    const idCol = sorted.columns.find((c) => c.role === 'id') as { role: 'id'; values: string[] };
    expect(idCol.values[0]).toBe('DS-001');
    expect(idCol.values[47]).toBe('DS-048');

    // All IDs from DS-001 to DS-048 must be in consecutive order
    for (let i = 0; i < 48; i++) {
      const expectedId = `DS-${String(i + 1).padStart(3, '0')}`;
      expect(idCol.values[i]).toBe(expectedId);
    }
  });

  it('7. Full Pipeline Execution: matches exact aggregate numbers and breakdown', async () => {
    const table = await loadTestTable();
    const result = runBusinessCleanPipeline(table);

    expect(result.valid).toBe(true);
    expect(result.cleanTable.n).toBe(48);
    expect(result.droppedCount).toBe(2);

    // Exact totals from Prompt Section 5.3
    const stats = result.statsAfter;
    expect(stats.orders).toBe(3342);
    expect(stats.revenue).toBe(1135530000);
    expect(stats.cogs).toBe(603680000);
    expect(stats.profit).toBe(531850000);
    expect(Number(stats.margin_pct!.toFixed(2))).toBe(46.84);
    expect(Number(stats.aov!.toFixed(2))).toBe(339775.58);
  });

  it('8. Verifies detailed breakdowns by Channel, Month, Region, and Product', async () => {
    const table = await loadTestTable();
    const cleanTable = runBusinessCleanPipeline(table).cleanTable;
    const profile = calculateBusinessProfile(cleanTable);

    // Kênh bán
    const ch = profile.breakdown.by_channel;
    expect(ch['Website'].rows).toBe(16);
    expect(ch['Website'].orders).toBe(1313);
    expect(ch['Website'].revenue).toBe(454165000);
    expect(ch['Website'].cogs).toBe(237618000);
    expect(ch['Website'].profit).toBe(216547000);

    expect(ch['Cửa hàng'].rows).toBe(16);
    expect(ch['Cửa hàng'].orders).toBe(919);
    expect(ch['Cửa hàng'].revenue).toBe(313625000);
    expect(ch['Cửa hàng'].cogs).toBe(163622000);
    expect(ch['Cửa hàng'].profit).toBe(150003000);

    expect(ch['Sàn thương mại điện tử'].rows).toBe(16);
    expect(ch['Sàn thương mại điện tử'].orders).toBe(1110);
    expect(ch['Sàn thương mại điện tử'].revenue).toBe(367740000);
    expect(ch['Sàn thương mại điện tử'].cogs).toBe(202440000);
    expect(ch['Sàn thương mại điện tử'].profit).toBe(165300000);

    // Khu vực
    const reg = profile.breakdown.by_region;
    expect(reg['Miền Bắc'].rows).toBe(15);
    expect(reg['Miền Trung'].rows).toBe(16);
    expect(reg['Miền Nam'].rows).toBe(15);
    expect(reg['Không xác định'].rows).toBe(2);
    expect(reg['Không xác định'].orders).toBe(136);
    expect(reg['Không xác định'].revenue).toBe(26418000);
    expect(reg['Không xác định'].cogs).toBe(13634000);
    expect(reg['Không xác định'].profit).toBe(12784000);

    // Sản phẩm
    const prod = profile.breakdown.by_product;
    expect(prod['Áo thun'].rows).toBe(12);
    expect(prod['Sơ mi'].rows).toBe(12);
    expect(prod['Quần jeans'].rows).toBe(11);
    expect(prod['Túi tote'].rows).toBe(12);
    expect(prod['Không xác định'].rows).toBe(1);
    expect(prod['Không xác định'].orders).toBe(80);
    expect(prod['Không xác định'].revenue).toBe(45520000);
    expect(prod['Không xác định'].cogs).toBe(25440000);
    expect(prod['Không xác định'].profit).toBe(20080000);
  });

  it('9. Verifies Canonical SHA-256 hash determinism', async () => {
    const table = await loadTestTable();
    const clean1 = runBusinessCleanPipeline(table).cleanTable;
    const clean2 = runBusinessCleanPipeline(table).cleanTable;

    const hash1 = await computeBusinessCanonicalHash(clean1);
    const hash2 = await computeBusinessCanonicalHash(clean2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('10. Proposals generation returns 5 discrete proposals', async () => {
    const table = await loadTestTable();
    const profile = calculateBusinessProfile(table);
    const proposals = generateBusinessProposals(table, profile);

    expect(proposals).toHaveLength(5);
    expect(proposals.map((p) => p.op)).toEqual([
      'remove_blank_rows',
      'trim_whitespace',
      'drop_exact_duplicates',
      'fill_blank_dimension_label',
      'sort_natural',
    ]);
  });

  describe('E1: calculateBusinessAggregates strict role resolution without silent fallbacks', () => {
    it('(a) table with only revenue + dimension -> orders/cogs/profit null, revenue correct, margin/aov null', async () => {
      const csv = [
        'Tháng,Khu vực,Doanh thu',
        '2026-07,Miền Bắc,10000000',
        '2026-08,Miền Nam,20000000',
        '2026-09,Miền Trung,15000000',
        '2026-10,Miền Bắc,12000000',
        '2026-11,Miền Nam,18000000',
      ].join('\r\n');
      const val = await validateBytes('only_revenue.csv', new TextEncoder().encode(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) throw new Error('Validation failed');
      const res = calculateBusinessAggregates(val.businessTable);
      const agg = res.aggregates;
      expect(agg.total_revenue).toBe(75000000);
      expect(agg.total_orders).toBeNull();
      expect(agg.total_cogs).toBeNull();
      expect(agg.total_profit).toBeNull();
      expect(agg.gross_margin_pct).toBeNull();
      expect(agg.aov).toBeNull();
    });

    it('(b) table with revenue + unknown numeric column ("Số lượng tồn") -> orders remains null', async () => {
      const csv = [
        'Khu vực,Doanh thu,Số lượng tồn',
        'Miền Bắc,10000000,500',
        'Miền Nam,20000000,300',
        'Miền Trung,15000000,200',
        'Miền Tây,12000000,100',
        'Miền Đông,18000000,400',
      ].join('\r\n');
      const val = await validateBytes('unknown_measure.csv', new TextEncoder().encode(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) throw new Error('Validation failed');
      const res = calculateBusinessAggregates(val.businessTable);
      const agg = res.aggregates;
      expect(agg.total_revenue).toBe(75000000);
      expect(agg.total_orders).toBeNull();
    });

    it('(c) table with revenue + cogs without profit -> calculates profit and margin_pct', async () => {
      const csv = [
        'Khu vực,Doanh thu,Giá vốn',
        'Miền Bắc,10000000,6000000',
        'Miền Nam,20000000,12000000',
        'Miền Trung,15000000,9000000',
        'Miền Tây,12000000,7000000',
        'Miền Đông,18000000,11000000',
      ].join('\r\n');
      const val = await validateBytes('revenue_cogs.csv', new TextEncoder().encode(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) throw new Error('Validation failed');
      const res = calculateBusinessAggregates(val.businessTable);
      const agg = res.aggregates;
      expect(agg.total_revenue).toBe(75000000);
      expect(agg.total_cogs).toBe(45000000);
      expect(agg.total_profit).toBe(30000000);
      expect(agg.gross_margin_pct).toBe(40);
    });

    it('(d) table with all-zero cogs -> cogs_untrusted: profit and cogs are null, margin_pct null', async () => {
      const csv = [
        'Khu vực,Doanh thu,Giá vốn',
        'Miền Bắc,10000000,0',
        'Miền Nam,20000000,0',
        'Miền Trung,15000000,0',
        'Miền Tây,12000000,0',
        'Miền Đông,18000000,0',
      ].join('\r\n');
      const val = await validateBytes('zero_cogs.csv', new TextEncoder().encode(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) throw new Error('Validation failed');
      const res = calculateBusinessAggregates(val.businessTable);
      const agg = res.aggregates;
      expect(agg.total_revenue).toBe(75000000);
      expect(agg.total_cogs).toBeNull();
      expect(agg.total_profit).toBeNull();
      expect(agg.gross_margin_pct).toBeNull();
    });

    it('(e) standard retail baseline du-lieu-test-ban-le.csv matches exact numbers for statsBefore and statsAfter', async () => {
      const table = await loadTestTable();
      const pipe = runBusinessCleanPipeline(table);

      // Raw statsBefore
      expect(pipe.statsBefore.orders).toBe(3431);
      expect(pipe.statsBefore.revenue).toBe(1172923000);
      expect(pipe.statsBefore.cogs).toBe(624014000);
      expect(pipe.statsBefore.profit).toBe(548909000);
      expect(Number(pipe.statsBefore.margin_pct?.toFixed(2))).toBe(46.80);
      expect(Number(pipe.statsBefore.aov?.toFixed(2))).toBe(341860.39);

      // Clean statsAfter
      expect(pipe.statsAfter.orders).toBe(3342);
      expect(pipe.statsAfter.revenue).toBe(1135530000);
      expect(pipe.statsAfter.cogs).toBe(603680000);
      expect(pipe.statsAfter.profit).toBe(531850000);
      expect(Number(pipe.statsAfter.margin_pct?.toFixed(2))).toBe(46.84);
      expect(Number(pipe.statsAfter.aov?.toFixed(2))).toBe(339775.58);
    });
  });
});
