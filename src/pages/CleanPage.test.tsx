import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CleanPage, renderCleanMetric } from './CleanPage';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import type { RawDataset } from '../core/dataset';

describe('P3 CleanPage UI Component', () => {
  const sessionId = '88888888-4444-4444-4444-121212121212';

  function createMockDataset(n = 50): RawDataset {
    const symbols = ['TMA', 'TMB'];
    const symbol_idx = new Uint16Array(n);
    const date_days = new Int32Array(n);
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const close = new Float64Array(n);
    const volume = new Float64Array(n);
    const source_row = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      symbol_idx[i] = i % 2;
      date_days[i] = 18000 + i;
      open[i] = 50.0;
      high[i] = 52.0;
      low[i] = 48.0;
      close[i] = 51.0;
      volume[i] = 10000;
      source_row[i] = i + 1;
    }

    // Inject duplicate at index 1
    date_days[1] = date_days[0];
    symbol_idx[1] = symbol_idx[0];

    // Inject missing volume at index 5
    volume[5] = NaN;

    return {
      n,
      symbols,
      symbol_idx,
      date_days,
      open,
      high,
      low,
      close,
      volume,
      source_row,
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();

    const ds = createMockDataset(80);
    ArtifactStore.put(sessionId, 'raw', ds);

    sessionStore.setRecord({
      id: sessionId,
      state: 'cleaning_review',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      log: [],
      meta: {
        reviewer_name: 'Ban Giám Khảo',
      },
    });

    sessionStore.setActiveSessionId(sessionId);
  });

  it('renders title, KPI summary cards, and profiling table', async () => {
    render(
      <MemoryRouter>
        <CleanPage />
      </MemoryRouter>
    );

    // Header and KPI titles
    expect(await screen.findByText('LÀM SẠCH DỮ LIỆU & CỔNG DUYỆT 1')).toBeDefined();
    expect(screen.getByText('TỔNG SỐ DÒNG')).toBeDefined();
    expect(screen.getByText('SỐ MÃ CỔ PHIẾU')).toBeDefined();
    expect(screen.getByText('Ô KHUYẾT THIẾU')).toBeDefined();
    expect(screen.getByText('ĐIỂM DỊ BIỆT')).toBeDefined();

    // Mandatory default sort card
    expect(screen.getByText('Sắp xếp theo Mã và Ngày')).toBeDefined();

    // Action bar
    expect(screen.getByText('KẾT QUẢ ÁP DỤNG ĐỀ XUẤT:')).toBeDefined();
    expect(screen.getByText('NGƯỜI DUYỆT (*):')).toBeDefined();
    expect(screen.getByRole('button', { name: /Duyệt và tiếp tục/i })).toBeDefined();
  });

  it('switches between Profiling tab and Diff tab', async () => {
    render(
      <MemoryRouter>
        <CleanPage />
      </MemoryRouter>
    );

    await screen.findByText('LÀM SẠCH DỮ LIỆU & CỔNG DUYỆT 1');

    // Click Diff Tab
    const diffTabBtn = screen.getByRole('tab', { name: /TRƯỚC \/ SAU/i });
    fireEvent.click(diffTabBtn);

    // Check diff controls are visible
    expect(await screen.findByText(/Tác động:/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Tất cả/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Chỉ dòng giữ lại/i })).toBeDefined();
  });

  it('allows editing reviewer name and opens ConfirmDialog on approval', async () => {
    render(
      <MemoryRouter>
        <CleanPage />
      </MemoryRouter>
    );

    await screen.findByText('LÀM SẠCH DỮ LIỆU & CỔNG DUYỆT 1');

    const reviewerInput = screen.getByPlaceholderText('Nhập tên người duyệt...');
    expect((reviewerInput as HTMLInputElement).value).toBe('Ban Giám Khảo');

    // Change reviewer name
    fireEvent.change(reviewerInput, { target: { value: 'TS. Nguyễn Văn A' } });
    expect((reviewerInput as HTMLInputElement).value).toBe('TS. Nguyễn Văn A');

    // Click "Duyệt và tiếp tục"
    const approveBtn = screen.getByRole('button', { name: /Duyệt và tiếp tục/i });
    fireEvent.click(approveBtn);

    // Confirm dialog should be open
    expect(await screen.findByText('XÁC NHẬN PHÊ DUYỆT CỔNG 1')).toBeDefined();
    expect(screen.getByText(/TS\. Nguyễn Văn A/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Xác nhận duyệt/i })).toBeDefined();
  });

  describe('E2: Gate 1 Metric Rendering (renderCleanMetric & UI fallback labels)', () => {
    it('renders "Không có cột này" when metric is null due to missing column', () => {
      expect(renderCleanMetric(null, 'thiếu')).toBe('Không có cột này');
      expect(renderCleanMetric(undefined, 'thiếu')).toBe('Không có cột này');
      expect(renderCleanMetric(NaN, 'thiếu')).toBe('Không có cột này');
    });

    it('renders "Không đáng tin" when metric is null due to untrusted values', () => {
      expect(renderCleanMetric(null, 'không đáng tin')).toBe('Không đáng tin');
      expect(renderCleanMetric(undefined, 'không đáng tin')).toBe('Không đáng tin');
    });

    it('formats valid numbers with Vietnamese thousand separators', () => {
      expect(renderCleanMetric(723600000, 'tìm thấy', ' đ')).toBe('723.600.000 đ');
      expect(renderCleanMetric(3342, 'tìm thấy')).toBe('3.342');
      expect(renderCleanMetric(0, 'tìm thấy')).toBe('0');
    });

    it('never renders "0", "NaN", "null", "undefined", or bare "-" for missing or untrusted metrics', () => {
      const missing = renderCleanMetric(null, 'thiếu');
      expect(missing).not.toBe('0');
      expect(missing).not.toBe('NaN');
      expect(missing).not.toBe('null');
      expect(missing).not.toBe('undefined');
      expect(missing).not.toBe('-');

      const untrusted = renderCleanMetric(null, 'không đáng tin');
      expect(untrusted).not.toBe('0');
      expect(untrusted).not.toBe('NaN');
      expect(untrusted).not.toBe('null');
      expect(untrusted).not.toBe('undefined');
      expect(untrusted).not.toBe('-');
    });
  });
});
