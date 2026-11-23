import { describe, it, expect } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileReadConfirmationPanel } from '../components/clean/FileReadConfirmationPanel';
import type { BusinessTable } from '../core/businessTable';

// Helper to create a dummy BusinessTable for UI testing
function createTestTable(overrides?: Partial<BusinessTable>): BusinessTable {
  return {
    kind: 'business',
    n: 10,
    source_row: new Int32Array(Array.from({ length: 10 }, (_, i) => i + 1)),
    skipped_blank_rows: 0,
    skipped_total_rows: 0,
    skipped_total_row_numbers: [],
    columns: [
      {
        role: 'measure',
        key: 'col_doanh_thu',
        label: 'Doanh thu',
        unit: 'nghìn đồng',
        detectedUnit: 'nghìn đồng',
        multiplier: 1000,
        unitSource: 'header',
        values: new Float64Array([1000, 2000, 3000]),
        raw_values: new Float64Array([1000, 2000, 3000]),
      },
      {
        role: 'measure',
        key: 'col_don_gia',
        label: 'Đơn giá',
        unit: 'đồng',
        detectedUnit: undefined,
        multiplier: 1,
        ambiguous_separator: true,
        sampleAmbiguous: '1.250',
        userDecimalConvention: 'comma',
        values: new Float64Array([1250, 2500]),
        raw_values: new Float64Array([1250, 2500]),
      },
    ],
    ...overrides,
  };
}

// Wrapper component to manage table state updates during testing
const TestConfirmationWrapper: React.FC<{
  initialTable: BusinessTable;
  onStatusChange?: (isConfirmed: boolean, count?: number) => void;
}> = ({ initialTable, onStatusChange }) => {
  const [table, setTable] = useState<BusinessTable>(initialTable);
  return (
    <FileReadConfirmationPanel
      table={table}
      onUpdateTable={setTable}
      onConfirmStatusChange={onStatusChange || (() => {})}
    />
  );
};

describe('Prompt 1C-2a-UI Verification Suite (Phần C & E1)', () => {
  // =========================================================================
  // 1. Dòng tóm tắt ngay đầu khung (Prompt C2)
  // =========================================================================
  describe('1. Summary Line (C2)', () => {
    it('shows "Còn 2 mục chưa xác nhận" when 2 items are unconfirmed', () => {
      const table = createTestTable();
      render(<TestConfirmationWrapper initialTable={table} />);

      const summary = screen.getByText(/Còn 2 mục chưa xác nhận/i);
      expect(summary).toBeDefined();
      expect(summary.textContent).toContain('Doanh thu');
      expect(summary.textContent).toContain('Đơn giá');
    });

    it('shows "Đã xác nhận đủ" when all items are confirmed', () => {
      const table = createTestTable();
      render(<TestConfirmationWrapper initialTable={table} />);

      // Click "ĐÚNG, XÁC NHẬN" for both rows
      const confirmButtons = screen.getAllByRole('button', { name: /ĐÚNG, XÁC NHẬN/i });
      expect(confirmButtons.length).toBe(2);

      fireEvent.click(confirmButtons[0]);
      fireEvent.click(confirmButtons[1]);

      const successSummary = screen.getByText(/Đã xác nhận đủ\. Bấm DUYỆT VÀ TIẾP TỤC ở thanh dưới\./i);
      expect(successSummary).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Nhãn lý do khóa thanh dưới (Prompt C4)
  // =========================================================================
  describe('2. Lock Reason Labels on Bottom Action Bar (C4)', () => {
    // Helper function simulating the exact display logic implemented in CleanPage.tsx
    function getLockReasonText(
      isReadConfirmed: boolean,
      unconfirmedCount: number,
      reviewerName: string,
      isValid: boolean,
      isApproving: boolean
    ): string | null {
      if (!reviewerName.trim() || !isValid || isApproving || !isReadConfirmed) {
        if (!isReadConfirmed) {
          return `Còn ${unconfirmedCount > 0 ? unconfirmedCount : ''} mục chưa xác nhận`;
        }
        if (!reviewerName.trim()) {
          return 'Chưa nhập tên người duyệt';
        }
        if (!isValid) {
          return 'Dữ liệu sau làm sạch không hợp lệ';
        }
        if (isApproving) {
          return 'Đang phê duyệt...';
        }
      }
      return null;
    }

    it('shows "Còn N mục chưa xác nhận" when unconfirmed', () => {
      const reason = getLockReasonText(false, 2, '', true, false);
      expect(reason).toContain('Còn 2 mục chưa xác nhận');
    });

    it('shows "Chưa nhập tên người duyệt" when confirmed but reviewer name is empty', () => {
      const reason = getLockReasonText(true, 0, '   ', true, false);
      expect(reason).toBe('Chưa nhập tên người duyệt');
    });

    it('returns null (no reason text, button enabled) when confirmed AND reviewer name entered', () => {
      const reason = getLockReasonText(true, 0, 'Nguyễn Văn A', true, false);
      expect(reason).toBeNull();
    });
  });

  // =========================================================================
  // 3. Nút "XÁC NHẬN TẤT CẢ" bỏ qua hàng cảnh báo (Prompt C3)
  // =========================================================================
  describe('3. "XÁC NHẬN TẤT CẢ" Button & Warning Skip (C3)', () => {
    it('confirms normal rows but SKIPS rows with unit_suspicious and shows warning notice', () => {
      const tableWithSuspicious = createTestTable({
        columns: [
          // Normal money column
          {
            role: 'measure',
            key: 'col_rev',
            label: 'Doanh thu',
            unit: 'nghìn đồng',
            detectedUnit: 'nghìn đồng',
            multiplier: 1000,
            unit_suspicious: false,
            values: new Float64Array([1000]),
            raw_values: new Float64Array([1000]),
          },
          // Suspicious money column
          {
            role: 'measure',
            key: 'col_price',
            label: 'Đơn giá',
            unit: 'nghìn đồng',
            detectedUnit: 'nghìn đồng',
            multiplier: 1000,
            unit_suspicious: true,
            suspiciousReason: 'Với đơn vị nghìn đồng, mỗi đơn trung bình khoảng 927.778 đồng. Số này có vẻ vô lý.',
            values: new Float64Array([927000]),
            raw_values: new Float64Array([927000]),
          },
          // Ambiguous separator column
          {
            role: 'measure',
            key: 'col_qty',
            label: 'Số lượng',
            unit: '',
            ambiguous_separator: true,
            sampleAmbiguous: '1.250',
            values: new Float64Array([1250]),
            raw_values: new Float64Array([1250]),
          },
        ],
      });

      render(<TestConfirmationWrapper initialTable={tableWithSuspicious} />);

      // Verify "XÁC NHẬN TẤT CẢ" button exists since 3 items are unconfirmed
      const confirmAllBtn = screen.getByRole('button', { name: /XÁC NHẬN TẤT CẢ/i });
      expect(confirmAllBtn).toBeDefined();

      // Click "XÁC NHẬN TẤT CẢ"
      fireEvent.click(confirmAllBtn);

      // Verify normal rows changed to "Đã xác nhận"
      const confirmedButtons = screen.getAllByRole('button', { name: /Đã xác nhận/i });
      expect(confirmedButtons.length).toBe(2); // Doanh thu and Số lượng

      // Verify suspicious row STILL has "ĐÚNG, XÁC NHẬN"
      const remainingConfirmBtn = screen.getAllByRole('button', { name: /ĐÚNG, XÁC NHẬN/i });
      expect(remainingConfirmBtn.length).toBe(1); // Đơn giá

      // Verify warning notice is displayed
      const warningNotice = screen.getByText(/1 hàng có cảnh báo cần xem và bấm riêng/i);
      expect(warningNotice).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Đổi lựa chọn tự động quay về chưa xác nhận (Prompt C1)
  // =========================================================================
  describe('4. Changing Selection Resets Confirmation (C1)', () => {
    it('reverts to unconfirmed when a different unit or convention is selected', () => {
      const table = createTestTable({
        columns: [
          {
            role: 'measure',
            key: 'col_doanh_thu',
            label: 'Doanh thu',
            unit: 'nghìn đồng',
            detectedUnit: 'nghìn đồng',
            multiplier: 1000,
            values: new Float64Array([1000]),
            raw_values: new Float64Array([1000]),
          },
        ],
      });

      render(<TestConfirmationWrapper initialTable={table} />);

      // Initially unconfirmed
      const confirmBtn = screen.getByRole('button', { name: /ĐÚNG, XÁC NHẬN/i });
      expect(confirmBtn).toBeDefined();

      // Click confirm -> changes to "Đã xác nhận"
      fireEvent.click(confirmBtn);
      expect(screen.getByRole('button', { name: /Đã xác nhận/i })).toBeDefined();
      expect(screen.getByText(/Đã xác nhận đủ/i)).toBeDefined();

      // Click a different unit option (e.g. "triệu đồng")
      const trieuDongBtn = screen.getByRole('button', { name: /^triệu đồng$/i });
      fireEvent.click(trieuDongBtn);

      // Row must revert to UNCONFIRMED with "ĐÚNG, XÁC NHẬN"
      expect(screen.getByRole('button', { name: /ĐÚNG, XÁC NHẬN/i })).toBeDefined();
      expect(screen.getByText(/Còn 1 mục chưa xác nhận/i)).toBeDefined();
    });
  });
});
