import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateCodeConfidence } from '../core/metrics/businessComputeSelected';
import type { BusinessTable, BusinessColumn } from '../core/businessTable';
import type { BusinessResolvedRoles, ResolvedRoleItem } from '../core/metrics/businessRoles';
import { createSession } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { getCurrentStepPath } from '../utils/navigation';
import { transition, type SessionRecord } from '../core/state';
import { isTableRecognitionConfident } from '../components/clean/FileReadConfirmationPanel';

function mockMeasureColumn(key: string, label: string, values: number[]): BusinessColumn {
  return {
    role: 'measure',
    key,
    label,
    values: new Float64Array(values),
  } as unknown as BusinessColumn;
}

function mockTable(filename: string, n: number, columns: BusinessColumn[]): BusinessTable {
  return {
    kind: 'business',
    filename,
    n,
    source_row: new Int32Array(n).map((_, i) => i + 1),
    columns,
  };
}

function mockResolvedItem(col: BusinessColumn | null = null, status: ResolvedRoleItem['status'] = 'thiếu'): ResolvedRoleItem {
  return { col, status, reason_vi: '' };
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

describe('PROMPT 2A-2 PHẦN 0d: Kiểm thử bổ sung & Bảo vệ độ tin cậy', () => {
  beforeEach(() => {
    sessionStore.clearAll();
  });

  // =========================================================================
  // 0d.3: Test bắt lỗi độ tin cậy (evaluateCodeConfidence)
  // =========================================================================
  describe('0d.3: Kiểm thử ngưỡng AOV / Đơn vị bất thường trong evaluateCodeConfidence', () => {
    it('Ca 1: Cột Số đơn trung bình dưới 1.000 nhưng AOV bình thường -> KHÔNG bị hạ bậc vì ngưỡng', () => {
      // 10 dòng, doanh thu mỗi dòng 50.000.000 đ, số đơn mỗi dòng 10 đơn (trung bình 10 < 1.000)
      // AOV = 50.000.000 / 10 = 5.000.000 đ (nằm trong ngưỡng 1.000 đ - 50.000.000.000 đ)
      const revValues = Array(12).fill(50_000_000);
      const ordValues = Array(12).fill(10);

      const table = mockTable('synthetic_valid_aov.csv', 12, [
        mockMeasureColumn('col_rev', 'Doanh thu', revValues),
        mockMeasureColumn('col_ord', 'Số đơn', ordValues),
      ]);

      const roles: BusinessResolvedRoles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'suy luận'),
        orders: mockResolvedItem(table.columns[1], 'suy luận'),
      });

      const totalRev = 12 * 50_000_000;
      const totalCogs = null;
      const selectedResults: Record<string, any> = {
        total_revenue: { status: 'tính được', feasible: true },
        total_orders: { status: 'tính được', feasible: true },
      };

      const conf = evaluateCodeConfidence(table, roles, selectedResults, totalRev, totalCogs);
      // Không bị cờ đơn vị AOV bất thường hạ xuống THẤP
      expect(conf.level).not.toBe('LOW');
      expect(conf.reasons.some((r) => r.includes('AOV =') && r.includes('bất thường'))).toBe(false);
    });

    it('Ca 2: Bảng có AOV = 500 đ (< 1.000 đ) -> Bị hạ xuống THẤP kèm lý do rõ ràng', () => {
      // 12 dòng, doanh thu 5.000 đ, số đơn 10 đơn -> AOV = 500 đ
      const revValues = Array(12).fill(5_000);
      const ordValues = Array(12).fill(10);

      const table = mockTable('synthetic_low_aov.csv', 12, [
        mockMeasureColumn('col_rev', 'Doanh thu', revValues),
        mockMeasureColumn('col_ord', 'Số đơn', ordValues),
      ]);

      const roles: BusinessResolvedRoles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'suy luận'),
        orders: mockResolvedItem(table.columns[1], 'suy luận'),
      });

      const totalRev = 12 * 5_000;
      const totalCogs = null;
      const selectedResults: Record<string, any> = {
        total_revenue: { status: 'tính được', feasible: true },
      };

      const conf = evaluateCodeConfidence(table, roles, selectedResults, totalRev, totalCogs);
      expect(conf.level).toBe('LOW');
      expect(conf.reasons.some((r) => r.includes('AOV =') && r.includes('bất thường'))).toBe(true);
    });

    it('Ca 3: Bảng không có cột đơn, doanh thu mỗi dòng 500 đ (< 1.000 đ) -> Bị hạ xuống THẤP', () => {
      // 12 dòng, doanh thu mỗi dòng 500 đ
      const revValues = Array(12).fill(500);

      const table = mockTable('synthetic_low_row_rev.csv', 12, [
        mockMeasureColumn('col_rev', 'Doanh thu', revValues),
      ]);

      const roles: BusinessResolvedRoles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'suy luận'),
      });

      const totalRev = 12 * 500;
      const totalCogs = null;
      const selectedResults: Record<string, any> = {
        total_revenue: { status: 'tính được', feasible: true },
      };

      const conf = evaluateCodeConfidence(table, roles, selectedResults, totalRev, totalCogs);
      expect(conf.level).toBe('LOW');
      expect(conf.reasons.some((r) => r.includes('doanh thu trung bình mỗi dòng') && r.includes('bất thường'))).toBe(true);
    });
  });

  // =========================================================================
  // 0d.7: Đối chiếu các ca kiểm thử nghiệp vụ (a - i)
  // =========================================================================
  describe('0d.7: Bộ kiểm thử hồi quy luồng Trao đổi & Cổng 1 (a - i)', () => {
    it('(a) & (b): Cột đoán chưa xác nhận -> isTableRecognitionConfident = false (Khóa); Xác nhận -> true (Mở)', () => {
      const table = mockTable('cot-la-6-dong.csv', 6, [
        mockMeasureColumn('rev', 'Khoản thu KH', [2e6, 1e6]),
      ]);

      // 1. Khi Doanh thu chưa nhận diện / chưa chọn -> không confident
      const rolesUnassigned: BusinessResolvedRoles = mockRoles({
        revenue: mockResolvedItem(null, 'thiếu'),
      });
      expect(isTableRecognitionConfident(table, rolesUnassigned)).toBe(false);

      // 2. Khi Doanh thu đã được người dùng chọn -> confident = true
      table.columns[0].userChosenRole = 'revenue';
      const rolesChosen: BusinessResolvedRoles = mockRoles({
        revenue: mockResolvedItem(table.columns[0], 'tìm thấy'),
      });
      expect(isTableRecognitionConfident(table, rolesChosen)).toBe(true);
    });

    it('(d): Mở lại Cổng 1 để sửa (reclean) -> Giữ nguyên selected_metric_ids và reset cờ xác nhận', () => {
      const session = createSession('Phiên Reclean');
      const record: SessionRecord = {
        ...sessionStore.getRecord(session.id)!,
        state: 'clean_approved',
        meta: {
          dataset: {
            kind: 'business',
            filename: 'du-lieu-test-ban-le.csv',
            rows: 24,
            symbols: [],
            date_from: '2024-01-01',
            date_to: '2024-03-31',
          },
          selected_metric_ids: ['total_revenue', 'gross_profit', 'gross_margin'],
          metric_selection_confirmed: true,
          clean_version: 1,
        },
      };
      sessionStore.setRecord(record);

      // Trigger reclean transition
      const { nextRecord } = transition(record, 'reclean');
      expect(nextRecord.state).toBe('cleaning_review');
      expect(nextRecord.meta.selected_metric_ids).toEqual(['total_revenue', 'gross_profit', 'gross_margin']);
      expect(nextRecord.meta.metric_selection_confirmed).toBeUndefined();
    });

    it('(f): RouteGuard kiểm tra 3 ca chặn chuyển hướng chính xác', () => {
      // 1. Chưa duyệt Cổng 1 -> Cố vào /trao-doi chuyển hướng về /lam-sach
      const path1 = getCurrentStepPath('cleaning_review', true, false);
      expect(path1).toBe('/lam-sach');

      // 2. Đã duyệt Cổng 1 nhưng chưa chọn chỉ số -> Cố vào /phan-tich chuyển hướng về /trao-doi
      const path2 = getCurrentStepPath('clean_approved', true, false);
      expect(path2).toBe('/trao-doi');

      // 3. Đã xác nhận chọn chỉ số -> Đến /phan-tich
      const path3 = getCurrentStepPath('clean_approved', true, true);
      expect(path3).toBe('/phan-tich');
    });

    it('(i): Chế độ Giao dịch cách ly tuyệt đối: 5 bước quy trình, không có bước Trao đổi', () => {
      const session = createSession('Phiên Giao Dịch Chuẩn');
      expect(session.steps.length).toBe(5);
      expect(session.steps.some((s) => s.key === 'exchange')).toBe(false);
      expect(session.steps.some((s) => s.label_vi.includes('Trao đổi'))).toBe(false);

      // Khi duyệt Cổng 1 trong chế độ giao dịch -> đi thẳng đến /phan-tich
      const tradingPath = getCurrentStepPath('clean_approved', false, false);
      expect(tradingPath).toBe('/phan-tich');
    });
  });
});
