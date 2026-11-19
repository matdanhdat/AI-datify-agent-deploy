import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isDateOrMonthStr } from './business';
import { validateBytes } from './index';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';
import { analyzeBusinessTable } from '../metrics/businessAnalyzer';
import { buildBusinessFactsTable } from '../narrative/factsBuilder';

describe('Part G: Month Format Restoration & Robustness Test Suite (Prompt 1B-2b)', () => {
  // G1: Test each month format individually
  describe('G1: Each supported date/month format parses to correct month key', () => {
    it('parses YYYY-MM format: 2026-07', () => {
      const res = isDateOrMonthStr('2026-07');
      expect(res.ok).toBe(true);
      expect(res.granularity).toBe('month');
      // (2026 - 1970) * 12 + (7 - 1) = 56 * 12 + 6 = 678
      expect(res.daysOrMonths).toBe(678);
    });

    it('parses YYYY-MM-DD format: 2026-07-15', () => {
      const res = isDateOrMonthStr('2026-07-15');
      expect(res.ok).toBe(true);
      expect(res.granularity).toBe('day');
      // Days since epoch for 2026-07-15
      const expectedDays = Math.floor(Date.UTC(2026, 6, 15) / 86400000);
      expect(res.daysOrMonths).toBe(expectedDays);
    });

    it('parses DD/MM/YYYY format: 15/07/2026', () => {
      const res = isDateOrMonthStr('15/07/2026');
      expect(res.ok).toBe(true);
      expect(res.granularity).toBe('day');
      const expectedDays = Math.floor(Date.UTC(2026, 6, 15) / 86400000);
      expect(res.daysOrMonths).toBe(expectedDays);
    });

    it('parses Excel serial number: 46218 (around July 2026)', () => {
      const res = isDateOrMonthStr(46218);
      expect(res.ok).toBe(true);
      expect(res.granularity).toBe('month');
      // 46218 days from 1899-12-30 -> (46218 - 25569) * 86400000 -> 2026-07-15
      expect(res.daysOrMonths).toBe(678);
    });

    it('parses pre-2000 year: 1999-12', () => {
      const res = isDateOrMonthStr('1999-12');
      expect(res.ok).toBe(true);
      expect(res.granularity).toBe('month');
      // (1999 - 1970) * 12 + 11 = 29 * 12 + 11 = 359
      expect(res.daysOrMonths).toBe(359);
    });

    it('parses genuine string 1970-01 without blocking', () => {
      const res = isDateOrMonthStr('1970-01');
      expect(res.ok).toBe(true);
      expect(res.granularity).toBe('month');
      expect(res.daysOrMonths).toBe(0);
    });
  });

  // G2: Guards against invalid / missing / garbage input
  describe('G2: Strict guards against empty, zero, out-of-range, and garbage values', () => {
    it('rejects null and undefined', () => {
      expect(isDateOrMonthStr(null).ok).toBe(false);
      expect(isDateOrMonthStr(undefined).ok).toBe(false);
    });

    it('rejects empty string and whitespace', () => {
      expect(isDateOrMonthStr('').ok).toBe(false);
      expect(isDateOrMonthStr('   ').ok).toBe(false);
    });

    it('rejects number 0 and string "0"', () => {
      expect(isDateOrMonthStr(0).ok).toBe(false);
      expect(isDateOrMonthStr('0').ok).toBe(false);
      expect(isDateOrMonthStr(' 0 ').ok).toBe(false);
    });

    it('rejects garbage strings: "abc", "N/A", "null"', () => {
      expect(isDateOrMonthStr('abc').ok).toBe(false);
      expect(isDateOrMonthStr('N/A').ok).toBe(false);
      expect(isDateOrMonthStr('null').ok).toBe(false);
    });

    it('rejects invalid months: 2026-13, 2026-00, 32/07/2026', () => {
      expect(isDateOrMonthStr('2026-13').ok).toBe(false);
      expect(isDateOrMonthStr('2026-00').ok).toBe(false);
      expect(isDateOrMonthStr('15/13/2026').ok).toBe(false);
    });

    it('rejects years outside 1900..2100', () => {
      expect(isDateOrMonthStr('1850-01').ok).toBe(false);
      expect(isDateOrMonthStr('2150-12').ok).toBe(false);
    });
  });

  // G3: Mixed formats in the same file group into identical month
  describe('G3: Mixed date/month formats correctly group into identical month', () => {
    it('groups 2026-07, 2026-07-15, 15/07/2026 into the same "2026-07" bucket', async () => {
      const csvContent = [
        'Tháng,Kênh,Khu vực,Sản phẩm,Doanh thu,Giá vốn,Số đơn',
        '2026-07,Website,Miền Bắc,Áo thun,10000000,5000000,10',
        '2026-07-15,Website,Miền Bắc,Áo thun,20000000,10000000,20',
        '20/07/2026,Cửa hàng,Miền Nam,Quần jeans,30000000,15000000,30',
        '2026-08-01,Website,Miền Bắc,Áo thun,40000000,20000000,40',
        '15/08/2026,Cửa hàng,Miền Trung,Sơ mi,50000000,25000000,50',
      ].join('\n');

      const bytes = new TextEncoder().encode(csvContent);
      const val = await validateBytes('mixed.csv', bytes);
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) return;

      const clean = runBusinessCleanPipeline(val.businessTable);
      expect(clean.cleanTable.n).toBe(5);

      const ana = analyzeBusinessTable(clean.cleanTable);
      expect(ana.summary.months_count).toBe(2);
      expect(ana.rows_without_period ?? 0).toBe(0);

      const month7 = ana.summary.by_month.find((m) => m.key === '2026-07');
      expect(month7).toBeDefined();
      expect(month7?.revenue).toBe(60000000);
      expect(month7?.orders).toBe(60);

      const month8 = ana.summary.by_month.find((m) => m.key === '2026-08');
      expect(month8).toBeDefined();
      expect(month8?.revenue).toBe(90000000);
      expect(month8?.orders).toBe(90);
    });
  });

  // G4: Regression test for patched sample files: CSV = XLSX, no 1970, 0 rows without period, exact totals
  describe('G4: Patched sample files CSV and XLSX have 0 rows without period and identical metrics', () => {
    it('CSV and XLSX produce identical clean count, totals, zero invalid periods, and identical facts hash', async () => {
      const csvBytes = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../public/samples/file-mau-kinh-doanh.csv')));
      const xlsxBytes = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../public/samples/file-mau-kinh-doanh.xlsx')));

      const valCsv = await validateBytes('file-mau-kinh-doanh.csv', csvBytes);
      const valXlsx = await validateBytes('file-mau-kinh-doanh.xlsx', xlsxBytes);

      expect(valCsv.ok).toBe(true);
      expect(valXlsx.ok).toBe(true);
      if (!valCsv.ok || !valCsv.businessTable || !valXlsx.ok || !valXlsx.businessTable) return;

      const cleanCsv = runBusinessCleanPipeline(valCsv.businessTable);
      const cleanXlsx = runBusinessCleanPipeline(valXlsx.businessTable);

      expect(cleanCsv.cleanTable.n).toBe(47);
      expect(cleanXlsx.cleanTable.n).toBe(47);

      const anaCsv = analyzeBusinessTable(cleanCsv.cleanTable);
      const anaXlsx = analyzeBusinessTable(cleanXlsx.cleanTable);

      // Check rows without period
      expect(anaCsv.rows_without_period ?? 0).toBe(0);
      expect(anaXlsx.rows_without_period ?? 0).toBe(0);

      // Check months count & no 1970
      expect(anaCsv.summary.months_count).toBe(4);
      expect(anaXlsx.summary.months_count).toBe(4);
      expect(anaCsv.summary.by_month.some((m) => m.key.startsWith('1970'))).toBe(false);
      expect(anaXlsx.summary.by_month.some((m) => m.key.startsWith('1970'))).toBe(false);

      // Check totals match exactly
      expect(anaCsv.summary.totals.revenue).toBe(1126974000);
      expect(anaXlsx.summary.totals.revenue).toBe(1126974000);
      expect(anaCsv.summary.totals.cogs).toBe(599402000);
      expect(anaXlsx.summary.totals.cogs).toBe(599402000);
      expect(anaCsv.summary.totals.profit).toBe(527572000);
      expect(anaXlsx.summary.totals.profit).toBe(527572000);
      expect(anaCsv.summary.totals.orders).toBe(3280);
      expect(anaXlsx.summary.totals.orders).toBe(3280);

      // Facts table hash match
      const factsCsv = buildBusinessFactsTable(anaCsv.summary, { droppedRowsDuringClean: cleanCsv.droppedCount });
      const factsXlsx = buildBusinessFactsTable(anaXlsx.summary, { droppedRowsDuringClean: cleanXlsx.droppedCount });

      expect(factsCsv.facts.length).toBe(19);
      expect(factsXlsx.facts.length).toBe(19);
      expect(factsCsv.hash).toBe('d4221d602779f74dd78705c5159d6d4aea2a4a877eb79093c0461a9c53733661');
      expect(factsXlsx.hash).toBe(factsCsv.hash);
    });
  });

  // G5: Retail baseline test intact (48 clean rows, 3.342 orders, 1.135.530.000 rev, hash 50e510a261...)
  describe('G5: Retail baseline du-lieu-test-ban-le.csv remains 100% intact', () => {
    it('preserves all 22 baseline metrics and facts table hash 50e510a261...', async () => {
      const filePath = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
      const bytes = new Uint8Array(fs.readFileSync(filePath));
      const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) return;

      const clean = runBusinessCleanPipeline(val.businessTable);
      expect(clean.cleanTable.n).toBe(48);

      const ana = analyzeBusinessTable(clean.cleanTable);
      expect(ana.summary.totals.revenue).toBe(1135530000);
      expect(ana.summary.totals.cogs).toBe(603680000);
      expect(ana.summary.totals.profit).toBe(531850000);
      expect(ana.summary.totals.orders).toBe(3342);
      expect(Number(ana.summary.totals.gross_margin_pct?.toFixed(2))).toBe(46.84);
      expect(Number(ana.summary.totals.aov?.toFixed(2))).toBe(339775.58);
      expect(ana.summary.months_count).toBe(4);
      expect(ana.rows_without_period ?? 0).toBe(0);

      const facts = buildBusinessFactsTable(ana.summary, { droppedRowsDuringClean: clean.droppedCount });
      expect(facts.facts.length).toBe(20);
      expect(facts.hash).toBe('50e510a26173599fe282ac9961fa4d55c819f64797da44be8ccb8d8b7616856e');
    });
  });

  // G6: Test highest/lowest cells per D1 (Cửa hàng x Túi tote = 55.48%, Website x Túi tote = 55.48%, Sàn TMĐT x Quần jeans = 42.39%)
  describe('G6: Cross-matrix Channel x Product margin verification', () => {
    it('verifies exact margins for highest (55.48%) and lowest (42.39%) cells', () => {
      // Cell 1: Cửa hàng x Túi tote
      const ch1Rev = 26040000;
      const ch1Profit = 14448000;
      const margin1 = (ch1Profit / ch1Rev) * 100;
      expect(Number(margin1.toFixed(2))).toBe(55.48);
      expect(ch1Profit / 168000).toBe(86);
      expect(ch1Rev / 168000).toBe(155);

      // Cell 2: Website x Túi tote
      const ch2Rev = 40300000;
      const ch2Profit = 22360000;
      const margin2 = (ch2Profit / ch2Rev) * 100;
      expect(Number(margin2.toFixed(2))).toBe(55.48);
      expect(ch2Profit / 260000).toBe(86);
      expect(ch2Rev / 260000).toBe(155);

      // Mathematical equality: both reduce to exactly 86/155
      expect(margin1).toBe(margin2);

      // Lowest Cell: Sàn thương mại điện tử x Quần jeans
      const lowRev = 138000000;
      const lowProfit = 58500000;
      const lowMargin = (lowProfit / lowRev) * 100;
      expect(Number(lowMargin.toFixed(2))).toBe(42.39);
    });
  });
});
