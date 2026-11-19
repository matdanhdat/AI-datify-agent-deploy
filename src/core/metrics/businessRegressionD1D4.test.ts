import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../validator';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';
import { analyzeBusinessTable } from './businessAnalyzer';
import { buildBusinessFactsTable } from '../narrative/factsBuilder';

describe('E5: Regression Test Suite for D1 to D4 Datasets (Prompt 1B-2)', () => {
  it('D1: samples/business/du-lieu-test-ban-le.csv matches exact baseline metrics, facts hash, and gate 1 stats', async () => {
    const filePath = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    expect(cleanRes.cleanTable.n).toBe(48);

    // Gate 1 Stats After
    const sAfter = cleanRes.statsAfter;
    expect(sAfter.orders).toBe(3342);
    expect(sAfter.revenue).toBe(1135530000);
    expect(sAfter.cogs).toBe(603680000);
    expect(sAfter.profit).toBe(531850000);
    expect(Number(sAfter.margin_pct?.toFixed(2))).toBe(46.84);
    expect(Number(sAfter.aov?.toFixed(2))).toBe(339775.58);

    // Analysis
    const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
    const sum = anaRes.summary;
    expect(sum.totals.orders).toBe(3342);
    expect(sum.totals.revenue).toBe(1135530000);
    expect(sum.totals.cogs).toBe(603680000);
    expect(sum.totals.profit).toBe(531850000);
    expect(Number(sum.totals.gross_margin_pct?.toFixed(2))).toBe(46.84);
    expect(Number(sum.totals.aov?.toFixed(2))).toBe(339775.58);
    expect(sum.months_count).toBe(4);
    expect(sum.by_month).toHaveLength(4);
    expect(sum.by_month.some((m) => m.key.startsWith('1970'))).toBe(false);
    expect(anaRes.rows_without_period ?? 0).toBe(0);

    // Facts Table
    const facts = buildBusinessFactsTable(sum, { droppedRowsDuringClean: cleanRes.droppedCount });
    expect(facts.facts.length).toBe(20);
    expect(facts.hash).toBe('50e510a26173599fe282ac9961fa4d55c819f64797da44be8ccb8d8b7616856e');
  });

  it('D2: samples/business/thieu-gia-von-thieu-san-pham.csv has nulls, no fallback fabrication, and exact facts hash', async () => {
    const filePath = path.resolve(__dirname, '../../../samples/business/thieu-gia-von-thieu-san-pham.csv');
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const val = await validateBytes('thieu-gia-von-thieu-san-pham.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    expect(cleanRes.cleanTable.n).toBe(54);

    // Gate 1 Stats After: orders/cogs/profit must be null, not 723.600.000
    const sAfter = cleanRes.statsAfter;
    expect(sAfter.orders).toBeNull();
    expect(sAfter.revenue).toBe(723600000);
    expect(sAfter.cogs).toBeNull();
    expect(sAfter.profit).toBeNull();
    expect(sAfter.margin_pct).toBeNull();
    expect(sAfter.aov).toBeNull();

    // Analysis
    const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
    const sum = anaRes.summary;
    expect(sum.totals.orders).toBeNull();
    expect(sum.totals.revenue).toBe(723600000);
    expect(sum.totals.cogs).toBeNull();
    expect(sum.totals.profit).toBeNull();
    expect(sum.totals.gross_margin_pct).toBeNull();
    expect(sum.totals.aov).toBeNull();
    expect(sum.months_count).toBe(6);
    expect(sum.by_month).toHaveLength(6);
    expect(sum.by_month.some((m) => m.key.startsWith('1970'))).toBe(false);
    expect(anaRes.rows_without_period ?? 0).toBe(0);

    // Facts Table
    const facts = buildBusinessFactsTable(sum, { droppedRowsDuringClean: cleanRes.droppedCount });
    expect(facts.facts.length).toBe(11);
    expect(facts.hash).toBe('0eb7e1a0ffc2bdbb9e0da95035a340e785a94a82a1c4e915aba35322512edb8e');
  });

  it('D3: public/samples/file-mau-kinh-doanh.csv has exactly 4 months, 0 rows without period, no 1970', async () => {
    const filePath = path.resolve(__dirname, '../../../public/samples/file-mau-kinh-doanh.csv');
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const val = await validateBytes('file-mau-kinh-doanh.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    expect(cleanRes.cleanTable.n).toBe(47);

    // Gate 1 Stats After
    const sAfter = cleanRes.statsAfter;
    expect(sAfter.orders).toBe(3280);
    expect(sAfter.revenue).toBe(1126974000);
    expect(sAfter.cogs).toBe(599402000);
    expect(sAfter.profit).toBe(527572000);
    expect(Number(sAfter.margin_pct?.toFixed(2))).toBe(46.81);
    expect(Number(sAfter.aov?.toFixed(2))).toBe(343589.63);

    // Analysis
    const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
    const sum = anaRes.summary;
    expect(sum.totals.orders).toBe(3280);
    expect(sum.totals.revenue).toBe(1126974000);
    expect(sum.totals.cogs).toBe(599402000);
    expect(sum.totals.profit).toBe(527572000);
    expect(Number(sum.totals.gross_margin_pct?.toFixed(2))).toBe(46.81);
    expect(Number(sum.totals.aov?.toFixed(2))).toBe(343589.63);

    expect(sum.months_count).toBe(4);
    expect(sum.by_month).toHaveLength(4);
    expect(sum.by_month.some((m) => m.key.startsWith('1970'))).toBe(false);
    expect(anaRes.rows_without_period ?? 0).toBe(0);

    // Facts Table
    const facts = buildBusinessFactsTable(sum, { droppedRowsDuringClean: cleanRes.droppedCount });
    expect(facts.facts.length).toBe(19);
    expect(facts.hash).toBe('d4221d602779f74dd78705c5159d6d4aea2a4a877eb79093c0461a9c53733661');
    for (const f of facts.facts) {
      expect(f.display).not.toContain('1970');
    }
  });

  it('D4: public/samples/file-mau-kinh-doanh.xlsx produces identical metrics to D3', async () => {
    const filePath = path.resolve(__dirname, '../../../public/samples/file-mau-kinh-doanh.xlsx');
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const val = await validateBytes('file-mau-kinh-doanh.xlsx', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    expect(cleanRes.cleanTable.n).toBe(47);

    // Gate 1 Stats After
    const sAfter = cleanRes.statsAfter;
    expect(sAfter.orders).toBe(3280);
    expect(sAfter.revenue).toBe(1126974000);
    expect(sAfter.cogs).toBe(599402000);
    expect(sAfter.profit).toBe(527572000);
    expect(Number(sAfter.margin_pct?.toFixed(2))).toBe(46.81);
    expect(Number(sAfter.aov?.toFixed(2))).toBe(343589.63);

    // Analysis
    const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
    const sum = anaRes.summary;
    expect(sum.totals.orders).toBe(3280);
    expect(sum.totals.revenue).toBe(1126974000);
    expect(sum.totals.cogs).toBe(599402000);
    expect(sum.totals.profit).toBe(527572000);
    expect(Number(sum.totals.gross_margin_pct?.toFixed(2))).toBe(46.81);
    expect(Number(sum.totals.aov?.toFixed(2))).toBe(343589.63);

    expect(sum.months_count).toBe(4);
    expect(sum.by_month).toHaveLength(4);
    expect(sum.by_month.some((m) => m.key.startsWith('1970'))).toBe(false);
    expect(anaRes.rows_without_period ?? 0).toBe(0);

    // Facts Table
    const facts = buildBusinessFactsTable(sum, { droppedRowsDuringClean: cleanRes.droppedCount });
    expect(facts.facts.length).toBe(19);
    expect(facts.hash).toBe('d4221d602779f74dd78705c5159d6d4aea2a4a877eb79093c0461a9c53733661');
    for (const f of facts.facts) {
      expect(f.display).not.toContain('1970');
    }
  });
});
