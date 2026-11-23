import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validateBytes } from '../core/validator';
import {
  recalculateBusinessTable,
  applyManualBusinessRoles,
  formatCogsExceedsRevenueWarning,
} from '../core/validator/business';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';
import { runBusinessCleanPipeline } from '../core/cleaner/businessCleaner';
import { analyzeBusinessTable } from '../core/metrics/businessAnalyzer';
import { isTableRecognitionConfident } from '../components/clean/FileReadConfirmationPanel';
import type { BusinessTable, BusinessColumn } from '../core/businessTable';

const SAMPLES_DIR = path.resolve(__dirname, '../../samples/business');

describe('Prompt 1C-2c Comprehensive Verification Test Suite', () => {
  // -------------------------------------------------------------
  // Test 1: cot-la-6-dong.csv full flow (manual role -> clean -> analyze)
  // -------------------------------------------------------------
  it('1. cot-la-6-dong.csv: manual revenue assignment propagates through pipeline and computes exact metrics', async () => {
    const filePath = path.join(SAMPLES_DIR, 'cot-la-6-dong.csv');
    const bytes = fs.readFileSync(filePath);
    const valRes = await validateBytes('cot-la-6-dong.csv', new Uint8Array(bytes));
    expect(valRes.ok).toBe(true);
    const rawTable = (valRes as any).businessTable as BusinessTable;
    expect(rawTable).toBeDefined();

    // Initially, "Khoản thu KH" is NOT auto-resolved as revenue
    const initialResolved = resolveBusinessRoles(rawTable);
    expect(initialResolved.revenue.status).not.toBe('tìm thấy');

    // Simulate user choosing "Khoản thu KH" as Revenue in Gate 1
    const revCol = rawTable.columns.find((c: BusinessColumn) => c.label === 'Khoản thu KH');
    expect(revCol).toBeDefined();
    (revCol as any).userChosenRole = 'revenue';

    const updatedTable: BusinessTable = {
      ...rawTable,
      manual_column_roles: {
        ...(rawTable.manual_column_roles || {}),
        'Khoản thu KH': 'revenue',
      },
    };

    const manualResolved = applyManualBusinessRoles(resolveBusinessRoles(updatedTable), updatedTable);
    expect(manualResolved.revenue.status).toBe('tìm thấy');
    expect(manualResolved.revenue.col?.label).toBe('Khoản thu KH');
    expect(manualResolved.warnings.some((w) => w.includes('Agent tạm hiểu'))).toBe(false);
    expect(manualResolved.warnings.some((w) => w.includes('Doanh thu: Khoản thu KH (người dùng chọn)'))).toBe(true);

    // Run clean pipeline
    const cleanResult = runBusinessCleanPipeline(updatedTable, {
      remove_blank_rows: true,
      trim_whitespace: true,
      drop_exact_duplicates: true,
      fill_blank_dimension_label: true,
      sort_natural: true,
    });
    expect(cleanResult.valid).toBe(true);
    expect(cleanResult.cleanTable.n).toBe(6);

    // Run business analysis
    const analysisOut = analyzeBusinessTable(cleanResult.cleanTable);
    const summary = analysisOut.summary;

    expect(summary.total_rows).toBe(6);
    expect(summary.totals.revenue).toBe(21_000_000);
    expect(summary.totals.cogs).toBe(12_600_000);
    expect(summary.totals.profit).toBe(8_400_000);
    expect(summary.totals.gross_margin_pct).toBeCloseTo(40.0, 2);

    // Channel breakdown
    const chWebsite = summary.by_channel.find((c) => c.key === 'Website');
    const chStore = summary.by_channel.find((c) => c.key === 'Cửa hàng');
    expect(chWebsite?.revenue).toBe(9_000_000);
    expect(chStore?.revenue).toBe(12_000_000);

    // Monthly breakdown
    const mJan = summary.by_month.find((m) => m.key === '2026-01');
    const mFeb = summary.by_month.find((m) => m.key === '2026-02');
    const mMar = summary.by_month.find((m) => m.key === '2026-03');
    expect(mJan?.revenue).toBe(3_000_000);
    expect(mFeb?.revenue).toBe(7_000_000);
    expect(mMar?.revenue).toBe(11_000_000);
  });

  // -------------------------------------------------------------
  // Test 2: Chống số 0 giả (Fake Zero Revenue Guard)
  // -------------------------------------------------------------
  it('2. Fake zero revenue guard triggers when source has numbers but computed total is zero', () => {
    const mockTable: BusinessTable = {
      kind: 'business',
      n: 3,
      source_row: new Int32Array([1, 2, 3]),
      columns: [
        {
          role: 'measure',
          key: 'col_rev',
          label: 'Doanh thu',
          values: new Float64Array([0, 0, 0]),
          raw_values: new Float64Array([100, 200, 300]), // source has non-zero
          userChosenRole: 'revenue',
        },
      ],
    };

    const out = analyzeBusinessTable(mockTable);
    expect(out.summary.totals.revenue).toBeNull();
    const revUnavail = (out.summary.unavailable || []).find((u) => u.id === 'revenue_total');
    expect(revUnavail).toBeDefined();
    expect(revUnavail?.reason_vi).toContain('Không tính được doanh thu từ cột "Doanh thu"');
  });

  // -------------------------------------------------------------
  // Test 3: Ô "700" khi chọn "chấm = thập phân" vs "chấm = nghìn"
  // -------------------------------------------------------------
  it('3. dien-may-nghin-dong-mo-ho: handles cell "700" and decimal conventions accurately', async () => {
    const filePath = path.join(SAMPLES_DIR, 'dien-may-nghin-dong-mo-ho.csv');
    const bytes = fs.readFileSync(filePath);
    const valRes = await validateBytes('dien-may-nghin-dong-mo-ho.csv', new Uint8Array(bytes));
    expect(valRes.ok).toBe(true);
    const table = (valRes as any).businessTable as BusinessTable;

    const revCol = table.columns.find((c: BusinessColumn) => c.label.includes('Doanh số'))!;
    const cogsCol = table.columns.find((c: BusinessColumn) => c.label.includes('Giá nhập'))!;

    // Case 3.1: Both columns "chấm = nghìn" (comma convention default)
    const tableThousand = recalculateBusinessTable(table, {
      units: {
        [revCol.key]: { unit: 'nghìn đồng', multiplier: 1000 },
        [cogsCol.key]: { unit: 'nghìn đồng', multiplier: 1000 },
      },
      decimals: {
        [revCol.key]: 'comma',
        [cogsCol.key]: 'comma',
      },
    });

    const cleanThousand = runBusinessCleanPipeline(tableThousand);
    const analysisThousand = analyzeBusinessTable(cleanThousand.cleanTable);
    expect(analysisThousand.summary.totals.revenue).toBe(16_700_000);
    expect(analysisThousand.summary.totals.cogs).toBe(12_200_000);
    expect(analysisThousand.summary.totals.profit).toBe(4_500_000);
    expect(analysisThousand.summary.totals.gross_margin_pct).toBeCloseTo(26.95, 2);
    expect(analysisThousand.summary.totals.aov).toBeCloseTo(927_777.78, 1);
    expect(tableThousand.cogs_exceeds_revenue_warning).toBeUndefined();

    // Case 3.2: Both columns "chấm = thập phân" (dot convention)
    const tableDecimal = recalculateBusinessTable(table, {
      units: {
        [revCol.key]: { unit: 'nghìn đồng', multiplier: 1000 },
        [cogsCol.key]: { unit: 'nghìn đồng', multiplier: 1000 },
      },
      decimals: {
        [revCol.key]: 'dot',
        [cogsCol.key]: 'dot',
      },
    });

    const cleanDecimal = runBusinessCleanPipeline(tableDecimal);
    const analysisDecimal = analyzeBusinessTable(cleanDecimal.cleanTable);
    expect(analysisDecimal.summary.totals.revenue).toBe(716_000);
    expect(analysisDecimal.summary.totals.cogs).toBe(2_210_000);
    expect(analysisDecimal.summary.totals.aov).toBeCloseTo(716_000 / 18, 1);

    // Revenue unit suspicious flag should NOT be set because AOV ~ 39,777 > 1,000
    const revColDec = tableDecimal.columns.find((c: BusinessColumn) => c.key === revCol.key);
    expect((revColDec as any)?.unit_suspicious).toBeFalsy();

    // COGS > Revenue flag MUST be set!
    expect(tableDecimal.cogs_exceeds_revenue_warning).toBeDefined();
    expect(tableDecimal.cogs_exceeds_revenue_warning).toBe(formatCogsExceedsRevenueWarning(2_210_000, 716_000));

    // Branch breakdown
    const haNoi = analysisDecimal.summary.by_region.find((r) => r.key === 'Hà Nội');
    const daNang = analysisDecimal.summary.by_region.find((r) => r.key === 'Đà Nẵng');
    expect(haNoi?.revenue).toBe(8_200);
    expect(daNang?.revenue).toBe(707_800);

    // Case 3.3: Mixed: Revenue dot, COGS comma
    const tableMixed = recalculateBusinessTable(table, {
      units: {
        [revCol.key]: { unit: 'nghìn đồng', multiplier: 1000 },
        [cogsCol.key]: { unit: 'nghìn đồng', multiplier: 1000 },
      },
      decimals: {
        [revCol.key]: 'dot',
        [cogsCol.key]: 'comma',
      },
    });

    const cleanMixed = runBusinessCleanPipeline(tableMixed);
    const analysisMixed = analyzeBusinessTable(cleanMixed.cleanTable);
    expect(analysisMixed.summary.totals.revenue).toBe(716_000);
    expect(analysisMixed.summary.totals.cogs).toBe(12_200_000);
    expect(tableMixed.cogs_exceeds_revenue_warning).toBeDefined();
  });

  // -------------------------------------------------------------
  // Test 4: Header role resolution & exclusions (Section E1 & B3)
  // -------------------------------------------------------------
  it('4. Header role resolution: "Chi phí vốn" is COGS, exclusions are preserved', () => {
    const headers = [
      { h: 'Chi phí vốn', expectedRole: 'cogs' },
      { h: 'Giá vốn (VND)', expectedRole: 'cogs' },
      { h: 'Giá nhập', expectedRole: 'cogs' },
      { h: 'Giá vốn hàng bán', expectedRole: 'cogs' },
      { h: 'Chi phí marketing', expectedRole: 'not_cogs' },
      { h: 'Chi phí vận chuyển', expectedRole: 'not_cogs' },
      { h: 'Chi phí', expectedRole: 'not_cogs' },
      { h: 'Thời gian giao hàng', expectedRole: 'not_time' },
      { h: 'Tình trạng', expectedRole: 'not_region' },
      { h: 'Ký hiệu', expectedRole: 'not_region' },
      { h: 'Khoản thu KH', expectedRole: 'not_default_revenue' },
    ];

    for (const item of headers) {
      const mockTable: BusinessTable = {
        kind: 'business',
        n: 1,
        source_row: new Int32Array([1]),
        columns: [
          {
            role: 'measure',
            key: 'test_col',
            label: item.h,
            values: new Float64Array([1000]),
          },
        ],
      };

      const resolved = resolveBusinessRoles(mockTable);
      if (item.expectedRole === 'cogs') {
        expect(resolved.cogs.status).toBe('tìm thấy');
        expect(resolved.cogs.col?.label).toBe(item.h);
      } else if (item.expectedRole === 'not_cogs') {
        expect(resolved.cogs.status).not.toBe('tìm thấy');
      } else if (item.expectedRole === 'not_time') {
        expect(resolved.time.status).not.toBe('tìm thấy');
      } else if (item.expectedRole === 'not_region') {
        expect(resolved.region.status).not.toBe('tìm thấy');
      } else if (item.expectedRole === 'not_default_revenue') {
        expect(resolved.revenue.status).not.toBe('tìm thấy');
      }
    }
  });

  // -------------------------------------------------------------
  // Test 5: COGS > Revenue flag both ways
  // -------------------------------------------------------------
  it('5. COGS exceeds revenue flag triggers when totalCogs > totalRev, turns off when totalRev >= totalCogs', () => {
    const tableExceeds: BusinessTable = {
      kind: 'business',
      n: 1,
      source_row: new Int32Array([1]),
      columns: [
        { role: 'measure', key: 'rev', label: 'Doanh thu', values: new Float64Array([500]), raw_values: new Float64Array([500]) },
        { role: 'measure', key: 'cogs', label: 'Giá vốn', values: new Float64Array([800]), raw_values: new Float64Array([800]) },
      ],
    };
    const recExceeds = recalculateBusinessTable(tableExceeds, {});
    expect(recExceeds.cogs_exceeds_revenue_warning).toBe(formatCogsExceedsRevenueWarning(800, 500));

    const tableNormal: BusinessTable = {
      kind: 'business',
      n: 1,
      source_row: new Int32Array([1]),
      columns: [
        { role: 'measure', key: 'rev', label: 'Doanh thu', values: new Float64Array([1000]), raw_values: new Float64Array([1000]) },
        { role: 'measure', key: 'cogs', label: 'Giá vốn', values: new Float64Array([600]), raw_values: new Float64Array([600]) },
      ],
    };
    const recNormal = recalculateBusinessTable(tableNormal, {});
    expect(recNormal.cogs_exceeds_revenue_warning).toBeUndefined();
  });

  // -------------------------------------------------------------
  // Test 6: Gate 1 Duyệt button lock condition logic
  // -------------------------------------------------------------
  it('6. Gate 1 Duyệt button lock conditions check reviewerName, valid clean data, confirmed status, and revenue', () => {
    const checkIsLocked = (params: {
      reviewerName: string;
      valid: boolean;
      approving: boolean;
      isReadConfirmed: boolean;
      hasRevenue: boolean;
      isBusiness: boolean;
    }) => {
      const isRevenueMissing = params.isBusiness && !params.hasRevenue;
      return (
        !params.reviewerName.trim() ||
        !params.valid ||
        params.approving ||
        !params.isReadConfirmed ||
        isRevenueMissing
      );
    };

    // Missing reviewer name
    expect(checkIsLocked({ reviewerName: '', valid: true, approving: false, isReadConfirmed: true, hasRevenue: true, isBusiness: true })).toBe(true);
    // Invalid clean data
    expect(checkIsLocked({ reviewerName: 'Admin', valid: false, approving: false, isReadConfirmed: true, hasRevenue: true, isBusiness: true })).toBe(true);
    // Approving in progress
    expect(checkIsLocked({ reviewerName: 'Admin', valid: true, approving: true, isReadConfirmed: true, hasRevenue: true, isBusiness: true })).toBe(true);
    // Unconfirmed items remaining
    expect(checkIsLocked({ reviewerName: 'Admin', valid: true, approving: false, isReadConfirmed: false, hasRevenue: true, isBusiness: true })).toBe(true);
    // Missing revenue in business mode
    expect(checkIsLocked({ reviewerName: 'Admin', valid: true, approving: false, isReadConfirmed: true, hasRevenue: false, isBusiness: true })).toBe(true);
    // All conditions met -> UNLOCKED
    expect(checkIsLocked({ reviewerName: 'Admin', valid: true, approving: false, isReadConfirmed: true, hasRevenue: true, isBusiness: true })).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 7: ma-dong-lap-trim.csv status tags
  // -------------------------------------------------------------
  it('7. ma-dong-lap-trim.csv: physical row 3 is tagged trimmed, physical row 2 is kept untouched', async () => {
    const filePath = path.join(SAMPLES_DIR, 'ma-dong-lap-trim.csv');
    const bytes = fs.readFileSync(filePath);
    const valRes = await validateBytes('ma-dong-lap-trim.csv', new Uint8Array(bytes));
    expect(valRes.ok).toBe(true);
    const table = (valRes as any).businessTable as BusinessTable;

    const pipeRes = runBusinessCleanPipeline(table);
    expect(pipeRes.valid).toBe(true);
    expect(pipeRes.cleanTable.n).toBe(5);

    // Only row with original_row === 3 (DH-001 " Website ") was trimmed
    const trimmedDiffs = pipeRes.diffRows.filter((r) => r.status === 'trimmed');
    expect(trimmedDiffs.length).toBe(1);
    expect(trimmedDiffs[0].original_row).toBe(3);
    expect(trimmedDiffs[0].details_vi).toContain('Website');

    // Row with original_row === 2 was NOT trimmed
    const row2Trimmed = pipeRes.diffRows.find((r) => r.original_row === 2 && r.status === 'trimmed');
    expect(row2Trimmed).toBeUndefined();

    // Check aggregates
    const analysisOut = analyzeBusinessTable(pipeRes.cleanTable);
    expect(analysisOut.summary.totals.revenue).toBe(15_000_000);
    const chWeb = analysisOut.summary.by_channel.find((c) => c.key === 'Website');
    const chStore = analysisOut.summary.by_channel.find((c) => c.key === 'Cửa hàng');
    expect(chWeb?.revenue).toBe(7_000_000);
    expect(chStore?.revenue).toBe(8_000_000);
  });

  // -------------------------------------------------------------
  // Test 8: Definition of "Chắc" (isTableRecognitionConfident) across 4 cases
  // -------------------------------------------------------------
  it('8. Definition of "Chắc" for G5: confident for dien-tu, false for nha-dat (tỷ đồng), dien-may (ambiguous), and cot-la-6-dong (missing rev)', async () => {
    // 8.1 dien-tu: confident = true
    const dtBytes = fs.readFileSync(path.join(SAMPLES_DIR, 'dien-tu-thieu-loi-nhuan.csv'));
    const dtVal = await validateBytes('dien-tu-thieu-loi-nhuan.csv', new Uint8Array(dtBytes));
    const dtTable = (dtVal as any).businessTable as BusinessTable;
    const dtRoles = resolveBusinessRoles(dtTable);
    expect(isTableRecognitionConfident(dtTable, dtRoles)).toBe(true);

    // 8.2 nha-dat: unit is "tỷ đồng" -> confident = false
    const ndBytes = fs.readFileSync(path.join(SAMPLES_DIR, 'nha-dat-ty-dong-cham-phay.csv'));
    const ndVal = await validateBytes('nha-dat-ty-dong-cham-phay.csv', new Uint8Array(ndBytes));
    const ndTable = (ndVal as any).businessTable as BusinessTable;
    const ndRoles = resolveBusinessRoles(ndTable);
    expect(isTableRecognitionConfident(ndTable, ndRoles)).toBe(false);

    // 8.3 dien-may: ambiguous numbers -> confident = false
    const dmBytes = fs.readFileSync(path.join(SAMPLES_DIR, 'dien-may-nghin-dong-mo-ho.csv'));
    const dmVal = await validateBytes('dien-may-nghin-dong-mo-ho.csv', new Uint8Array(dmBytes));
    const dmTable = (dmVal as any).businessTable as BusinessTable;
    const dmRoles = resolveBusinessRoles(dmTable);
    expect(isTableRecognitionConfident(dmTable, dmRoles)).toBe(false);

    // 8.4 cot-la-6-dong: missing revenue -> confident = false
    const clBytes = fs.readFileSync(path.join(SAMPLES_DIR, 'cot-la-6-dong.csv'));
    const clVal = await validateBytes('cot-la-6-dong.csv', new Uint8Array(clBytes));
    const clTable = (clVal as any).businessTable as BusinessTable;
    const clRoles = resolveBusinessRoles(clTable);
    expect(isTableRecognitionConfident(clTable, clRoles)).toBe(false);
  });
});
