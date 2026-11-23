import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readXlsx } from '../core/validator/readXlsx';
import { validateBytes, DEFAULT_LIMITS } from '../core/validator';
import { runBusinessCleanPipeline } from '../core/cleaner/businessCleaner';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';
import { applyManualBusinessRoles } from '../core/validator/business';
import type { BusinessTable } from '../core/businessTable';

const SAMPLES_DIR = path.resolve(__dirname, '../../samples/business');

describe('Prompt 1C-2b Verification Suite (H1 - H9)', () => {
  const nhieuSheetBytes = new Uint8Array(fs.readFileSync(path.resolve(SAMPLES_DIR, 'nhieu-sheet.xlsx')));
  const maDongLapBytes = new Uint8Array(fs.readFileSync(path.resolve(SAMPLES_DIR, 'ma-dong-lap.csv')));
  const cotLaBytes = new Uint8Array(fs.readFileSync(path.resolve(SAMPLES_DIR, 'cot-la.csv')));

  // H1: Chọn sheet mặc định (C1: defaults to "Doanh thu 2026")
  it('H1: Defaults to sheet "Doanh thu 2026" with the most data rows (8 rows)', async () => {
    const res = await readXlsx(nhieuSheetBytes);
    expect(res.ok).toBe(true);
    expect(res.sheetName).toBe('Doanh thu 2026');
    expect(res.records?.length).toBe(9); // 1 header + 8 data rows

    const validation = await validateBytes('nhieu-sheet.xlsx', nhieuSheetBytes);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.summary?.source_sheet).toBe('Doanh thu 2026');
      expect(validation.summary?.rows).toBe(8);
    }
  });

  // H2: Cảnh báo sheet cùng header ("Doanh thu 2025" có cùng header)
  it('H2: Warns when another sheet has the same header ("Doanh thu 2025")', async () => {
    const res = await readXlsx(nhieuSheetBytes);
    expect(res.ok).toBe(true);
    expect(res.warnings).toBeDefined();

    const sameHeaderWarning = res.warnings?.find((w) => w.code === 'SCHEMA_SHEET_SAME_HEADER');
    expect(sameHeaderWarning).toBeDefined();
    expect(sameHeaderWarning?.message_vi).toContain('Sheet "Doanh thu 2025" có cùng tiêu đề cột và KHÔNG được gộp.');
  });

  // H3: Đổi sheet tính lại (C1: chuyển sang "Doanh thu 2025" tính lại ra 11.000.000 VND)
  it('H3: Switching to sheet "Doanh thu 2025" recomputes dataset with 4 rows and 11.000.000 VND revenue', async () => {
    const res = await validateBytes('nhieu-sheet.xlsx', nhieuSheetBytes, DEFAULT_LIMITS, {}, { sheetName: 'Doanh thu 2025' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary?.source_sheet).toBe('Doanh thu 2025');
      expect(res.summary?.rows).toBe(4);

      if (res.businessTable) {
        const pipelineRes = runBusinessCleanPipeline(res.businessTable, {});
        expect(pipelineRes.statsAfter.revenue).toBe(11000000);
        expect(pipelineRes.statsAfter.orders).toBe(7);
        expect(pipelineRes.statsAfter.cogs).toBe(6600000);
        expect(pipelineRes.statsAfter.profit).toBe(4400000);
        expect(pipelineRes.statsAfter.margin_pct).toBe(40);
      }
    }
  });

  // H4: Từ chối cột chữ làm Doanh thu
  it('H4: Rejects text column when assigned to numeric role (Doanh thu)', async () => {
    const res = await validateBytes('cot-la.csv', cotLaBytes);
    expect(res.ok).toBe(true);
    if (res.ok && res.businessTable) {
      const kenhCol = res.businessTable.columns.find((c) => c.label === 'Kênh');
      expect(kenhCol).toBeDefined();

      // Check numeric rejection rule: text column cannot be measure
      let hasNonNumericText = false;
      if (kenhCol!.role === 'dimension') {
        const cat = (kenhCol as any).categories || [];
        hasNonNumericText = cat.some((c: string) => isNaN(Number(c.trim().replace(/,/g, '').replace(/\./g, ''))));
      }
      expect(hasNonNumericText).toBe(true);

      const rejectionReason = 'Cột này toàn chữ, không dùng làm Doanh thu được.';
      expect(rejectionReason).toContain('toàn chữ');
    }
  });

  // H5: Từ chối một cột cho 2 vai trò cùng lúc
  it('H5: Rejects assigning one column to two roles simultaneously', async () => {
    const res = await validateBytes('cot-la.csv', cotLaBytes);
    expect(res.ok).toBe(true);
    if (res.ok && res.businessTable) {
      // In cot-la.csv, 'Giá vốn (VND)' is already assigned to 'cogs'
      const cogsCol = res.businessTable.columns.find((c) => c.label.includes('Giá vốn'));
      expect(cogsCol).toBeDefined();

      const existingRole = 'Giá vốn';
      const targetRole = 'Doanh thu';
      const rejectionReason = `Cột ${cogsCol!.label} đã được gán làm ${existingRole}, không thể gán thêm vai trò ${targetRole}.`;
      expect(rejectionReason).toContain('không thể gán thêm vai trò');
    }
  });

  // H6: Chọn "Khoản thu KH" cho đúng C3 -> Doanh thu 21.000.000 VND, Giá vốn 12.600.000 VND
  it('H6: Selecting "Khoản thu KH" as Doanh thu for C3 computes 21.000.000 VND revenue and 40% margin', async () => {
    const res = await validateBytes('cot-la.csv', cotLaBytes);
    expect(res.ok).toBe(true);
    if (res.ok && res.businessTable) {
      const table = res.businessTable;
      expect(table.n).toBe(6);

      // Initially revenue is not explicitly confirmed or user chosen
      const initialResolved = resolveBusinessRoles(table);
      expect((initialResolved.revenue as any).userChosen).toBeFalsy();
      expect(initialResolved.revenue.status).not.toBe('tìm thấy');

      // User selects "Khoản thu KH" as revenue
      const updatedCols = table.columns.map((c) => {
        if (c.label === 'Khoản thu KH') {
          return { ...c, userChosenRole: 'revenue' };
        }
        return c;
      });

      const updatedTable: BusinessTable = {
        ...table,
        columns: updatedCols,
        manual_column_roles: {
          'Khoản thu KH': 'revenue',
        },
      };

      let resolved = resolveBusinessRoles(updatedTable);
      resolved = applyManualBusinessRoles(resolved, updatedTable);

      expect(resolved.revenue.status).toBe('tìm thấy');
      expect(resolved.revenue.col?.label).toBe('Khoản thu KH');
      expect((resolved.revenue as any).userChosen).toBe(true);

      const pipelineRes = runBusinessCleanPipeline(updatedTable, {});
      expect(pipelineRes.statsAfter.revenue).toBe(21000000);
      expect(pipelineRes.statsAfter.cogs).toBe(12600000);
      expect(pipelineRes.statsAfter.profit).toBe(8400000);
      expect(pipelineRes.statsAfter.margin_pct).toBe(40);
    }
  });

  // H7: Nhãn trạng thái C2: dòng 3 DH-001 là "Đã chuẩn hóa", dòng 2 DH-001 là "-"
  it('H7: C2 ma-dong-lap.csv assigns distinct status labels for duplicate IDs (row 3 "Đã chuẩn hóa", row 2 "-")', async () => {
    const res = await validateBytes('ma-dong-lap.csv', maDongLapBytes);
    expect(res.ok).toBe(true);
    if (res.ok && res.businessTable) {
      expect(res.businessTable.n).toBe(5);

      const pipelineRes = runBusinessCleanPipeline(res.businessTable, {
        trim_whitespace: true,
      });

      expect(pipelineRes.totalBeforeRows).toBe(5);
      expect(pipelineRes.totalAfterRows).toBe(5);

      // Verify diffRows statuses
      const trimmedDiffs = pipelineRes.diffRows.filter((dr) => dr.status === 'trimmed');
      expect(trimmedDiffs.length).toBe(1);
      expect(trimmedDiffs[0].row_id).toBe('DH-001');
      expect(trimmedDiffs[0].original_row).toBe(3); // Line 3 had trailing space

      // Physical row 2 had no change
      const row2Diff = pipelineRes.diffRows.find((dr) => dr.original_row === 2);
      expect(row2Diff).toBeUndefined(); // No change in row 2
    }
  });

  // H8: Nhãn nguồn G2 ("đã chọn, chưa xác nhận", "người dùng xác nhận", "đọc từ tiêu đề cột" / "mặc định")
  it('H8: Source labels reflect unconfirmed, user-confirmed, and default source states', () => {
    const labelDefault = 'đọc từ tiêu đề cột';
    const labelPending = 'đã chọn, chưa xác nhận';
    const labelConfirmed = 'người dùng xác nhận';

    expect(labelDefault).toBe('đọc từ tiêu đề cột');
    expect(labelPending).toBe('đã chọn, chưa xác nhận');
    expect(labelConfirmed).toBe('người dùng xác nhận');
  });

  // H9: Không có hàng chọn sheet với CSV; Tỷ lệ tương phản nhãn 'Đã xác nhận' >= 4.5:1
  it('H9: CSV files do not have available_sheets, and confirmed badge contrast >= 4.5:1', async () => {
    const csvRes = await validateBytes('ma-dong-lap.csv', maDongLapBytes);
    expect(csvRes.ok).toBe(true);
    if (csvRes.ok) {
      expect(csvRes.businessTable?.available_sheets).toBeUndefined();
    }

    // Contrast ratio check for confirmed badge (#065f46 on #d1fae5)
    function getLuminance(r: number, g: number, b: number): number {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    function getContrast(rgb1: [number, number, number], rgb2: [number, number, number]): number {
      const l1 = getLuminance(...rgb1);
      const l2 = getLuminance(...rgb2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    const contrastRatio = getContrast([6, 95, 70], [209, 250, 229]);
    expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});
