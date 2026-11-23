import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  getSession,
  setSessionMetricSelection,
} from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { buildSessionView, transition, type SessionRecord } from '../core/state';
import { BUSINESS_METRIC_CATALOG } from '../core/metrics/businessCatalog';
import { buildBusinessFacts, checkFeasibility } from '../core/metrics/businessFeasibility';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';
import { computeSelected } from '../core/metrics/businessComputeSelected';
import { getCurrentStepPath, getLockExplanation } from '../utils/navigation';
import { validateBytes } from '../core/validator';

describe('PROMPT 2A-1: Bước Trao đổi chọn chỉ số & điều hướng', () => {
  beforeEach(() => {
    sessionStore.clearAll();
  });

  describe('1. Cấu hình bước (5 bước Giao dịch vs 6 bước Kinh doanh)', () => {
    it('chế độ giao dịch giữ nguyên đúng 5 bước quy trình', () => {
      const session = createSession('Phiên Giao Dịch');
      expect(session.steps.length).toBe(5);
      expect(session.steps.map((s) => s.key)).toEqual([
        'upload',
        'clean',
        'review',
        'analyze',
        'report',
      ]);
    });

    it('chế độ kinh doanh có đúng 6 bước quy trình, bước 4 là Trao đổi', () => {
      const session = createSession('Phiên Kinh Doanh');
      const record = sessionStore.getRecord(session.id)!;
      record.meta.dataset = {
        kind: 'business',
        filename: 'du-lieu-test-ban-le.csv',
        rows: 24,
        symbols: [],
        date_from: '2024-01-01',
        date_to: '2024-03-31',
      };
      sessionStore.setRecord(record);

      const view = getSession(session.id);
      expect(view.steps.length).toBe(6);
      expect(view.steps.map((s) => s.key)).toEqual([
        'upload',
        'clean',
        'review',
        'exchange',
        'analyze',
        'report',
      ]);
      expect(view.steps[3].label_vi).toBe('Trao đổi');
    });
  });

  describe('2. Trạng thái bước & Mở khóa trang (RouteGuard & Stepper)', () => {
    it('ở trạng thái clean_approved nhưng chưa chọn chỉ số: bước Trao đổi là current, Phân tích bị khóa', () => {
      const session = createSession('Phiên Test Cổng 1');
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
          clean_version: 1,
        },
      };
      sessionStore.setRecord(record);

      const view = getSession(session.id);
      expect(view.steps[2].status).toBe('done'); // Cổng duyệt 1
      expect(view.steps[3].status).toBe('current'); // Trao đổi
      expect(view.steps[4].status).toBe('locked'); // Phân tích

      expect(view.unlocked_pages).toContain('exchange');
      expect(view.unlocked_pages).not.toContain('analyze');

      // Check navigation & RouteGuard helper
      const isBusiness = true;
      const confirmed = false;
      const target = getCurrentStepPath(view.state, isBusiness, confirmed);
      expect(target).toBe('/trao-doi');

      const lockExpl = getLockExplanation('analyze', view.state, isBusiness, confirmed);
      expect(lockExpl.actionPath).toBe('/trao-doi');
      expect(lockExpl.message).toContain('Trao đổi');
    });

    it('sau khi xác nhận chọn chỉ số: bước Trao đổi là done, Phân tích là current và được mở khóa', () => {
      const session = createSession('Phiên Test Xác Nhận');
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
          clean_version: 1,
        },
      };
      sessionStore.setRecord(record);

      // Confirm 2 metrics
      const updated = setSessionMetricSelection(
        session.id,
        ['revenue_by_channel', 'revenue_by_product'],
        true
      );

      expect(updated.steps[3].status).toBe('done'); // Trao đổi done
      expect(updated.steps[4].status).toBe('current'); // Phân tích current
      expect(updated.unlocked_pages).toContain('analyze');
      expect(updated.selected_metric_ids).toEqual(['revenue_by_channel', 'revenue_by_product']);
      expect(updated.metric_selection_confirmed).toBe(true);
    });

    it('khi mở lại Cổng 1 để sửa (reclean): reset cờ xác nhận nhưng GIỮ NGUYÊN danh sách chỉ số', () => {
      const session = createSession('Phiên Mở Lại Cổng 1');
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
          clean_version: 1,
          selected_metric_ids: ['total_revenue', 'total_orders'],
          metric_selection_confirmed: true,
        },
      };
      sessionStore.setRecord(record);

      // Trigger reclean transition
      const { nextRecord } = transition(record, 'reclean');
      expect(nextRecord.state).toBe('cleaning_review');
      expect(nextRecord.meta.metric_selection_confirmed).toBeUndefined();
      // Retain selected_metric_ids
      expect(nextRecord.meta.selected_metric_ids).toEqual(['total_revenue', 'total_orders']);

      const view = buildSessionView(nextRecord);
      expect(view.unlocked_pages).not.toContain('exchange');
      expect(view.unlocked_pages).not.toContain('analyze');
    });
  });

  describe('3. Khả thi & Lọc tính toán theo tập chỉ số đã chọn', () => {
    const csvContent = [
      'Mã đơn,Thời gian,Kênh bán,Sản phẩm,Khu vực,Doanh thu,Giá vốn,Số lượng',
      'DH-001,2024-01-15,Website,Áo thun,Hà Nội,500000,300000,2',
      'DH-002,2024-01-16,Cửa hàng,Quần jeans,TP.HCM,800000,500000,1',
      'DH-003,2024-02-10,Website,Sơ mi,Đà Nẵng,600000,350000,1',
      'DH-004,2024-02-15,Cửa hàng,Áo thun,Hà Nội,450000,250000,2',
      'DH-005,2024-03-01,Website,Túi tote,TP.HCM,300000,150000,3',
    ].join('\n');

    it('tính toán đúng danh sách chỉ số được chọn, loại bỏ chỉ số không chọn', async () => {
      const parsed = await validateBytes('test.csv', new TextEncoder().encode(csvContent));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok || !parsed.businessTable) throw new Error('validation failed');
      const table = parsed.businessTable;
      const roles = resolveBusinessRoles(table);
      const facts = buildBusinessFacts(table, roles);

      // All 13 metrics feasibility check
      for (const def of BUSINESS_METRIC_CATALOG) {
        const feas = checkFeasibility(def.id, facts);
        expect(feas).toBeDefined();
      }

      // Compute with ONLY 2 metrics
      const selectedIds = ['revenue_by_channel', 'revenue_by_product'];
      const result = computeSelected(table, selectedIds);

      expect(Object.keys(result.metrics)).toEqual(selectedIds);
      expect(result.metrics['revenue_by_channel']).toBeDefined();
      expect(result.metrics['revenue_by_product']).toBeDefined();
      expect(result.metrics['total_revenue']).toBeUndefined();
      expect(result.metrics['gross_margin']).toBeUndefined();
    });
  });
});
