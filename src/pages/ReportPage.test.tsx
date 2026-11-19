import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/pixel/PixelToast';
import { ReportPage } from './ReportPage';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import type { AnalysisResult } from '../core/schemas';

describe('P4 ReportPage UI Component', () => {
  const sessionId = '77777777-6666-6666-6666-343434343434';

  function createMockAnalysisResult(): AnalysisResult {
    return {
      config: {
        symbols: ['TMA', 'TMB'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        preset: 'all',
      },
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: 'mock-sha256-clean-data-hash-1234567890',
      analysis_hash: 'mock-analysis-hash-1234567890',
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
        return_type: 'simple_close',
      },
      warnings: ['Lưu ý: Mã TMB có 1 phiên đột biến thanh khoản cao.'],
      metrics: [
        {
          id: 'sessions',
          label_vi: 'Số phiên giao dịch',
          symbol: 'TMA',
          value: 250,
          unit: 'count',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Tổng số phiên có giá đóng cửa',
          inputs: ['close'],
        },
        {
          id: 'last_close',
          label_vi: 'Giá đóng cửa gần nhất',
          symbol: 'TMA',
          value: 70.37,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Giá chốt phiên cuối',
          inputs: ['close'],
          delta: { value: 1.5, label_vi: 'so với phiên trước', status: 'ok' },
        },
        {
          id: 'period_return',
          label_vi: 'Lợi suất cả kỳ',
          symbol: 'TMA',
          value: 0.3465,
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: '(Giá cuối / Giá đầu) - 1',
          inputs: ['close'],
        },
        {
          id: 'ann_vol',
          label_vi: 'Biến động (năm hóa)',
          symbol: 'TMA',
          value: 0.2301,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'STDEV.S * SQRT(252)',
          inputs: ['returns'],
        },
        {
          id: 'max_dd',
          label_vi: 'Sụt giảm tối đa',
          symbol: 'TMA',
          value: -0.1272,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'min(close / peak - 1)',
          inputs: ['close'],
        },
        {
          id: 'sharpe',
          label_vi: 'Chỉ số Sharpe',
          symbol: 'TMA',
          value: 1.42,
          unit: 'number',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: '(Mean / Std) * SQRT(252)',
          inputs: ['returns'],
        },
        {
          id: 'win_rate',
          label_vi: 'Tỷ lệ phiên tăng',
          symbol: 'TMA',
          value: 0.5221,
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'count(ret > 0) / count',
          inputs: ['returns'],
        },
        {
          id: 'avg_volume',
          label_vi: 'Khối lượng TB',
          symbol: 'TMA',
          value: 858245,
          unit: 'number',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'AVERAGE(volume)',
          inputs: ['volume'],
        },
        {
          id: 'rsi14',
          label_vi: 'Chỉ số RSI (14)',
          symbol: 'TMA',
          value: 56.88,
          unit: 'number',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'RSI Wilder 14',
          inputs: ['close'],
        },
      ],
      charts: [
        {
          id: 'chart_normalized',
          title_vi: 'So sánh Tăng trưởng Chuẩn hóa (Gốc 100)',
          kind: 'line',
          symbols: ['TMA', 'TMB'],
          data: {
            dates: ['2025-01-02', '2025-12-31'],
            series: {
              TMA: [100, 134.65],
              TMB: [100, 72.41],
            },
          },
          table: {
            columns: ['Ngày', 'TMA', 'TMB'],
            rows: [['02/01/2025', '100,00', '100,00']],
          },
        },
      ],
    };
  }

  beforeEach(() => {
    ArtifactStore.clearAll();

    sessionStore.setRecord({
      id: sessionId,
      state: 'analyzed',
      created_at: '2026-11-14T00:00:00Z',
      updated_at: '2026-11-14T00:00:00Z',
      meta: {
        clean_version: 1,
      },
      log: [],
    });
    sessionStore.setActiveSessionId(sessionId);
  });

  it('renders notice when session has not been analyzed yet', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <ReportPage />
        </MemoryRouter>
      </ToastProvider>
    );

    expect(screen.getByText('CHƯA CÓ KẾT QUẢ PHÂN TÍCH (CỔNG 1 ĐÃ DUYỆT)')).toBeDefined();
    expect(screen.getByRole('button', { name: /Đến bước Cấu hình Phân tích/i })).toBeDefined();
  });

  it('renders complete dashboard with tabs, 8 KPI tiles, charts, and AI waiting banner', () => {
    const analysisRes = createMockAnalysisResult();
    ArtifactStore.put(sessionId, 'analysis', analysisRes);

    render(
      <ToastProvider>
        <MemoryRouter>
          <ReportPage />
        </MemoryRouter>
      </ToastProvider>
    );

    // Header & Hash
    expect(screen.getByText('BÁO CÁO PHÂN TÍCH GIAO DỊCH')).toBeDefined();
    expect(screen.getByText('CHỜ DUYỆT CỔNG 2')).toBeDefined();
    expect(screen.getAllByText(/mock-sha25/).length).toBeGreaterThan(0);

    // Warnings
    expect(screen.getByText(/Mã TMB có 1 phiên đột biến thanh khoản cao/)).toBeDefined();

    // Multi-symbol tabs
    expect(screen.getByRole('button', { name: /TỔNG QUAN DANH MỤC/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /MÃ TMA/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /MÃ TMB/i })).toBeDefined();

    // KPI Tiles
    expect(screen.getAllByText('Lợi suất cả kỳ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('34,65%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Giá đóng cửa gần nhất').length).toBeGreaterThan(0);
    expect(screen.getAllByText('70,37 đ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chỉ số Sharpe').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,42').length).toBeGreaterThan(0);

    // Detailed Table
    expect(screen.getByText(/BẢNG CHI TIẾT 17 CHỈ SỐ ĐỊNH LƯỢNG/)).toBeDefined();

    // AI Commentary & Gate 2 section
    expect(screen.getByText(/NHẬN ĐỊNH BÁO CÁO PHÂN TÍCH/)).toBeDefined();
    expect(screen.getByText(/CỔNG DUYỆT 2: PHÊ DUYỆT BÁO CÁO/)).toBeDefined();
  });

  it('switches between Overview and individual symbol tabs', () => {
    const analysisRes = createMockAnalysisResult();
    ArtifactStore.put(sessionId, 'analysis', analysisRes);

    render(
      <ToastProvider>
        <MemoryRouter>
          <ReportPage />
        </MemoryRouter>
      </ToastProvider>
    );

    const tmbTab = screen.getByRole('button', { name: /MÃ TMB/i });
    fireEvent.click(tmbTab);

    expect(screen.getByText(/BIỂU ĐỒ KỸ THUẬT NỔI BẬT \(MÃ TMB\)/)).toBeDefined();
    expect(screen.getByText(/BẢNG CHI TIẾT 17 CHỈ SỐ ĐỊNH LƯỢNG \(MÃ TMB\)/)).toBeDefined();
  });
});
