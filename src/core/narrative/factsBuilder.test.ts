import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../validator';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';
import { analyzeBusinessTable } from '../metrics/businessAnalyzer';
import { buildBusinessFactsTable } from './factsBuilder';

describe('factsBuilder - Business Facts Table', () => {
  it('preserves 100% exact Facts count (20) and Facts hash on du-lieu-test-ban-le.csv', async () => {
    const csvPath = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
    const csv = fs.readFileSync(csvPath);
    const val = await validateBytes('du-lieu-test-ban-le.csv', new Uint8Array(csv));
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
    const facts = buildBusinessFactsTable(anaRes.summary, { droppedRowsDuringClean: cleanRes.droppedCount });

    expect(facts.facts.length).toBe(20);
    expect(facts.hash).toBe('50e510a26173599fe282ac9961fa4d55c819f64797da44be8ccb8d8b7616856e');
  });

  it('omits facts for null metrics and missing product in thieu-gia-von-thieu-san-pham.csv', async () => {
    const csvPath = path.resolve(__dirname, '../../../samples/business/thieu-gia-von-thieu-san-pham.csv');
    const csv = fs.readFileSync(csvPath);
    const val = await validateBytes('thieu-gia-von-thieu-san-pham.csv', new Uint8Array(csv));
    expect(val.ok).toBe(true);
    if (!val.ok || !val.businessTable) return;

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
    const facts = buildBusinessFactsTable(anaRes.summary, { droppedRowsDuringClean: cleanRes.droppedCount });

    // Does NOT contain cogs, margin, profit, or orders facts
    expect(facts.facts.some((f) => f.label_vi.includes('Tổng giá vốn'))).toBe(false);
    expect(facts.facts.some((f) => f.label_vi.includes('Tổng lợi nhuận gộp'))).toBe(false);
    expect(facts.facts.some((f) => f.label_vi.includes('Biên lợi nhuận gộp'))).toBe(false);
    expect(facts.facts.some((f) => f.label_vi.includes('Tổng số đơn hàng'))).toBe(false);
    expect(facts.facts.some((f) => f.label_vi.includes('Sản phẩm'))).toBe(false);
    expect(facts.facts.some((f) => f.label_vi.includes('Top 3 sản phẩm'))).toBe(false);

    // Contains revenue fact
    expect(facts.facts.some((f) => f.label_vi.includes('Tổng doanh thu'))).toBe(true);
  });

  describe('E6: Facts Table robust against empty or missing months', () => {
    it('does not throw and omits month facts when by_month is empty', () => {
      const emptyMonthSummary: any = {
        kind: 'business',
        total_rows: 10,
        total_columns: 3,
        date_from: '',
        date_to: '',
        months_count: 0,
        totals: {
          orders: null,
          revenue: 10000000,
          cogs: null,
          profit: null,
          gross_margin_pct: null,
          aov: null,
        },
        by_channel: [],
        by_month: [],
        by_region: [],
        by_product: [],
        concentration: {
          top1_channel: null,
          top1_product: null,
          top3_products_share_pct: null,
          lowest_margin_product: null,
          lowest_revenue_region: null,
          unknown_region_revenue: 0,
          unknown_region_share_pct: 0,
          unknown_product_revenue: 0,
          unknown_product_share_pct: 0,
        },
        trend: {
          best_month: null,
          worst_month: null,
          latest_month: null,
          previous_month: null,
          latest_mom_delta: null,
          latest_mom_pct: null,
        },
        quality: {
          missing_numeric_cells: 0,
          unknown_classification_rows: 0,
          negative_profit_rows: 0,
        },
        column_roles: {
          id: '',
          time: '',
          dimensions: [],
          measures: ['revenue'],
        },
        role_mapping: {
          revenue: 'revenue',
          cogs: '',
          profit: '',
          orders: '',
          channel: '',
          time: '',
          region: '',
          product: '',
        },
      };

      expect(() => buildBusinessFactsTable(emptyMonthSummary)).not.toThrow();
      const facts = buildBusinessFactsTable(emptyMonthSummary);
      expect(facts.facts.some((f) => f.category === 'month')).toBe(false);
      expect(facts.facts.some((f) => f.display.includes('1970'))).toBe(false);
    });

    it('never emits a 1970 fact when dataset contains rows without month', async () => {
      const csvPath = path.resolve(__dirname, '../../../public/samples/file-mau-kinh-doanh.csv');
      const csv = fs.readFileSync(csvPath);
      const val = await validateBytes('file-mau-kinh-doanh.csv', new Uint8Array(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) return;

      const cleanRes = runBusinessCleanPipeline(val.businessTable);
      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
      const facts = buildBusinessFactsTable(anaRes.summary, { droppedRowsDuringClean: cleanRes.droppedCount });

      // No 1970 anywhere in facts
      for (const fact of facts.facts) {
        expect(fact.label_vi).not.toContain('1970');
        expect(fact.display).not.toContain('1970');
        if (typeof fact.value === 'string') {
          expect(fact.value).not.toContain('1970');
        }
      }
      expect(facts.period).toContain('2026-07 đến 2026-10 (4 tháng)');
    });
  });
});
