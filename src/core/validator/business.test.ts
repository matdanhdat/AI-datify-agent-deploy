/**
 * Business Profile Validation and Column Role Inference Test Suite (Prompt M1).
 * Validates:
 * 1. du-lieu-test-ban-le.csv acceptance, row count, column roles, and exact warning counts.
 * 2. Role inference edge cases (id, time with granularity, dimension, measure, ignored).
 * 3. Unit extraction from header e.g. "Doanh thu (VND)" -> unit: "VND", label: "Doanh thu".
 * 4. Negative test cases (SCHEMA_NO_MEASURE_COLUMN, SCHEMA_NO_DIMENSION_COLUMN, DATA_TOO_FEW_ROWS,
 *    SCHEMA_TOO_MANY_COLUMNS, DATA_BAD_NUMBER, SCHEMA_PROFILE_UNKNOWN).
 * 5. Invariant: Trading files with >= 4 columns continue to be rejected as trading (SCHEMA_MISSING_COLUMN).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from './index';
import { extractUnit, isDateOrMonthStr } from './business';
import { formatTimeMonth } from '../metrics/businessAnalyzer';
import { DEFAULT_LIMITS } from './schemaSpec';

const RETAIL_SAMPLE_PATH = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');

describe('Business Data Profile (Prompt M1)', () => {
  it('extracts unit correctly from header text', () => {
    expect(extractUnit('Doanh thu (VND)')).toEqual({ label: 'Doanh thu', unit: 'VND' });
    expect(extractUnit('Chi phí giá vốn (VND)')).toEqual({ label: 'Chi phí giá vốn', unit: 'VND' });
    expect(extractUnit('Lợi nhuận gộp (VND)')).toEqual({ label: 'Lợi nhuận gộp', unit: 'VND' });
    expect(extractUnit('Số lượng (chiếc)')).toEqual({ label: 'Số lượng', unit: 'chiếc' });
    expect(extractUnit('Kênh bán')).toEqual({ label: 'Kênh bán' });
  });

  it('correctly accepts and validates real retail sample du-lieu-test-ban-le.csv', async () => {
    expect(fs.existsSync(RETAIL_SAMPLE_PATH)).toBe(true);
    const bytes = new Uint8Array(fs.readFileSync(RETAIL_SAMPLE_PATH));

    const outcome = await validateBytes('du-lieu-test-ban-le.csv', bytes, DEFAULT_LIMITS);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // 1. Structure
    expect(outcome.meta.kind).toBe('business');
    expect(outcome.summary.rows).toBe(50); // 50 content rows (2 blank rows skipped)
    expect(outcome.summary.skipped_blank_rows).toBe(2);
    expect(outcome.meta.n_columns).toBe(9);
    expect(outcome.businessTable).toBeDefined();
    expect(outcome.businessTable?.n).toBe(50);
    expect(outcome.businessTable?.columns.length).toBe(9);

    // 2. Roles
    const roles = outcome.meta.columns_roles;
    expect(roles).toBeDefined();
    const roleMap = new Map(roles?.map((r) => [r.file_header, r.role]));

    expect(roleMap.get('Mã dòng')).toBe('id');
    expect(roleMap.get('Tháng')).toBe('time');
    expect(roleMap.get('Kênh bán')).toBe('dimension');
    expect(roleMap.get('Khu vực')).toBe('dimension');
    expect(roleMap.get('Sản phẩm')).toBe('dimension');
    expect(roleMap.get('Số đơn')).toBe('measure');
    expect(roleMap.get('Doanh thu (VND)')).toBe('measure');
    expect(roleMap.get('Chi phí giá vốn (VND)')).toBe('measure');
    expect(roleMap.get('Lợi nhuận gộp (VND)')).toBe('measure');

    // 3. Units
    const unitMap = new Map(roles?.map((r) => [r.file_header, r.unit]));
    expect(unitMap.get('Doanh thu (VND)')).toBe('VND');
    expect(unitMap.get('Chi phí giá vốn (VND)')).toBe('VND');
    expect(unitMap.get('Lợi nhuận gộp (VND)')).toBe('VND');

    // 4. Exact Warnings
    const warnCodes = outcome.warnings.map((w) => w.code);
    expect(warnCodes).toContain('DATA_WHITESPACE_PADDED');
    expect(warnCodes).toContain('DATA_BLANK_DIMENSION');
    expect(warnCodes).toContain('DATA_EXACT_DUPLICATE');
    expect(warnCodes).toContain('DATA_DUPLICATE_ID');

    // Verify whitespace warning has count 4
    const padWarn = outcome.warnings.find((w) => w.code === 'DATA_WHITESPACE_PADDED');
    expect(padWarn?.message_vi).toContain('4 ô');

    // Verify blank dimension warning has count 3
    const blankDimWarn = outcome.warnings.find((w) => w.code === 'DATA_BLANK_DIMENSION');
    expect(blankDimWarn?.message_vi).toContain('3 ô');

    // Verify exact duplicate warning has count 2
    const exactDupWarn = outcome.warnings.find((w) => w.code === 'DATA_EXACT_DUPLICATE');
    expect(exactDupWarn?.message_vi).toContain('2 dòng');

    // Verify duplicate ID warning has DS-008 and DS-043
    const dupIdWarn = outcome.warnings.find((w) => w.code === 'DATA_DUPLICATE_ID');
    expect(dupIdWarn?.message_vi).toContain('DS-008');
    expect(dupIdWarn?.message_vi).toContain('DS-043');
  });

  it('rejects table with only text columns as SCHEMA_NO_MEASURE_COLUMN', async () => {
    const csv = [
      'Ma_Don,Kenh,Khu_Vuc,San_Pham,Ghi_Chu',
      'D1,Online,Bac,Ao,Tot',
      'D2,Offline,Trung,Quan,BinhThuong',
      'D3,Online,Nam,Ao,Tot',
      'D4,Offline,Bac,Vay,Moi',
      'D5,Online,Trung,Ao,Tot',
      'D6,Offline,Nam,Quan,Moi',
    ].join('\r\n');

    const outcome = await validateBytes('text_only.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.issues.some((i) => i.code === 'SCHEMA_NO_MEASURE_COLUMN')).toBe(true);
  });

  it('rejects table with only numbers as SCHEMA_NO_DIMENSION_COLUMN', async () => {
    const csv = [
      'Cot_A,Cot_B,Cot_C',
      '10,20,30',
      '15,25,35',
      '12,22,32',
      '14,24,34',
      '18,28,38',
      '19,29,39',
    ].join('\r\n');

    const outcome = await validateBytes('numeric_only.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.issues.some((i) => i.code === 'SCHEMA_NO_DIMENSION_COLUMN')).toBe(true);
  });

  it('rejects table with fewer than 5 rows as DATA_TOO_FEW_ROWS', async () => {
    const csv = [
      'San_Pham,Doanh_Thu',
      'Ao,100',
      'Quan,200',
      'Giay,300',
    ].join('\r\n');

    const outcome = await validateBytes('too_few_rows.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.issues.some((i) => i.code === 'DATA_TOO_FEW_ROWS')).toBe(true);
  });

  it('rejects table with more than 30 columns as SCHEMA_TOO_MANY_COLUMNS', async () => {
    const headers = Array.from({ length: 32 }, (_, i) => (i === 0 ? 'San_Pham' : `Cot_${i}`)).join(',');
    const row = Array.from({ length: 32 }, (_, i) => (i === 0 ? 'Ao' : String(i * 10))).join(',');
    const rows = [headers, row, row, row, row, row, row].join('\r\n');

    const outcome = await validateBytes('too_many_cols.csv', new TextEncoder().encode(rows));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.issues.some((i) => i.code === 'SCHEMA_TOO_MANY_COLUMNS')).toBe(true);
  });

  it('rejects invalid currency symbols attached to measure as DATA_BAD_NUMBER', async () => {
    const csv = [
      'San_Pham,Doanh_Thu',
      'Ao,100000',
      'Quan,25.400đ',
      'Vay,300000',
      'Tui,400000',
      'Non,500000',
    ].join('\r\n');

    const outcome = await validateBytes('currency_symbol.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    const badNum = outcome.issues.find((i) => i.code === 'DATA_BAD_NUMBER');
    expect(badNum).toBeDefined();
    expect(badNum?.row).toBe(3);
    expect(badNum?.value).toBe('25.400đ');
  });

  it('rejects text in measure column as DATA_BAD_NUMBER', async () => {
    const csv = [
      'San_Pham,Doanh_Thu',
      'Ao,100000',
      'Quan,abc',
      'Vay,300000',
      'Tui,400000',
      'Non,500000',
    ].join('\r\n');

    const outcome = await validateBytes('bad_text_in_num.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    const badNum = outcome.issues.find((i) => i.code === 'DATA_BAD_NUMBER');
    expect(badNum).toBeDefined();
    expect(badNum?.row).toBe(3);
    expect(badNum?.value).toBe('abc');
  });

  it('rejects completely nonsense content as SCHEMA_PROFILE_UNKNOWN', async () => {
    const csv = [
      'Foo_X,Bar_Y',
      'Hello World 1,This is completely random long string with high cardinality 1',
      'Hello World 2,This is completely random long string with high cardinality 2',
      'Hello World 3,This is completely random long string with high cardinality 3',
      'Hello World 4,This is completely random long string with high cardinality 4',
      'Hello World 5,This is completely random long string with high cardinality 5',
      'Hello World 6,This is completely random long string with high cardinality 6',
      'Hello World 7,This is completely random long string with high cardinality 7',
    ].join('\r\n');

    const outcome = await validateBytes('nonsense.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.issues.some((i) => i.code === 'SCHEMA_PROFILE_UNKNOWN')).toBe(true);
  });

  it('preserves trading rejection SCHEMA_MISSING_COLUMN when 4 to 6 trading columns match', async () => {
    // 5 trading columns (missing high, low)
    const csv = [
      'Ngày,Mã,Mở,Đóng,Khối lượng',
      '14/11/2026,TMA,25.0,26.0,10000',
      '15/11/2026,TMA,25.2,26.1,12000',
      '16/11/2026,TMA,25.1,26.3,11000',
      '17/11/2026,TMA,25.4,26.5,13000',
      '18/11/2026,TMA,25.3,26.4,14000',
    ].join('\r\n');

    const outcome = await validateBytes('missing_trading_cols.csv', new TextEncoder().encode(csv));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.issues.some((i) => i.code === 'SCHEMA_MISSING_COLUMN')).toBe(true);
  });

  describe('Prompt 1B-1: Revenue requirement & missing role warnings', () => {
    it('rejects business file without Revenue column with SCHEMA_NO_REVENUE_COLUMN and exact message', async () => {
      const csv = [
        'Khu vực,Kênh bán,Chi phí',
        'Miền Bắc,Website,10000000',
        'Miền Bắc,Cửa hàng,12000000',
        'Miền Trung,Website,11000000',
        'Miền Trung,Cửa hàng,13000000',
        'Miền Nam,Website,14000000',
      ].join('\r\n');

      const outcome = await validateBytes('no_revenue.csv', new TextEncoder().encode(csv));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;

      const issue = outcome.issues.find((i) => i.code === 'SCHEMA_NO_REVENUE_COLUMN');
      expect(issue).toBeDefined();
      expect(issue?.message_vi).toBe(
        'Không tìm thấy cột Doanh thu trong file. Agent nhận các tên cột như: Doanh thu, Doanh số, Revenue, Sales, Thành tiền. Hãy đổi tên cột doanh thu rồi tải lại.'
      );
    });

    it('accepts file with Revenue and attaches non-blocking warnings for missing metrics', async () => {
      const csvPath = path.resolve(__dirname, '../../../samples/business/thieu-gia-von-thieu-san-pham.csv');
      const csv = fs.readFileSync(csvPath);
      const outcome = await validateBytes('thieu-gia-von-thieu-san-pham.csv', new Uint8Array(csv));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.meta.kind).toBe('business');
      expect(outcome.warnings.some((w) => w.message_vi.includes('Không có cột Giá vốn hoặc Lợi nhuận gộp'))).toBe(true);
      expect(outcome.warnings.some((w) => w.message_vi.includes('Không có cột Số đơn'))).toBe(true);
      expect(outcome.warnings.some((w) => w.message_vi.includes('Không có cột Sản phẩm'))).toBe(true);
    });

    it('rejects file with only measures and no dimension or time column as SCHEMA_NO_DIMENSION_COLUMN', async () => {
      const csv = [
        'Doanh thu,Số đơn',
        '1000000,10',
        '2000000,20',
        '3000000,30',
        '4000000,40',
        '5000000,50',
      ].join('\r\n');

      const outcome = await validateBytes('no_dim.csv', new TextEncoder().encode(csv));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;

      expect(outcome.issues.some((i) => i.code === 'SCHEMA_NO_DIMENSION_COLUMN')).toBe(true);
    });
  });

  describe('E3: Strict Month Parsing & No 1970-01 Fabrication', () => {
    it('isDateOrMonthStr rejects invalid, empty, or epoch zero values', () => {
      expect(isDateOrMonthStr('').ok).toBe(false);
      expect(isDateOrMonthStr('   ').ok).toBe(false);
      expect(isDateOrMonthStr(null).ok).toBe(false);
      expect(isDateOrMonthStr(undefined).ok).toBe(false);
      expect(isDateOrMonthStr(0).ok).toBe(false);
      expect(isDateOrMonthStr('0').ok).toBe(false);
      expect(isDateOrMonthStr('abc').ok).toBe(false);
      expect(isDateOrMonthStr('2026-13').ok).toBe(false);
      expect(isDateOrMonthStr('2026-00').ok).toBe(false);
      expect(isDateOrMonthStr('1970-00').ok).toBe(false);
    });

    it('isDateOrMonthStr accepts valid month and date strings', () => {
      expect(isDateOrMonthStr('2026-07').ok).toBe(true);
      expect(isDateOrMonthStr('2026-07').granularity).toBe('month');

      expect(isDateOrMonthStr('2026-07-15').ok).toBe(true);
      expect(isDateOrMonthStr('2026-07-15').granularity).toBe('day');

      expect(isDateOrMonthStr('15/07/2026').ok).toBe(true);
      expect(isDateOrMonthStr('15/07/2026').granularity).toBe('day');
    });

    it('formatTimeMonth returns null for empty or invalid entries, never 1970-01', () => {
      const col = {
        role: 'time' as const,
        key: 'month',
        label: 'Tháng',
        granularity: 'month' as const,
        values: new Int32Array([-1, 0, 678]),
        raw_labels: ['', '   ', '2026-07'],
      };

      // Index 0: empty string
      expect(formatTimeMonth(col, 0)).toBeNull();
      // Index 1: whitespace
      expect(formatTimeMonth(col, 1)).toBeNull();
      // Index 2: valid month
      expect(formatTimeMonth(col, 2)).toBe('2026-07');

      // Col with no raw_labels but negative / zero / valid
      const col2 = {
        role: 'time' as const,
        key: 'month',
        label: 'Tháng',
        granularity: 'month' as const,
        values: new Int32Array([-1, 678]),
      };
      expect(formatTimeMonth(col2, 0)).toBeNull();
      expect(formatTimeMonth(col2, 1)).toBe('2026-07');
    });
  });
});
