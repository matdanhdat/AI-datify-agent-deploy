import { describe, it, expect } from 'vitest';
import {
  evaluateCodeConfidence,
  translateBusinessRoleId,
  RESOLVED_ROLE_KEYS,
} from '../core/metrics/businessComputeSelected';
import type { BusinessTable, BusinessColumn } from '../core/businessTable';
import type { BusinessResolvedRoles, ResolvedRoleItem } from '../core/metrics/businessRoles';

function mockTable(filename: string, n: number, columns: BusinessColumn[]): BusinessTable {
  return {
    kind: 'business',
    filename,
    n,
    source_row: new Int32Array(n).map((_, i) => i + 1),
    columns,
  };
}

function mockMeasureColumn(key: string, label: string, values: number[], extra: Record<string, any> = {}): BusinessColumn {
  return {
    key,
    label,
    role: 'measure',
    values: new Float64Array(values),
    raw_sample: values.slice(0, 5).map(String),
    null_count: 0,
    negative_count: values.filter((v) => v < 0).length,
    ...extra,
  } as unknown as BusinessColumn;
}

function mockResolvedItem(
  col: BusinessColumn | null = null,
  status: ResolvedRoleItem['status'] = 'thiếu',
  extra: Partial<ResolvedRoleItem & { userChosen?: boolean }> = {}
): ResolvedRoleItem {
  return { col, status, reason_vi: '', ...extra };
}

function mockRoles(overrides: Partial<BusinessResolvedRoles> = {}): BusinessResolvedRoles {
  return {
    revenue: mockResolvedItem(),
    cogs: mockResolvedItem(),
    profit: mockResolvedItem(),
    orders: mockResolvedItem(),
    channel: mockResolvedItem(),
    region: mockResolvedItem(),
    product: mockResolvedItem(),
    time: mockResolvedItem(),
    warnings: [],
    ...overrides,
  };
}

describe('PROMPT 2B PHẦN 0e.1: evaluateCodeConfidence 8 test cases', () => {
  // (a) file 20 dòng, cogs < rev, đủ cột xác nhận -> CAO
  it('(a) file 20 dòng, cogs < rev, đủ cột xác nhận -> CAO', () => {
    const revVals = Array(20).fill(10_000_000);
    const cogsVals = Array(20).fill(6_000_000);
    const table = mockTable('case_a.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
      mockMeasureColumn('cogs', 'Giá vốn', cogsVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      cogs: mockResolvedItem(table.columns[1], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
      gross_profit: { status: 'tính được', feasible: true, name: 'Lợi nhuận gộp' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, 120_000_000);
    expect(conf.level).toBe('HIGH');
    expect(conf.level_vi).toBe('CAO');
    expect(conf.reasons.length).toBe(0);
  });

  // (b) file có cột số đơn trung bình 5 đơn/dòng (< 1.000 đ nhưng đây là số đơn chứ không phải tiền), AOV bình thường -> KHÔNG bị hạ
  it('(b) file có cột số đơn TB 5 đơn/dòng (< 1000) và AOV bình thường -> KHÔNG bị hạ', () => {
    const revVals = Array(20).fill(10_000_000);
    const ordVals = Array(20).fill(5); // 5 đơn/dòng -> AOV = 2.000.000 đ (bình thường)
    const ordCol = mockMeasureColumn('ord', 'Số đơn', ordVals, { unit_suspicious: true }); // giả lập cờ vô lý đơn vị trên cột đơn
    const table = mockTable('case_b.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
      ordCol,
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      orders: mockResolvedItem(ordCol, 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
      total_orders: { status: 'tính được', feasible: true, name: 'Tổng số đơn' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, null);
    expect(conf.level).toBe('HIGH');
    expect(conf.level_vi).toBe('CAO');
    expect(conf.reasons.some((r) => r.includes('bất thường'))).toBe(false);
  });

  // (c) AOV = 500 đ (< 1.000 đ) -> THẤP
  it('(c) AOV = 500 đ (< 1.000 đ) -> THẤP', () => {
    const revVals = Array(20).fill(5_000);
    const ordVals = Array(20).fill(10); // AOV = 5.000 / 10 = 500 đ
    const table = mockTable('case_c.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
      mockMeasureColumn('ord', 'Số đơn', ordVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      orders: mockResolvedItem(table.columns[1], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 100_000, null);
    expect(conf.level).toBe('LOW');
    expect(conf.level_vi).toBe('THẤP');
    expect(conf.reasons.some((r) => r.includes('AOV =') && r.includes('bất thường'))).toBe(true);
  });

  // (d) không có cột đơn, doanh thu TB mỗi dòng = 500 đ -> THẤP
  it('(d) không có cột đơn, doanh thu TB mỗi dòng = 500 đ -> THẤP', () => {
    const revVals = Array(20).fill(500); // 500 đ / dòng
    const table = mockTable('case_d.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 10_000, null);
    expect(conf.level).toBe('LOW');
    expect(conf.level_vi).toBe('THẤP');
    expect(conf.reasons.some((r) => r.includes('doanh thu trung bình mỗi dòng') && r.includes('bất thường'))).toBe(true);
  });

  // (e) cogs > rev -> THẤP
  it('(e) cogs > rev -> THẤP', () => {
    const revVals = Array(20).fill(10_000_000);
    const cogsVals = Array(20).fill(15_000_000);
    const table = mockTable('case_e.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
      mockMeasureColumn('cogs', 'Giá vốn', cogsVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      cogs: mockResolvedItem(table.columns[1], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
      gross_profit: { status: 'tính được', feasible: true, name: 'Lợi nhuận gộp' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, 300_000_000);
    expect(conf.level).toBe('LOW');
    expect(conf.level_vi).toBe('THẤP');
    expect(conf.reasons.some((r) => r.includes('lớn hơn doanh thu'))).toBe(true);
  });

  // (f) 6 dòng -> THẤP "Dữ liệu ít (6 dòng)"
  it('(f) 6 dòng -> THẤP "Dữ liệu ít (6 dòng)"', () => {
    const revVals = Array(6).fill(10_000_000);
    const table = mockTable('case_f.csv', 6, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 60_000_000, null);
    expect(conf.level).toBe('LOW');
    expect(conf.level_vi).toBe('THẤP');
    expect(conf.warning).toBe('Dữ liệu ít (6 dòng), kết luận chỉ mang tính tham khảo.');
    expect(conf.reasons).toContain('Dữ liệu ít (6 dòng), kết luận chỉ mang tính tham khảo.');
  });

  // (g) chỉ số người dùng chọn bị khóa -> TRUNG BÌNH
  it('(g) chỉ số người dùng chọn bị khóa -> TRUNG BÌNH', () => {
    const revVals = Array(20).fill(10_000_000);
    const table = mockTable('case_g.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
      gross_profit: { status: 'khóa', feasible: false, reason: 'Thiếu cột Giá vốn', name: 'Lợi nhuận gộp' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, null);
    expect(conf.level).toBe('MEDIUM');
    expect(conf.level_vi).toBe('TRUNG BÌNH');
    expect(conf.reasons.some((r) => r.includes('bị khóa'))).toBe(true);
  });

  // (h) cột do người dùng chọn tay -> không hạ TRUNG BÌNH vì lý do suy luận
  it('(h) cột do người dùng chọn tay -> không hạ TRUNG BÌNH vì lý do suy luận', () => {
    const revVals = Array(20).fill(10_000_000);
    const colRev = mockMeasureColumn('rev', 'Doanh thu', revVals, { userChosenRole: 'revenue' });
    const table = mockTable('case_h.csv', 20, [colRev]);
    const roles = mockRoles({
      revenue: mockResolvedItem(colRev, 'tìm thấy', { userChosen: true } as any),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, null);
    expect(conf.level).toBe('HIGH');
    expect(conf.level_vi).toBe('CAO');
    expect(conf.reasons.length).toBe(0);
  });

  // (i) lợi nhuận tính ra từ giá vốn -> CAO (Prompt 3A 0g.3)
  it('(i) lợi nhuận tính ra từ giá vốn -> CAO (Prompt 3A 0g.3)', () => {
    const revVals = Array(20).fill(10_000_000);
    const cogsVals = Array(20).fill(6_000_000);
    const table = mockTable('case_i.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
      mockMeasureColumn('cogs', 'Giá vốn', cogsVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      cogs: mockResolvedItem(table.columns[1], 'tìm thấy'),
      profit: mockResolvedItem(null, 'tính ra'), // lợi nhuận tính ra, không phải suy luận
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
      gross_profit: { status: 'tính được', feasible: true, name: 'Lợi nhuận gộp' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, 120_000_000);
    expect(conf.level).toBe('HIGH');
    expect(conf.level_vi).toBe('CAO');
    expect(conf.reasons.length).toBe(0);
  });

  // (j) cột doanh thu suy luận chưa xác nhận -> TRUNG BÌNH (Prompt 3A 0g.3)
  it('(j) cột doanh thu suy luận chưa xác nhận -> TRUNG BÌNH (Prompt 3A 0g.3)', () => {
    const revVals = Array(20).fill(10_000_000);
    const table = mockTable('case_j.csv', 20, [
      mockMeasureColumn('col_inferred', 'Số tiền thanh toán', revVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'suy luận'), // suy luận chưa chọn tay/xác nhận
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 200_000_000, null);
    expect(conf.level).toBe('MEDIUM');
    expect(conf.level_vi).toBe('TRUNG BÌNH');
    expect(conf.reasons.some((r) => r.includes('Doanh thu') && r.includes('suy luận'))).toBe(true);
  });

  // (k) bảng chỉ có giá vốn là cột suy luận chưa xác nhận -> phải hạ TRUNG BÌNH; cột người dùng chọn tay -> không hạ (Prompt 3A 0g.2)
  it('(k) bảng chỉ có giá vốn là cột suy luận chưa xác nhận -> TRUNG BÌNH, chọn tay -> không hạ', () => {
    const revVals = Array(20).fill(10_000_000);
    const cogsVals = Array(20).fill(6_000_000);
    const table = mockTable('case_k.csv', 20, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
      mockMeasureColumn('cogs_inferred', 'Tiền nhập hàng', cogsVals),
    ]);

    // Khi chưa chọn tay -> TRUNG BÌNH
    const rolesUnconfirmed = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      cogs: mockResolvedItem(table.columns[1], 'suy luận'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf1 = evaluateCodeConfidence(table, rolesUnconfirmed, selectedResults, 200_000_000, 120_000_000);
    expect(conf1.level).toBe('MEDIUM');
    expect(conf1.level_vi).toBe('TRUNG BÌNH');
    expect(conf1.reasons.some((r) => r.includes('Giá vốn') && r.includes('suy luận'))).toBe(true);

    // Khi người dùng chọn tay/xác nhận -> không hạ (CAO)
    const rolesConfirmed = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      cogs: mockResolvedItem(table.columns[1], 'suy luận', { userChosen: true }),
    });
    const conf2 = evaluateCodeConfidence(table, rolesConfirmed, selectedResults, 200_000_000, 120_000_000);
    expect(conf2.level).toBe('HIGH');
    expect(conf2.level_vi).toBe('CAO');
    expect(conf2.reasons.length).toBe(0);
  });

  // (l) translateBusinessRoleId dịch chuẩn các vai trò và trả về "cột chưa rõ" khi id lạ (Prompt 3A 0g.1)
  it('(l) translateBusinessRoleId dịch chuẩn các vai trò và trả về "cột chưa rõ" khi id lạ', () => {
    expect(translateBusinessRoleId('cogs')).toBe('Giá vốn');
    expect(translateBusinessRoleId('cost')).toBe('Giá vốn');
    expect(translateBusinessRoleId('revenue')).toBe('Doanh thu');
    expect(translateBusinessRoleId('profit')).toBe('Lợi nhuận gộp');
    expect(translateBusinessRoleId('orders')).toBe('Số đơn');
    expect(translateBusinessRoleId('product')).toBe('Sản phẩm');
    expect(translateBusinessRoleId('channel')).toBe('Kênh');
    expect(translateBusinessRoleId('region')).toBe('Khu vực');
    expect(translateBusinessRoleId('period')).toBe('Tháng');
    expect(translateBusinessRoleId('time')).toBe('Tháng');
    expect(translateBusinessRoleId('Lợi nhuận gộp')).toBe('Lợi nhuận gộp');
    expect(translateBusinessRoleId('Doanh thu')).toBe('Doanh thu');
    // ID không có nhãn -> "cột chưa rõ"
    expect(translateBusinessRoleId('unknown_id')).toBe('cột chưa rõ');
    expect(translateBusinessRoleId('foo_bar')).toBe('cột chưa rõ');
    expect(translateBusinessRoleId('')).toBe('cột chưa rõ');
    expect(translateBusinessRoleId(null)).toBe('cột chưa rõ');
    expect(translateBusinessRoleId(undefined)).toBe('cột chưa rõ');
  });

  // (m) chứng minh vòng lặp duyệt đủ 8 vai trò thật trong RESOLVED_ROLE_KEYS (Prompt 3A 0g.2)
  it('(m) vòng lặp duyệt đủ 8 vai trò thật trong RESOLVED_ROLE_KEYS', () => {
    expect(RESOLVED_ROLE_KEYS).toHaveLength(8);
    expect(RESOLVED_ROLE_KEYS).toEqual([
      'revenue',
      'cogs',
      'profit',
      'orders',
      'channel',
      'region',
      'product',
      'time',
    ]);
  });

  // (n) đúng 10 dòng -> không hạ THẤP (dien-may đúng 10 dòng giữ CAO) (Prompt 3B 0h.5)
  it('(n) đúng 10 dòng -> không hạ THẤP (dien-may đúng 10 dòng giữ CAO)', () => {
    const revVals = Array(10).fill(10_000_000);
    const table = mockTable('dien-may.csv', 10, [
      mockMeasureColumn('rev', 'Doanh thu', revVals),
    ]);
    const roles = mockRoles({
      revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
    });
    const selectedResults = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };
    const conf = evaluateCodeConfidence(table, roles, selectedResults, 100_000_000, null);
    expect(table.n).toBe(10);
    expect(conf.level).toBe('HIGH');
    expect(conf.level_vi).toBe('CAO');
    expect(conf.reasons).toEqual([]);
  });

  describe('PROMPT 5A-FIX2: evaluateCodeConfidence 8 boundary test cases', () => {
    const mockBaseSelected = {
      total_revenue: { status: 'tính được', feasible: true, name: 'Tổng doanh thu' } as any,
    };

    // 1. 9 dòng sạch -> THẤP
    it('1. 9 dòng sạch (< 10) -> THẤP', () => {
      const table = mockTable('test_9_rows.csv', 9, [
        mockMeasureColumn('rev', 'Doanh thu', Array(9).fill(10_000_000)),
      ]);
      const roles = mockRoles({ revenue: mockResolvedItem(table.columns[0], 'tìm thấy') });
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 90_000_000, null);
      expect(conf.level_vi).toBe('THẤP');
      expect(conf.reasons.some((r) => r.includes('9 dòng'))).toBe(true);
    });

    // 2. Đúng 10 dòng sạch -> KHÔNG bị hạ (CAO)
    it('2. Đúng 10 dòng sạch -> KHÔNG bị hạ (CAO)', () => {
      const table = mockTable('test_10_rows.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(10_000_000)),
      ]);
      const roles = mockRoles({ revenue: mockResolvedItem(table.columns[0], 'tìm thấy') });
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 100_000_000, null);
      expect(conf.level_vi).toBe('CAO');
      expect(conf.reasons).toHaveLength(0);
    });

    // 3. AOV 999 đ (< 1.000 đ) -> THẤP
    it('3. AOV 999 đ (< 1.000 đ) -> THẤP', () => {
      const ordCol = mockMeasureColumn('ord', 'Số đơn', [10]);
      const table = mockTable('test_aov_999.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(999)),
        ordCol,
      ]);
      const roles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
        orders: mockResolvedItem(ordCol, 'tìm thấy'),
      });
      // totalRev = 9.990, totalOrd = 10 -> aov = 999
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 9_990, null);
      expect(conf.level_vi).toBe('THẤP');
      expect(conf.reasons.some((r) => r.includes('AOV = 999 đ'))).toBe(true);
    });

    // 4. AOV 1.000 đ (ngưỡng tối thiểu) -> KHÔNG bị hạ (CAO)
    it('4. AOV 1.000 đ (đúng ngưỡng tối thiểu) -> KHÔNG bị hạ (CAO)', () => {
      const ordCol = mockMeasureColumn('ord', 'Số đơn', [10]);
      const table = mockTable('test_aov_1000.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(1_000)),
        ordCol,
      ]);
      const roles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
        orders: mockResolvedItem(ordCol, 'tìm thấy'),
      });
      // totalRev = 10.000, totalOrd = 10 -> aov = 1.000
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 10_000, null);
      expect(conf.level_vi).toBe('CAO');
      expect(conf.reasons).toHaveLength(0);
    });

    // 5. Giá vốn > Doanh thu -> THẤP
    it('5. Giá vốn > Doanh thu -> THẤP', () => {
      const table = mockTable('test_loss.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(10_000_000)),
        mockMeasureColumn('cogs', 'Giá vốn', Array(10).fill(15_000_000)),
      ]);
      const roles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
        cogs: mockResolvedItem(table.columns[1], 'tìm thấy'),
      });
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 100_000_000, 150_000_000);
      expect(conf.level_vi).toBe('THẤP');
      expect(conf.reasons.some((r) => r.includes('lớn hơn doanh thu'))).toBe(true);
    });

    // 6. Vai trò tính ra ('tính ra') -> KHÔNG bị hạ (CAO)
    it('6. Vai trò tính ra (status = "tính ra") -> KHÔNG bị hạ (CAO)', () => {
      const table = mockTable('test_computed_role.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(10_000_000)),
        mockMeasureColumn('cogs', 'Giá vốn', Array(10).fill(6_000_000)),
      ]);
      const roles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
        cogs: mockResolvedItem(table.columns[1], 'tìm thấy'),
        profit: mockResolvedItem(null, 'tính ra'),
      });
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 100_000_000, 60_000_000);
      expect(conf.level_vi).toBe('CAO');
      expect(conf.reasons).toHaveLength(0);
    });

    // 7. Vai trò suy luận chưa xác nhận ('suy luận') -> TRUNG BÌNH
    it('7. Vai trò suy luận chưa xác nhận (status = "suy luận", userChosen = false) -> TRUNG BÌNH', () => {
      const table = mockTable('test_inferred_role.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(10_000_000)),
        mockMeasureColumn('col_unclear', 'Cột mờ', Array(10).fill(5_000_000)),
      ]);
      const roles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
        cogs: mockResolvedItem(table.columns[1], 'suy luận', { userChosen: false }),
      });
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 100_000_000, 50_000_000);
      expect(conf.level_vi).toBe('TRUNG BÌNH');
      expect(conf.reasons.some((r) => r.includes('sử dụng giá trị suy luận'))).toBe(true);
    });

    // 8. Người dùng tự chọn cột (userChosen = true hoặc userChosenRole) -> KHÔNG bị hạ (CAO)
    it('8. Người dùng tự chọn cột (userChosen = true) -> KHÔNG bị hạ (CAO)', () => {
      const table = mockTable('test_user_chosen.csv', 10, [
        mockMeasureColumn('rev', 'Doanh thu', Array(10).fill(10_000_000)),
        mockMeasureColumn('col_custom', 'Doanh thu tự chọn', Array(10).fill(10_000_000), {
          userChosenRole: 'revenue',
        }),
      ]);
      const roles = mockRoles({
        revenue: mockResolvedItem(table.columns[1], 'suy luận', { userChosen: true }),
      });
      const conf = evaluateCodeConfidence(table, roles, mockBaseSelected, 100_000_000, null);
      expect(conf.level_vi).toBe('CAO');
      expect(conf.reasons).toHaveLength(0);
    });
  });
});
