import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../core/validator';
import { detectDelimiter, parseCsvText } from '../core/validator/readCsv';
import {
  detectCurrencyUnit,
  analyzeColumnNumberFormat,
  parseCellNumber,
  UNIT_SUSPICIOUS_MIN_AOV,
  UNIT_SUSPICIOUS_MAX_AOV,
} from '../core/validator/business';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';

const SAMPLES_DIR = path.resolve(__dirname, '../../samples/business');

describe('Prompt 1C-2a Comprehensive Verification Suite', () => {
  describe('1. Delimiter Detection & Parsing', () => {
    it('detects semicolon (;) delimiter on G1 (nha-dat-ty-dong-cham-phay.csv)', () => {
      const g1Path = path.join(SAMPLES_DIR, 'nha-dat-ty-dong-cham-phay.csv');
      const text = fs.readFileSync(g1Path, 'utf-8');
      const delim = detectDelimiter(text);
      expect(delim).toBe(';');
      const parsed = parseCsvText(text, delim);
      expect(parsed.records.length).toBe(13); // 1 header + 12 data rows
    });

    it('detects comma (,) delimiter on G2 (dien-may-nghin-dong-mo-ho.csv)', () => {
      const g2Path = path.join(SAMPLES_DIR, 'dien-may-nghin-dong-mo-ho.csv');
      const text = fs.readFileSync(g2Path, 'utf-8');
      const delim = detectDelimiter(text);
      expect(delim).toBe(',');
      const parsed = parseCsvText(text, delim);
      expect(parsed.records.length).toBe(11); // 1 header + 10 data rows
    });

    it('handles single-column file gracefully without crashing', () => {
      const singleCol = 'Mã sản phẩm\nSP001\nSP002\nSP003\nSP004\nSP005';
      const delim = detectDelimiter(singleCol);
      expect(delim).toBe(',');
      const parsed = parseCsvText(singleCol, delim);
      expect(parsed.records.length).toBe(6);
      expect(parsed.records[0].cells[0]).toBe('Mã sản phẩm');
    });
  });

  describe('2. Column-Level Number Format & Disambiguation', () => {
    it('parses "1.234,56" as 1234.56 with comma convention', () => {
      const analysis = analyzeColumnNumberFormat(['1.234,56', '500,00']);
      expect(analysis.decimalConvention).toBe('comma');
      expect(analysis.isAmbiguous).toBe(false);
      const val = parseCellNumber('1.234,56', analysis.decimalConvention);
      expect(val).toBe(1234.56);
    });

    it('parses "1,234.56" as 1234.56 with dot convention', () => {
      const analysis = analyzeColumnNumberFormat(['1,234.56', '500.00']);
      expect(analysis.decimalConvention).toBe('dot');
      expect(analysis.isAmbiguous).toBe(false);
      const val = parseCellNumber('1,234.56', analysis.decimalConvention);
      expect(val).toBe(1234.56);
    });

    it('parses "12,5" as 12.5 (comma followed by != 3 digits)', () => {
      const analysis = analyzeColumnNumberFormat(['12,5', '8,0', '16,0']);
      expect(analysis.decimalConvention).toBe('comma');
      expect(analysis.isAmbiguous).toBe(false);
      const val = parseCellNumber('12,5', analysis.decimalConvention);
      expect(val).toBe(12.5);
    });

    it('parses "1.5" as 1.5 (dot followed by != 3 digits)', () => {
      const analysis = analyzeColumnNumberFormat(['1.5', '2.5', '10.2']);
      expect(analysis.decimalConvention).toBe('dot');
      expect(analysis.isAmbiguous).toBe(false);
      const val = parseCellNumber('1.5', analysis.decimalConvention);
      expect(val).toBe(1.5);
    });

    it('marks column with "1.250 / 2.300 / 700" as ambiguous', () => {
      const analysis = analyzeColumnNumberFormat(['1.250', '2.300', '700']);
      expect(analysis.isAmbiguous).toBe(true);
      expect(analysis.sampleAmbiguous).toBe('1.250');
      // Default Vietnamese format: dot is thousands
      expect(analysis.decimalConvention).toBe('comma');
    });

    it('does NOT mark "1.250.000" as ambiguous (multiple dots = thousands separator)', () => {
      const analysis = analyzeColumnNumberFormat(['1.250.000', '500.000']);
      expect(analysis.isAmbiguous).toBe(false);
      expect(analysis.decimalConvention).toBe('comma');
    });
  });

  describe('3. Currency Unit Recognition & Scaling (5 Units)', () => {
    it('recognizes all 5 currency units from header', () => {
      expect(detectCurrencyUnit('Doanh thu (đồng)')).toEqual({ unit: 'đồng', multiplier: 1, source: 'header' });
      expect(detectCurrencyUnit('Doanh thu (VND)')).toEqual({ unit: 'đồng', multiplier: 1, source: 'header' });
      expect(detectCurrencyUnit('Doanh số (nghìn đồng)')).toEqual({
        unit: 'nghìn đồng',
        multiplier: 1e3,
        source: 'header',
      });
      expect(detectCurrencyUnit('Lợi nhuận (triệu đồng)')).toEqual({
        unit: 'triệu đồng',
        multiplier: 1e6,
        source: 'header',
      });
      expect(detectCurrencyUnit('Thành tiền (tỷ đồng)')).toEqual({
        unit: 'tỷ đồng',
        multiplier: 1e9,
        source: 'header',
      });
      expect(detectCurrencyUnit('Ngân sách (nghìn tỷ đồng)')).toEqual({
        unit: 'nghìn tỷ đồng',
        multiplier: 1e12,
        source: 'header',
      });
      expect(detectCurrencyUnit('Doanh thu')).toEqual({ unit: 'đồng', multiplier: 1, source: 'mặc định' });
    });
  });

  describe('4. Suspicious Unit Boundary Check', () => {
    it('verifies UNIT_SUSPICIOUS thresholds: exactly 999 vs 1,000 and 50B vs >50B', () => {
      expect(UNIT_SUSPICIOUS_MIN_AOV).toBe(1000);
      expect(UNIT_SUSPICIOUS_MAX_AOV).toBe(50000000000);

      const checkSuspicious = (avg: number) => avg > 0 && (avg < UNIT_SUSPICIOUS_MIN_AOV || avg > UNIT_SUSPICIOUS_MAX_AOV);

      expect(checkSuspicious(999)).toBe(true);
      expect(checkSuspicious(1000)).toBe(false);
      expect(checkSuspicious(50_000_000_000)).toBe(false);
      expect(checkSuspicious(50_000_000_001)).toBe(true);
    });
  });

  describe('5. Total Row Detection & Filtering (Real Pipeline)', () => {
    it('removes total row when label AND sum match (G3 tong-cong-cuoi-file.csv)', async () => {
      const g3Path = path.join(SAMPLES_DIR, 'tong-cong-cuoi-file.csv');
      const bytes = fs.readFileSync(g3Path);
      const res = await validateBytes('tong-cong-cuoi-file.csv', new Uint8Array(bytes));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('Expected ok');
      const table = res.businessTable!;
      expect(table.n).toBe(12); // Total row skipped, 12 data rows
      expect(table.skipped_total_rows).toBe(1);
      expect(table.skipped_total_row_numbers).toEqual([14]);
    });

    it('does NOT remove row when label matches "Tổng cộng" but sum does NOT match', async () => {
      const csv = `Tháng;Dự án;Khu vực;Số căn bán;Thành tiền (tỷ đồng);Giá vốn (tỷ đồng)
2026-01;Dự án Sao Mai;Miền Bắc;3;12,5;9,0
2026-01;Dự án Hải Đăng;Miền Nam;2;8,0;6,0
2026-02;Dự án Sao Mai;Miền Bắc;4;16,0;11,5
2026-02;Dự án Hải Đăng;Miền Nam;1;4,5;3,5
2026-03;Dự án Sao Mai;Miền Bắc;2;9,0;6,5
Tổng cộng;;;999;999,0;999,0`;
      const bytes = Buffer.from(csv, 'utf-8');
      const res = await validateBytes('test-mismatched-total.csv', new Uint8Array(bytes));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('Expected ok');
      const table = res.businessTable!;
      // Total row is NOT skipped because sums don't match
      expect(table.n).toBe(6);
      expect(table.skipped_total_rows).toBe(0);
    });

    it('does NOT remove product row named "Combo tổng hợp" with real numbers', async () => {
      const csv = `Tháng;Sản phẩm;Khu vực;Số đơn;Doanh thu (VND);Giá vốn (VND)
2026-01;Áo thun;Miền Bắc;10;1000000;600000
2026-01;Quần jeans;Miền Nam;20;2000000;1200000
2026-02;Áo khoác;Miền Bắc;15;1500000;900000
2026-02;Combo tổng hợp;Miền Nam;5;500000;300000
2026-03;Phụ kiện;Miền Bắc;30;3000000;1800000`;
      const bytes = Buffer.from(csv, 'utf-8');
      const res = await validateBytes('test-combo.csv', new Uint8Array(bytes));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('Expected ok');
      const table = res.businessTable!;
      expect(table.n).toBe(5);
      expect(table.skipped_total_rows).toBe(0);
    });
  });

  describe('6. Negative Keywords & Misattribution Prevention (Part C)', () => {
    it('blocks "Đơn giá", "Giá bán", "Biên lợi nhuận (%)" from matching Revenue or Profit', async () => {
      const csv = `Tháng,Sản phẩm,Đơn giá,Giá bán,Giá niêm yết,Biên lợi nhuận (%),Thành tiền
2026-01,SP1,100000,100000,100000,20,5000000
2026-02,SP2,200000,200000,200000,25,8000000
2026-03,SP3,150000,150000,150000,22,6000000
2026-04,SP4,120000,120000,120000,18,4000000
2026-05,SP5,180000,180000,180000,30,9000000`;
      const bytes = Buffer.from(csv, 'utf-8');
      const res = await validateBytes('test-revenue-priority.csv', new Uint8Array(bytes));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('Expected ok');
      const resolved = resolveBusinessRoles(res.businessTable!);
      // Revenue must be "Thành tiền", NOT "Đơn giá", "Giá bán", or "Giá niêm yết"
      expect(resolved.revenue.status).toBe('tìm thấy');
      expect(resolved.revenue.col?.label).toBe('Thành tiền');
      // Profit must NOT be "Biên lợi nhuận (%)"
      expect(resolved.profit.col?.label).not.toBe('Biên lợi nhuận (%)');
    });

    it('blocks "Chi phí marketing", "Chi phí vận chuyển" from matching COGS', async () => {
      const csv = `Tháng,Sản phẩm,Chi phí marketing,Chi phí vận chuyển,Giá vốn,Doanh thu
2026-01,SP1,50000,20000,300000,1000000
2026-02,SP2,60000,25000,400000,1200000
2026-03,SP3,40000,15000,250000,800000
2026-04,SP4,70000,30000,500000,1500000
2026-05,SP5,55000,22000,350000,1100000`;
      const bytes = Buffer.from(csv, 'utf-8');
      const res = await validateBytes('test-cogs-marketing.csv', new Uint8Array(bytes));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('Expected ok');
      const resolved = resolveBusinessRoles(res.businessTable!);
      expect(resolved.cogs.status).toBe('tìm thấy');
      expect(resolved.cogs.col?.label).toBe('Giá vốn');
    });

    it('blocks "Mã khách hàng", "Số điện thoại", "Mã đơn hàng" from matching Orders', async () => {
      const csv = `Tháng,Mã khách hàng,Số điện thoại,Mã đơn hàng,Số đơn hàng,Doanh thu
2026-01,KH001,0901234567,DH001,15,1000000
2026-02,KH002,0901234568,DH002,20,1200000
2026-03,KH003,0901234569,DH003,12,800000
2026-04,KH004,0901234570,DH004,25,1500000
2026-05,KH005,0901234571,DH005,18,1100000`;
      const bytes = Buffer.from(csv, 'utf-8');
      const res = await validateBytes('test-orders-exclusions.csv', new Uint8Array(bytes));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('Expected ok');
      const resolved = resolveBusinessRoles(res.businessTable!);
      expect(resolved.orders.status).toBe('tìm thấy');
      expect(resolved.orders.col?.label).toBe('Số đơn hàng');
    });
  });

  describe('7. BOM-Handling on G1', () => {
    it('parses UTF-8 with BOM identical to UTF-8 without BOM', async () => {
      const g1Path = path.join(SAMPLES_DIR, 'nha-dat-ty-dong-cham-phay.csv');
      const rawBytes = fs.readFileSync(g1Path);
      // Create BOM version by prepending 0xEF, 0xBB, 0xBF
      const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), rawBytes]);

      const resNoBom = await validateBytes('g1-no-bom.csv', new Uint8Array(rawBytes));
      const resWithBom = await validateBytes('g1-with-bom.csv', new Uint8Array(bomBytes));

      expect(resNoBom.ok).toBe(true);
      expect(resWithBom.ok).toBe(true);
      if (!resNoBom.ok || !resWithBom.ok) throw new Error('Expected ok');

      const tNoBom = resNoBom.businessTable!;
      const tWithBom = resWithBom.businessTable!;

      expect(tWithBom.n).toBe(tNoBom.n);
      expect(tWithBom.columns.length).toBe(tNoBom.columns.length);
      for (let i = 0; i < tNoBom.columns.length; i++) {
        expect(tWithBom.columns[i].label).toBe(tNoBom.columns[i].label);
        expect(tWithBom.columns[i].role).toBe(tNoBom.columns[i].role);
      }
    });
  });
});
