import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalyzePage } from './AnalyzePage';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import type { RawDataset } from '../core/dataset';
import type { CleanArtifact } from '../core/schemas';

describe('P4 AnalyzePage UI Component', () => {
  const sessionId = '99999999-5555-5555-5555-232323232323';

  function createMockCleanArtifact(n = 60): CleanArtifact {
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
      date_days[i] = 20000 + Math.floor(i / 2);
      open[i] = 50.0 + (i % 5);
      high[i] = 52.0 + (i % 5);
      low[i] = 48.0 + (i % 5);
      close[i] = 51.0 + (i % 5);
      volume[i] = 10000;
      source_row[i] = i + 1;
    }

    const dataset: RawDataset = {
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

    return {
      dataset,
      outlier_flags: new Uint8Array(n),
      decisions: { drop_exact_duplicates: true },
      hash: 'mock-clean-hash-sha256',
      approved_at: '2026-11-14T00:00:00Z',
      reviewer_name: 'Test Reviewer',
    };
  }

  beforeEach(() => {
    ArtifactStore.clearAll();

    sessionStore.setRecord({
      id: sessionId,
      state: 'clean_approved',
      created_at: '2026-11-14T00:00:00Z',
      updated_at: '2026-11-14T00:00:00Z',
      meta: {
        clean_version: 1,
        reviewer_name: 'Test Reviewer',
      },
      log: [],
    });
    sessionStore.setActiveSessionId(sessionId);
  });

  it('renders notice when session has no clean data', () => {
    // Session without clean_v1
    render(
      <MemoryRouter>
        <AnalyzePage />
      </MemoryRouter>
    );

    expect(screen.getByText('CHƯA CÓ DỮ LIỆU SẠCH (CỔNG 1)')).toBeDefined();
    expect(screen.getByText(/Bạn cần nạp tệp dữ liệu giao dịch/)).toBeDefined();
  });

  it('renders configuration form with symbols, presets, and assumptions when clean data exists', () => {
    const cleanArtifact = createMockCleanArtifact(60);
    ArtifactStore.put(sessionId, 'clean_v1', cleanArtifact);

    render(
      <MemoryRouter>
        <AnalyzePage />
      </MemoryRouter>
    );

    expect(screen.getByText('CẤU HÌNH PHÂN TÍCH ĐỊNH LƯỢNG')).toBeDefined();
    expect(screen.getByText(/1. CHỌN MÃ CỔ PHIẾU PHÂN TÍCH/)).toBeDefined();
    expect(screen.getByText(/2. KHOẢNG THỜI GIAN PHÂN TÍCH/)).toBeDefined();
    expect(screen.getByText(/3. GIẢ ĐỊNH TÍNH TOÁN ĐỊNH LƯỢNG/)).toBeDefined();

    // Symbols
    expect(screen.getByText('TMA')).toBeDefined();
    expect(screen.getByText('TMB')).toBeDefined();

    // Presets
    expect(screen.getByText('Toàn bộ')).toBeDefined();
    expect(screen.getByText('6 tháng')).toBeDefined();
    expect(screen.getByText('3 tháng')).toBeDefined();
    expect(screen.getByText('1 tháng')).toBeDefined();
    expect(screen.getByText('Tùy chỉnh')).toBeDefined();

    // Run button
    expect(screen.getByRole('button', { name: /Chạy phân tích định lượng/i })).toBeDefined();
  });

  it('executes analysis when clicking Run button and displays complete state', async () => {
    const cleanArtifact = createMockCleanArtifact(60);
    ArtifactStore.put(sessionId, 'clean_v1', cleanArtifact);

    render(
      <MemoryRouter>
        <AnalyzePage />
      </MemoryRouter>
    );

    const runBtn = screen.getByRole('button', { name: /Chạy phân tích định lượng/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/ĐÃ PHÂN TÍCH/)).toBeDefined();
      expect(screen.getByRole('button', { name: /Xem báo cáo & biểu đồ/i })).toBeDefined();
    });
  });

  it('verifies that when KPI card displays KHÔNG ĐỦ DỮ LIỆU, it is static text without pulse or animation classes (H1)', () => {
    const businessCleanArtifact: any = {
      kind: 'business',
      businessTable: {
        kind: 'business',
        n: 5,
        source_row: new Int32Array([1, 2, 3, 4, 5]),
        columns: [
          { role: 'id', key: 'id', label: 'Mã dòng', values: ['DS-1', 'DS-2', 'DS-3', 'DS-4', 'DS-5'] },
          { role: 'time', key: 'thang', label: 'Tháng', granularity: 'month', values: new Int32Array([1, 1, 1, 1, 1]), raw_labels: ['2026-07', '2026-07', '2026-07', '2026-07', '2026-07'] },
          { role: 'dimension', key: 'kenh', label: 'Kênh bán', categories: ['Web'], codes: new Uint16Array([0, 0, 0, 0, 0]) },
          { role: 'measure', key: 'rev', label: 'Doanh thu', values: new Float64Array([100, 200, 300, 400, 500]) },
        ],
      },
      hash: 'mock-clean-hash-sha256',
      approved_at: '2026-11-14T00:00:00Z',
      reviewer_name: 'Test Reviewer',
    };
    ArtifactStore.put(sessionId, 'clean_v1', businessCleanArtifact);

    const mockAnalysisResult: any = {
      clean_hash: 'mock-clean-hash-sha256',
      dataset_kind: 'business',
      metrics: [],
      charts: [],
      business_analysis: {
        total_rows: 5,
        total_columns: 4,
        date_from: '2026-07',
        date_to: '2026-07',
        months_count: 1,
        totals: {
          orders: null,
          revenue: 1500,
          cogs: null,
          profit: null,
          gross_margin_pct: null,
          aov: null,
        },
        by_channel: [],
        by_month: [],
        by_region: [],
        by_product: [],
        unavailable: [
          { id: 'cogs_total', label_vi: 'Tổng giá vốn', reason_vi: 'Không có cột Giá vốn' },
        ],
        role_resolution: {
          warnings: ['Không có cột Giá vốn hoặc Lợi nhuận gộp: biên lợi nhuận gộp không được tính.'],
        },
      },
    };
    ArtifactStore.put(sessionId, 'analysis', mockAnalysisResult);

    render(
      <MemoryRouter>
        <AnalyzePage />
      </MemoryRouter>
    );

    const elements = screen.getAllByText('KHÔNG ĐỦ DỮ LIỆU');
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.className).not.toContain('animate-pulse');
      expect(el.className).not.toContain('animate-bounce');
      expect(el.className).not.toContain('blink');
    }
  });
});
