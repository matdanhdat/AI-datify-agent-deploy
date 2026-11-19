import { describe, it, expect } from 'vitest';
import type { BusinessTable } from '../businessTable';
import {
  normalizeRoleText,
  resolveBusinessRoles,
  BUSINESS_ROLE_WARNINGS,
} from './businessRoles';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../validator/index';
import { runBusinessCleanPipeline } from '../cleaner/businessCleaner';

function makeDummyTable(
  measures: Array<{ label: string; values?: number[] }>,
  dims: Array<{ label: string; categories?: string[]; codes?: number[] }> = [],
  time?: { label: string; values?: number[] }
): BusinessTable {
  const n = measures[0]?.values?.length || dims[0]?.codes?.length || 5;
  const cols: any[] = [];

  measures.forEach((m, idx) => {
    cols.push({
      role: 'measure' as const,
      key: `m_${idx}`,
      label: m.label,
      values: new Float64Array(m.values || new Array(n).fill(100)),
    });
  });

  dims.forEach((d, idx) => {
    cols.push({
      role: 'dimension' as const,
      key: `d_${idx}`,
      label: d.label,
      categories: d.categories || ['A', 'B'],
      codes: new Uint16Array(d.codes || new Array(n).fill(0)),
    });
  });

  if (time) {
    cols.push({
      role: 'time' as const,
      key: 'time_col',
      label: time.label,
      granularity: 'month',
      values: new Int32Array(time.values || new Array(n).fill(678)),
      raw_labels: new Array(n).fill('2026-07'),
    });
  }

  return {
    kind: 'business',
    n,
    source_row: new Int32Array(Array.from({ length: n }, (_, i) => i + 1)),
    columns: cols,
  };
}

describe('businessRoles - Column Role Resolution Engine (H4 Full Suite)', () => {
  describe('normalizeRoleText', () => {
    it('normalizes diacritics, lowercase, removes symbols and currency units', () => {
      expect(normalizeRoleText('Doanh thu (VND)')).toBe('doanh thu');
      expect(normalizeRoleText('Chi phí giá vốn (triệu đồng)')).toBe('chi phi gia von');
      expect(normalizeRoleText('Lợi nhuận gộp [%]')).toBe('loi nhuan gop');
      expect(normalizeRoleText('Số lượng đơn hàng (nghìn đồng)')).toBe('so luong don hang');
      expect(normalizeRoleText('Kênh bán hàng')).toBe('kenh ban hang');
    });

    it('handles special characters and multiple spaces', () => {
      expect(normalizeRoleText('  Doanh_thu / Tháng - (VND)  ')).toBe('doanh thu thang');
    });
  });

  describe('Standard 9-column retail table', () => {
    it('resolves all roles as "tìm thấy" with 0 missing warnings', async () => {
      const csvPath = path.resolve(__dirname, '../../../samples/business/du-lieu-test-ban-le.csv');
      const csv = fs.readFileSync(csvPath);
      const val = await validateBytes('du-lieu-test-ban-le.csv', new Uint8Array(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) return;

      const cleanRes = runBusinessCleanPipeline(val.businessTable);
      const roles = resolveBusinessRoles(cleanRes.cleanTable);

      expect(roles.revenue.status).toBe('tìm thấy');
      expect(roles.revenue.col?.label).toContain('Doanh thu');

      expect(roles.orders.status).toBe('tìm thấy');
      expect(roles.orders.col?.label).toContain('Số đơn');

      expect(roles.cogs.status).toBe('tìm thấy');
      expect(roles.cogs.col?.label).toContain('giá vốn');

      expect(roles.profit.status).toBe('tìm thấy');
      expect(roles.profit.col?.label).toContain('Lợi nhuận');

      expect(roles.channel.status).toBe('tìm thấy');
      expect(roles.channel.col?.label).toContain('Kênh');

      expect(roles.region.status).toBe('tìm thấy');
      expect(roles.region.col?.label).toContain('Khu vực');

      expect(roles.product.status).toBe('tìm thấy');
      expect(roles.product.col?.label).toContain('Sản phẩm');

      expect(roles.time.status).toBe('tìm thấy');
      expect(roles.time.col?.label).toContain('Tháng');

      // No missing warnings
      expect(roles.warnings).toHaveLength(0);
    });
  });

  describe('4-column missing metrics table (thieu-gia-von-thieu-san-pham.csv)', () => {
    it('resolves present columns and marks missing columns as "thiếu" without fallback', async () => {
      const csvPath = path.resolve(__dirname, '../../../samples/business/thieu-gia-von-thieu-san-pham.csv');
      const csv = fs.readFileSync(csvPath);
      const val = await validateBytes('thieu-gia-von-thieu-san-pham.csv', new Uint8Array(csv));
      expect(val.ok).toBe(true);
      if (!val.ok || !val.businessTable) return;

      const cleanRes = runBusinessCleanPipeline(val.businessTable);
      const roles = resolveBusinessRoles(cleanRes.cleanTable);

      // Present
      expect(roles.revenue.status).toBe('tìm thấy');
      expect(roles.revenue.col?.label).toContain('Doanh thu');
      expect(roles.channel.status).toBe('tìm thấy');
      expect(roles.channel.col?.label).toContain('Kênh');
      expect(roles.region.status).toBe('tìm thấy');
      expect(roles.region.col?.label).toContain('Khu vực');
      expect(roles.time.status).toBe('tìm thấy');
      expect(roles.time.col?.label).toContain('Tháng');

      // Missing
      expect(roles.cogs.status).toBe('thiếu');
      expect(roles.cogs.col).toBeNull();

      expect(roles.profit.status).toBe('thiếu');
      expect(roles.profit.col).toBeNull();

      expect(roles.orders.status).toBe('thiếu');
      expect(roles.orders.col).toBeNull();

      expect(roles.product.status).toBe('thiếu');
      expect(roles.product.col).toBeNull();

      // Standardized warning strings present
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.MISSING_COGS_AND_PROFIT);
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.MISSING_ORDERS);
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.MISSING_PRODUCT);
      expect(roles.warnings).not.toContain(BUSINESS_ROLE_WARNINGS.MISSING_CHANNEL);
      expect(roles.warnings).not.toContain(BUSINESS_ROLE_WARNINGS.MISSING_REGION);
      expect(roles.warnings).not.toContain(BUSINESS_ROLE_WARNINGS.MISSING_TIME);
    });
  });

  describe('H4 Ca 1: Tên có dấu / không dấu / VIẾT HOA / gạch dưới / tiếng Anh', () => {
    it('resolves Revenue variants', () => {
      const variants = ['Doanh thu (VND)', 'doanh_thu', 'DOANH THU', 'Revenue', 'Net Sales', 'Thanh tien'];
      for (const v of variants) {
        const table = makeDummyTable([{ label: v }]);
        const roles = resolveBusinessRoles(table);
        expect(roles.revenue.status, `Failed for ${v}`).toBe('tìm thấy');
        expect(roles.revenue.col?.label).toBe(v);
      }
    });

    it('resolves Orders variants', () => {
      const variants = ['So don', 'Số đơn', 'SO_DON', 'Orders', 'Order count', 'So don hang'];
      for (const v of variants) {
        const table = makeDummyTable([{ label: 'Doanh thu' }, { label: v }]);
        const roles = resolveBusinessRoles(table);
        expect(roles.orders.status, `Failed for ${v}`).toBe('tìm thấy');
        expect(roles.orders.col?.label).toBe(v);
      }
    });

    it('resolves COGS variants', () => {
      const variants = ['Gia von', 'Giá vốn', 'GIA_VON', 'COGS', 'Cost of goods sold', 'Chi phi gia von'];
      for (const v of variants) {
        const table = makeDummyTable([{ label: 'Doanh thu' }, { label: v }]);
        const roles = resolveBusinessRoles(table);
        expect(roles.cogs.status, `Failed for ${v}`).toBe('tìm thấy');
        expect(roles.cogs.col?.label).toBe(v);
      }
    });

    it('resolves Gross Profit variants', () => {
      const variants = ['Loi nhuan gop', 'Lợi nhuận gộp', 'LOI_NHUAN_GOP', 'Gross Profit', 'Lai gop'];
      for (const v of variants) {
        const table = makeDummyTable([
          { label: 'Doanh thu', values: [1000, 2000] },
          { label: v, values: [400, 800] },
        ]);
        const roles = resolveBusinessRoles(table);
        expect(roles.profit.status, `Failed for ${v}`).toBe('tìm thấy');
        expect(roles.profit.col?.label).toBe(v);
      }
    });
  });

  describe('H4 Ca 2: Từ chối từ khóa loại trừ & biên an toàn', () => {
    it('rejects "Chi phí marketing" from being recognized as COGS', () => {
      const table = makeDummyTable([{ label: 'Chi phí marketing' }, { label: 'Doanh thu' }]);
      const roles = resolveBusinessRoles(table);
      expect(roles.cogs.status).toBe('thiếu');
    });

    it('rejects "Giá trị đơn trung bình" from being recognized as Orders', () => {
      const table = makeDummyTable([{ label: 'Giá trị đơn trung bình' }, { label: 'Doanh thu' }]);
      const roles = resolveBusinessRoles(table);
      expect(roles.orders.status).toBe('thiếu');
    });

    it('rejects isolated "Số lượng" from being recognized as Orders', () => {
      const table = makeDummyTable([{ label: 'Số lượng' }, { label: 'Doanh thu' }]);
      const roles = resolveBusinessRoles(table);
      expect(roles.orders.status).toBe('thiếu');
    });

    it('rejects embedded substring "sl" in words like "slide" from matching Orders', () => {
      const table = makeDummyTable([{ label: 'Số slide thuyết trình' }, { label: 'Doanh thu' }]);
      const roles = resolveBusinessRoles(table);
      expect(roles.orders.status).toBe('thiếu');
    });

    it('rejects "Lợi nhuận ròng" / "Net profit" from matching Gross Profit', () => {
      const table = makeDummyTable([{ label: 'Lợi nhuận ròng' }, { label: 'Net profit' }, { label: 'Doanh thu' }]);
      const roles = resolveBusinessRoles(table);
      expect(roles.profit.status).toBe('thiếu');
    });
  });

  describe('H4 Ca 3: Nhiều cột cùng khớp một vai trò', () => {
    it('selects the highest scored column and emits a standardized warning', () => {
      const table = makeDummyTable([
        { label: 'Doanh thu thuần' },
        { label: 'Doanh số bán lẻ' },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.revenue.status).toBe('tìm thấy');
      expect(roles.revenue.col?.label).toBe('Doanh thu thuần');
      expect(roles.warnings.some((w) => w.includes('Có nhiều cột có thể là Doanh thu'))).toBe(true);
      expect(roles.warnings.some((w) => w.includes('Agent dùng cột "Doanh thu thuần"'))).toBe(true);
    });
  });

  describe('H4 Ca 4: Doanh thu suy luận', () => {
    it('infers single unassigned measure as revenue with warning', () => {
      const table = makeDummyTable([
        { label: 'Gia tri phat sinh' },
        { label: 'Chi phi gia von' },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.revenue.status).toBe('suy luận');
      expect(roles.revenue.col?.label).toBe('Gia tri phat sinh');
      expect(roles.warnings).toContain(
        BUSINESS_ROLE_WARNINGS.REVENUE_INFERRED('Gia tri phat sinh')
      );
    });

    it('marks revenue as missing when 2 or more strange measures exist', () => {
      const table = makeDummyTable([
        { label: 'Chi so A' },
        { label: 'Chi so B' },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.revenue.status).toBe('thiếu');
      expect(roles.revenue.col).toBeNull();
    });
  });

  describe('H4 Ca 5: Giá vốn toàn 0 & Lợi nhuận bằng Doanh thu & Quan hệ giữa các cột', () => {
    it('flags COGS as không đáng tin when all COGS values are 0', () => {
      const table = makeDummyTable([
        { label: 'Doanh thu', values: [1000, 2000] },
        { label: 'Giá vốn', values: [0, 0] },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.cogs.status).toBe('không đáng tin');
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.COGS_ALL_ZERO);
    });

    it('flags profit and cogs as không đáng tin when profit equals revenue at every row', () => {
      const table = makeDummyTable([
        { label: 'Doanh thu', values: [1000, 2000] },
        { label: 'Lợi nhuận gộp', values: [1000, 2000] },
        { label: 'Giá vốn', values: [0, 0] },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.profit.status).toBe('không đáng tin');
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.PROFIT_EQUALS_REVENUE);
    });

    it('computes profit when only revenue and cogs are present (rule a)', () => {
      const table = makeDummyTable([
        { label: 'Doanh thu', values: [1000, 2000] },
        { label: 'Giá vốn', values: [600, 1200] },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.profit.status).toBe('tính ra');
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.PROFIT_COMPUTED);
    });

    it('keeps cogs as missing when only revenue and profit are present (rule b)', () => {
      const table = makeDummyTable([
        { label: 'Doanh thu', values: [1000, 2000] },
        { label: 'Lợi nhuận gộp', values: [400, 800] },
      ]);
      const roles = resolveBusinessRoles(table);
      expect(roles.profit.status).toBe('tìm thấy');
      expect(roles.cogs.status).toBe('thiếu');
      expect(roles.cogs.col).toBeNull();
      expect(roles.warnings).toContain(BUSINESS_ROLE_WARNINGS.MISSING_COGS_ONLY);
    });
  });
});
