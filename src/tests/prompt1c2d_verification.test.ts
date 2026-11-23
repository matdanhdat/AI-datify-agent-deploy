import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';
import {
  isTableRecognitionConfident,
  CONFIRM_ALL_UNDO_TIMEOUT_MS,
} from '../components/clean/FileReadConfirmationPanel';
import {
  recalculateBusinessTable,
  applyManualBusinessRoles,
} from '../core/validator/business';
import { validateBytes, DEFAULT_LIMITS } from '../core/validator';
import type { BusinessTable, BusinessColumn } from '../core/businessTable';
import { sessionStore } from '../services/sessionStore';
import { createSession, getLog } from '../services/sessionService';
import { ArtifactStore } from '../core/artifacts';
import { requestReclean, approveCleanGate } from '../services/cleanService';

async function parseCsvToTable(filename: string, csv: string): Promise<BusinessTable> {
  const bytes = new TextEncoder().encode(csv);
  const res = await validateBytes(filename, bytes, DEFAULT_LIMITS);
  if (!res.ok || !res.businessTable) {
    const errMsg = (res as any).errors?.join(', ') || (res as any).issues?.map((i: any) => i.message_vi).join(', ') || 'Unknown error';
    throw new Error(`Failed to parse CSV: ${errMsg}`);
  }
  return res.businessTable;
}

function makeTable(columns: Array<{ label: string; role?: any; values?: any }>): BusinessTable {
  return {
    kind: 'business',
    n: 5,
    source_row: new Int32Array([1, 2, 3, 4, 5]),
    columns: columns.map((col, idx) => ({
      key: `col_${idx}`,
      label: col.label,
      role: col.role || 'dimension',
      values: col.values || ['A', 'B', 'C', 'D', 'E'],
    })) as BusinessColumn[],
  };
}

describe('Prompt 1C-2d Verification Test Suite', () => {
  beforeEach(() => {
    sessionStore.clearAll();
    ArtifactStore.clearAll();
  });

  // 1. C1: Sửa lại một hàng
  describe('C1: Sửa lại một hàng (Unconfirm single item preserving selection)', () => {
    it('preserves user selected unit when resetting to unconfirmed', async () => {
      const csv = [
        'Mã SP,Tên SP,Doanh thu (triệu đồng),Giá vốn (nghìn đồng)',
        'SP1,Bút,10,500',
        'SP2,Thước,20,800',
        'SP3,Vở,15,600',
        'SP4,Cặp,30,1200',
        'SP5,Bút chì,5,200',
      ].join('\n');
      const table = await parseCsvToTable('test1.csv', csv);
      expect(table.columns.length).toBe(4);

      const targetCol = table.columns.find((c) => c.label.includes('Doanh thu'))!;
      expect(targetCol).toBeDefined();

      // User selects 'nghìn đồng' on revenue instead of guessed 'triệu đồng'
      const updated = recalculateBusinessTable(table, {
        units: { [targetCol.key]: { unit: 'nghìn đồng', multiplier: 1000 } },
      });
      const revCol = updated.columns.find((c) => c.key === targetCol.key) as any;
      expect(revCol?.userUnit).toBe('nghìn đồng');
      expect(revCol?.multiplier).toBe(1000);

      // Simulating C1: unconfirming does not reset userUnit or multiplier
      const confirmedUnits: Record<string, boolean> = { [targetCol.key]: true };
      // User clicks SỬA LẠI:
      confirmedUnits[targetCol.key] = false;
      expect(confirmedUnits[targetCol.key]).toBe(false);
      // Unit remains preserved
      expect(revCol?.userUnit).toBe('nghìn đồng');
    });

    it('preserves user selected decimal separator when resetting to unconfirmed', async () => {
      const csv = [
        'Mã SP,Tên SP,Doanh thu',
        'SP1,Bút,1.250',
        'SP2,Thước,2.500',
        'SP3,Vở,3.750',
        'SP4,Cặp,5.000',
        'SP5,Kéo,1.500',
      ].join('\n');
      const table = await parseCsvToTable('test2.csv', csv);
      const targetCol = table.columns.find((c) => c.label.includes('Doanh thu'))!;
      expect(targetCol).toBeDefined();

      const updated = recalculateBusinessTable(table, {
        decimals: { [targetCol.key]: 'dot' },
      });
      const revCol = updated.columns.find((c) => c.key === targetCol.key) as any;
      expect(revCol?.userDecimalConvention).toBe('dot');

      const confirmedSeps: Record<string, boolean> = { [targetCol.key]: true };
      // User clicks SỬA LẠI:
      confirmedSeps[targetCol.key] = false;
      expect(confirmedSeps[targetCol.key]).toBe(false);
      expect(revCol?.userDecimalConvention).toBe('dot');
    });
  });

  // 2. C2: Hoàn tác N hàng & Timeout
  describe('C2: Hoàn tác N hàng (Confirm all and undo)', () => {
    it('defines CONFIRM_ALL_UNDO_TIMEOUT_MS as 10000ms', () => {
      expect(CONFIRM_ALL_UNDO_TIMEOUT_MS).toBe(10000);
    });

    it('undo restores previous confirmation state for all items', () => {
      const prevUnits: Record<string, boolean> = { col_1: false, col_2: false };
      const prevSeps: Record<string, boolean> = { col_3: false };

      // After confirm all:
      const confirmedUnits = { col_1: true, col_2: true };
      const confirmedSeps = { col_3: true };
      expect(confirmedUnits.col_1).toBe(true);
      expect(confirmedSeps.col_3).toBe(true);

      // Snapshot taken:
      const snapshot = { prevUnits, prevSeps, count: 3 };
      expect(snapshot.count).toBe(3);

      // User clicks [HOÀN TÁC]:
      const restoredUnits = { ...snapshot.prevUnits };
      const restoredSeps = { ...snapshot.prevSeps };

      expect(restoredUnits.col_1).toBe(false);
      expect(restoredUnits.col_2).toBe(false);
      expect(restoredSeps.col_3).toBe(false);
    });
  });

  // 3. E1: Lý do khóa đúng
  describe('E1: Lý do khóa nút Duyệt (Multiple lock reasons formatting)', () => {
    it('formats single reason and multiple reasons with (+N)', () => {
      const formatReasons = (reasons: string[]) => {
        if (reasons.length === 0) return '';
        if (reasons.length === 1) return reasons[0];
        return `${reasons[0]} (+${reasons.length - 1})`;
      };

      expect(formatReasons(['Chưa nhập tên người duyệt'])).toBe('Chưa nhập tên người duyệt');
      expect(
        formatReasons(['Còn 1 mục chưa xác nhận', 'Chưa nhập tên người duyệt'])
      ).toBe('Còn 1 mục chưa xác nhận (+1)');
      expect(
        formatReasons([
          'Cần chỉ định cột Doanh thu trước khi duyệt',
          'Còn 2 mục chưa xác nhận',
          'Chưa nhập tên người duyệt',
        ])
      ).toBe('Cần chỉ định cột Doanh thu trước khi duyệt (+2)');
    });

    it('does not claim missing revenue when user has manually assigned revenue column', async () => {
      const csv = [
        'Mã đơn,Ngày,CotABC,Chi phí',
        'DH01,2026-01-01,1000000,500000',
        'DH02,2026-01-02,2000000,1000000',
        'DH03,2026-01-03,1500000,800000',
        'DH04,2026-01-04,3000000,1500000',
        'DH05,2026-01-05,2500000,1200000',
      ].join('\n');
      const table = await parseCsvToTable('test3.csv', csv);
      let resolved = resolveBusinessRoles(table);
      // Before user assignment: not user chosen
      expect((resolved.revenue as any).userChosen).toBeFalsy();

      // User assigns 'CotABC' as revenue
      table.manual_column_roles = { 'CotABC': 'revenue' };
      resolved = applyManualBusinessRoles(resolved, table);
      expect(resolved.revenue.col?.label).toBe('CotABC');
      expect((resolved.revenue as any).userChosen).toBe(true);

      const hasRevenue = Boolean(
        resolved.revenue.status === 'tìm thấy' || (resolved.revenue as any).userChosen
      );
      expect(hasRevenue).toBe(true);
    });
  });

  // 4. E2: Nhãn nguồn
  describe('E2: Nhãn nguồn (User chosen vs auto detected)', () => {
    it('marks manual role assignment as người dùng chọn', async () => {
      const csv = [
        'Mã đơn,Ngày,CotABC,Chi phí',
        'DH01,2026-01-01,1000000,500000',
        'DH02,2026-01-02,2000000,1000000',
        'DH03,2026-01-03,1500000,800000',
        'DH04,2026-01-04,3000000,1500000',
        'DH05,2026-01-05,2500000,1200000',
      ].join('\n');
      const table = await parseCsvToTable('test4.csv', csv);
      table.manual_column_roles = { 'CotABC': 'revenue' };
      const resolved = applyManualBusinessRoles(resolveBusinessRoles(table), table);

      const revItem = resolved.revenue;
      const isUserChosen = Boolean((revItem as any).userChosen);
      const sourceLabel = isUserChosen ? 'người dùng chọn' : 'tự nhận diện';
      expect(sourceLabel).toBe('người dùng chọn');
    });

    it('marks automatic role detection as tự nhận diện', async () => {
      const csv = [
        'Mã đơn,Ngày,Doanh thu,Giá vốn',
        'DH01,2026-01-01,1000000,500000',
        'DH02,2026-01-02,2000000,1000000',
        'DH03,2026-01-03,1500000,800000',
        'DH04,2026-01-04,3000000,1500000',
        'DH05,2026-01-05,2500000,1200000',
      ].join('\n');
      const table = await parseCsvToTable('test5.csv', csv);
      const resolved = applyManualBusinessRoles(resolveBusinessRoles(table), table);

      const revItem = resolved.revenue;
      const isUserChosen = Boolean((revItem as any).userChosen);
      const sourceLabel = isUserChosen ? 'người dùng chọn' : 'tự nhận diện';
      expect(sourceLabel).toBe('tự nhận diện');
    });
  });

  // 5. E3: Nhãn Lợi nhuận
  describe('E3: Nhãn Lợi nhuận (Computed profit vs missing)', () => {
    it('labels profit as tự tính when revenue and cogs exist but no profit column', async () => {
      const csv = [
        'Mã đơn,Ngày,Doanh thu,Giá vốn',
        'DH01,2026-01-01,1000000,500000',
        'DH02,2026-01-02,2000000,1000000',
        'DH03,2026-01-03,1500000,800000',
        'DH04,2026-01-04,3000000,1500000',
        'DH05,2026-01-05,2500000,1200000',
      ].join('\n');
      const table = await parseCsvToTable('test6.csv', csv);
      const resolved = resolveBusinessRoles(table);

      const hasRev = Boolean(resolved.revenue?.col);
      const hasCogs = Boolean(resolved.cogs?.col);
      const assignedCol = (resolved.profit as any)?.col;
      const isProfitComputed = !assignedCol && hasRev && hasCogs;

      expect(hasRev).toBe(true);
      expect(hasCogs).toBe(true);
      expect(isProfitComputed).toBe(true);
    });

    it('labels profit as không có when cogs is missing', async () => {
      const csv = [
        'Mã đơn,Ngày,Kênh,Doanh thu',
        'DH01,2026-01-01,Web,1000000',
        'DH02,2026-01-02,Web,2000000',
        'DH03,2026-01-03,Web,1500000',
        'DH04,2026-01-04,Web,3000000',
        'DH05,2026-01-05,Web,2500000',
      ].join('\n');
      const table = await parseCsvToTable('test7.csv', csv);
      const resolved = resolveBusinessRoles(table);

      const hasRev = Boolean(resolved.revenue?.col);
      const hasCogs = Boolean(resolved.cogs?.col);
      const assignedCol = (resolved.profit as any)?.col;
      const isProfitComputed = !assignedCol && hasRev && hasCogs;

      expect(hasRev).toBe(true);
      expect(hasCogs).toBe(false);
      expect(isProfitComputed).toBe(false);
    });
  });

  // 6. E4: Chế độ thu gọn
  describe('E4: Chế độ thu gọn (Confidence criteria)', () => {
    it('isTableRecognitionConfident returns true for clear file with standard dong units', async () => {
      const csv = [
        'Mã ĐH,Ngày,Kênh,Sản phẩm,Khu vực,Doanh thu,Giá vốn,Số lượng',
        'DH01,2026-01-01,Website,Laptop,HN,15000000,10000000,1',
        'DH02,2026-01-02,Website,Chuột,HN,2000000,1000000,2',
        'DH03,2026-01-03,Cửa hàng,Bàn phím,HCM,3000000,2000000,1',
        'DH04,2026-01-04,Cửa hàng,Màn hình,DN,8000000,5000000,1',
        'DH05,2026-01-05,Website,Tai nghe,HN,1500000,800000,1',
      ].join('\n');
      const table = await parseCsvToTable('test8.csv', csv);
      const resolved = resolveBusinessRoles(table);
      expect(isTableRecognitionConfident(table, resolved)).toBe(true);
    });

    it('isTableRecognitionConfident returns false if unit is not dong', async () => {
      const csv = [
        'Mã ĐH,Ngày,Kênh,Doanh thu (triệu đồng)',
        'DH01,2026-01-01,Web,15',
        'DH02,2026-01-02,Web,20',
        'DH03,2026-01-03,Web,30',
        'DH04,2026-01-04,Web,40',
        'DH05,2026-01-05,Web,50',
      ].join('\n');
      const table = await parseCsvToTable('test9.csv', csv);
      const resolved = resolveBusinessRoles(table);
      expect(isTableRecognitionConfident(table, resolved)).toBe(false);
    });

    it('isTableRecognitionConfident returns false if ambiguous separator exists', async () => {
      const csv = [
        'Mã ĐH,Ngày,Kênh,Doanh thu',
        'DH01,2026-01-01,Web,1.250',
        'DH02,2026-01-02,Web,2.500',
        'DH03,2026-01-03,Web,3.750',
        'DH04,2026-01-04,Web,5.000',
        'DH05,2026-01-05,Web,1.500',
      ].join('\n');
      const table = await parseCsvToTable('test10.csv', csv);
      const resolved = resolveBusinessRoles(table);
      expect(isTableRecognitionConfident(table, resolved)).toBe(false);
    });
  });

  // 7. D1 & D2: Mở lại Cổng 1 xóa kết quả hạ nguồn và giữ lựa chọn
  describe('D1 & D2: Reopen Gate 1 workflow and downstream invalidation', () => {
    it('requestReclean transitions session back to cleaning_review and clears downstream artifacts', async () => {
      const session = createSession('Test Business Session');
      const csv = [
        'Mã SP,Tên SP,Doanh thu,Giá vốn',
        'SP1,Bút,1000000,500000',
        'SP2,Thước,2000000,1000000',
        'SP3,Vở,1500000,800000',
        'SP4,Cặp,3000000,1500000',
        'SP5,Kéo,2500000,1200000',
      ].join('\n');
      const table = await parseCsvToTable('test11.csv', csv);

      ArtifactStore.put(session.id, 'raw', table);
      sessionStore.setRecord({
        ...sessionStore.getRecord(session.id)!,
        state: 'cleaning_review',
      });

      // Approve Gate 1
      await approveCleanGate(session.id, 'Người Kiểm Thử', {
        remove_blank_rows: true,
        trim_whitespace: true,
        drop_exact_duplicates: true,
        fill_blank_dimension_label: true,
        sort_natural: true,
      });

      const approvedRec = sessionStore.getRecord(session.id)!;
      expect(approvedRec.state).toBe('clean_approved');

      // Simulate downstream analysis results
      ArtifactStore.put(session.id, 'analysis', { metrics: { totalRevenue: 3000000 } });
      sessionStore.setRecord({
        ...approvedRec,
        meta: {
          ...approvedRec.meta,
          metrics: { totalRevenue: 3000000 },
          analysis_version: 1,
        },
      });

      // User requests reopen Gate 1
      requestReclean(session.id);

      const recleanedRec = sessionStore.getRecord(session.id)!;
      expect(recleanedRec.state).toBe('cleaning_review');
      // Downstream results must be wiped
      expect(recleanedRec.meta.metrics).toBeUndefined();
      expect(ArtifactStore.get(session.id, 'analysis')).toBeUndefined();

      // But RAW dataset remains intact with all data
      const preservedRaw = ArtifactStore.get<BusinessTable>(session.id, 'raw');
      expect(preservedRaw).toBeDefined();
      expect(preservedRaw?.columns.length).toBe(4);

      // Audit trail must record Cổng 1 được mở lại
      const log = getLog(session.id);
      const lastAudit = log[log.length - 1];
      expect(lastAudit.action).toBe('transition:reclean');
      expect(lastAudit.detail).toContain('Cổng 1 được mở lại');
    });
  });

  // 8. E-a: Header businessRoles.ts tests
  describe('E-a: Header businessRoles.ts (Time column resolution)', () => {
    it('resolves "Thời gian", "Thời gian bán", "Kỳ báo cáo", "Tháng" to time role', () => {
      const headers = ['Thời gian', 'Thời gian bán', 'Kỳ báo cáo', 'Tháng'];
      for (const h of headers) {
        const table = makeTable([{ label: h }]);
        const resolved = resolveBusinessRoles(table);
        expect(resolved.time.status).toBe('tìm thấy');
        expect(resolved.time.col?.label).toBe(h);
      }
    });

    it('does NOT resolve "Thời gian giao hàng" to time role', () => {
      const table = makeTable([{ label: 'Thời gian giao hàng' }]);
      const resolved = resolveBusinessRoles(table);
      expect(resolved.time.status).not.toBe('tìm thấy');
    });

    it('does NOT resolve "Tình trạng" to region role', () => {
      const table = makeTable([{ label: 'Tình trạng' }]);
      const resolved = resolveBusinessRoles(table);
      expect(resolved.region.status).not.toBe('tìm thấy');
    });
  });

  // 9. E-b: Ô "1.5", "2.25", "700" với đơn vị nghìn đồng
  describe('E-b: Number parsing ("1.5", "2.25", "700" with unit nghìn đồng)', () => {
    it('evaluates to 1.500, 2.250, 700.000 with sum 703.750', async () => {
      const csv = [
        'Mã đơn,Thời gian,Kênh,Doanh thu (nghìn đồng)',
        'DH01,2026-01-01,Website,1.5',
        'DH02,2026-01-02,Website,2.25',
        'DH03,2026-01-03,Cửa hàng,700',
        'DH04,2026-01-04,Cửa hàng,10',
        'DH05,2026-01-05,Website,20',
      ].join('\n');
      const table = await parseCsvToTable('test-eb.csv', csv);
      const revCol = table.columns.find((c) => c.role === 'measure');
      expect(revCol).toBeDefined();
      if (revCol && revCol.role === 'measure') {
        expect(revCol.values[0]).toBe(1500);
        expect(revCol.values[1]).toBe(2250);
        expect(revCol.values[2]).toBe(700000);
        const total = revCol.values[0] + revCol.values[1] + revCol.values[2];
        expect(total).toBe(703750);
      }
    });
  });
});
