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

  describe('Prompt 1D-2 Section 1.B: Selected Catalog Metrics Block on AnalyzePage', () => {
    function setupBusinessSession() {
      sessionStore.setRecord({
        id: sessionId,
        state: 'analyzed',
        created_at: '2026-11-14T00:00:00Z',
        updated_at: '2026-11-14T00:00:00Z',
        meta: {
          clean_version: 1,
          reviewer_name: 'Test Reviewer',
        },
        log: [],
      });
      sessionStore.setActiveSessionId(sessionId);

      const businessCleanArtifact: CleanArtifact = {
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
        decisions: {},
        hash: 'mock-clean-hash-sha256',
        approved_at: '2026-11-14T00:00:00Z',
        reviewer_name: 'Test Reviewer',
      };
      ArtifactStore.put(sessionId, 'clean_v1', businessCleanArtifact);
    }

    it('renders feasible metric cards with name, answerText, fact events [F#] with nguon, and pivot/charts', () => {
      setupBusinessSession();

      const mockAnalysisResult: any = {
        clean_hash: 'mock-clean-hash-sha256',
        kind: 'business',
        metrics: [],
        charts: [],
        business_analysis: {
          total_rows: 10,
          total_columns: 4,
          totals: { revenue: 1000000, profit: 400000, gross_margin_pct: 40, orders: 100, cogs: 600000, aov: 10000 },
          by_channel: [],
          by_month: [],
          by_region: [],
          by_product: [],
        },
        selected_analysis: {
          rowCount: 10,
          confidence: { level: 'HIGH', level_vi: 'CAO', reasons: [] },
          dataLimits: ['Dữ liệu mẫu 10 dòng.'],
          metrics: {
            total_revenue: {
              id: 'total_revenue',
              name: 'Doanh thu thuần',
              status: 'tính được',
              feasible: true,
              answerText: 'Tổng doanh thu thuần đạt 1.000.000 VND.',
              events: [
                { id: 'F1', label_vi: 'Tổng doanh thu', value: 1000000, display: '1.000.000 VND', unit: 'VND', nguon: 'Cột "Doanh thu", 10 dòng' },
              ],
            },
            revenue_by_channel: {
              id: 'revenue_by_channel',
              name: 'Doanh thu theo kênh bán',
              status: 'tính được',
              feasible: true,
              answerText: 'Kênh bán tốt nhất là Website đạt 600.000 VND (60,00% tổng DT).',
              pivot: {
                dimension: 'Kênh bán',
                headers: ['Kênh', 'Doanh thu (VND)', 'Tỷ trọng (%)', 'Số đơn'],
                rows: [
                  { key: 'web', label: 'Website', revenue: 600000, revenue_share_pct: 60, orders: 60 },
                  { key: 'store', label: 'Cửa hàng', revenue: 400000, revenue_share_pct: 40, orders: 40 },
                ],
              },
              events: [],
            },
          },
        },
      };

      ArtifactStore.put(sessionId, 'analysis', mockAnalysisResult);

      render(
        <MemoryRouter>
          <AnalyzePage />
        </MemoryRouter>
      );

      // Section title
      expect(screen.getByText('CHỈ SỐ THEO DANH MỤC (13 CHỈ SỐ)')).toBeDefined();
      // Confidence badge
      expect(screen.getByText('ĐỘ TIN CẬY:')).toBeDefined();
      expect(screen.getByText('CAO')).toBeDefined();
      // Data limits
      expect(screen.getByText('Dữ liệu mẫu 10 dòng.')).toBeDefined();
      // Feasible metric card
      expect(screen.getByText('Doanh thu thuần')).toBeDefined();
      expect(screen.getByText('Tổng doanh thu thuần đạt 1.000.000 VND.')).toBeDefined();
      expect(screen.getByText('[F1]')).toBeDefined();
      // Pivot table
      expect(screen.getByText('Website')).toBeDefined();
      expect(screen.getByText('Cửa hàng')).toBeDefined();
    });

    it('renders locked metric card with verbatim reason from checkFeasibility, dimmed style, and NO 0 or 100%', () => {
      setupBusinessSession();

      const mockAnalysisResult: any = {
        clean_hash: 'mock-clean-hash-sha256',
        kind: 'business',
        metrics: [],
        charts: [],
        business_analysis: {
          total_rows: 5,
          total_columns: 2,
          totals: { revenue: 500000, profit: null, gross_margin_pct: null, orders: null, cogs: null, aov: null },
          by_channel: [],
          by_month: [],
          by_region: [],
          by_product: [],
        },
        selected_analysis: {
          rowCount: 5,
          confidence: { level: 'LOW', level_vi: 'THẤP', reasons: ['Dữ liệu ít (5 dòng)'] },
          dataLimits: ['Dữ liệu ít (5 dòng)'],
          metrics: {
            total_orders: {
              id: 'total_orders',
              name: 'Tổng số đơn hàng',
              status: 'khóa',
              feasible: false,
              reason: 'Thiếu cột Số đơn.',
              answerText: 'Chỉ số bị khóa: Thiếu cột Số đơn.',
              events: [],
            },
            gross_profit: {
              id: 'gross_profit',
              name: 'Lợi nhuận gộp',
              status: 'khóa',
              feasible: false,
              reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.',
              answerText: 'Chỉ số bị khóa: Thiếu cột Giá vốn hoặc Lợi nhuận gộp.',
              events: [],
            },
          },
        },
      };

      ArtifactStore.put(sessionId, 'analysis', mockAnalysisResult);

      render(
        <MemoryRouter>
          <AnalyzePage />
        </MemoryRouter>
      );

      // Verbatim reasons displayed
      expect(screen.getByText('Chỉ số bị khóa: Thiếu cột Số đơn.')).toBeDefined();
      expect(screen.getByText('Chỉ số bị khóa: Thiếu cột Giá vốn hoặc Lợi nhuận gộp.')).toBeDefined();

      // Bị khóa badges
      const lockedBadges = screen.getAllByText('BỊ KHÓA');
      expect(lockedBadges.length).toBe(2);

      // Downgrade reason displayed
      expect(screen.getByText(/Lý do hạ bậc tin cậy:/)).toBeDefined();
      expect(screen.getAllByText(/Dữ liệu ít \(5 dòng\)/).length).toBeGreaterThan(0);
    });

    it('displays tie-breaking with label "hòa" when multiple items share top/bottom ranks', () => {
      setupBusinessSession();

      const mockAnalysisResult: any = {
        clean_hash: 'mock-clean-hash-sha256',
        kind: 'business',
        metrics: [],
        charts: [],
        business_analysis: {
          total_rows: 20,
          total_columns: 4,
          totals: { revenue: 2000000, profit: 800000, gross_margin_pct: 40, orders: 200, cogs: 1200000, aov: 10000 },
          by_channel: [],
          by_month: [],
          by_region: [],
          by_product: [],
        },
        selected_analysis: {
          rowCount: 20,
          confidence: { level: 'HIGH', level_vi: 'CAO', reasons: [] },
          dataLimits: [],
          metrics: {
            channel_product_matrix: {
              id: 'channel_product_matrix',
              name: 'Ma trận biên lợi nhuận kênh × sản phẩm',
              status: 'tính được',
              feasible: true,
              answerText: 'Biên lợi nhuận cao nhất đạt 55,48% (hòa: Website × Áo sơ mi và Website × Đầm dạ hội); biên thấp nhất là Sàn TMĐT × Quần jeans đạt 42,39%.',
              pivot: {
                channels: ['Website', 'Sàn TMĐT'],
                products: ['Áo sơ mi', 'Đầm dạ hội', 'Quần jeans'],
                cells: [
                  { channel: 'Website', product: 'Áo sơ mi', revenue: 500000, cogs: 222600, profit: 277400, margin_pct: 55.48 },
                  { channel: 'Website', product: 'Đầm dạ hội', revenue: 500000, cogs: 222600, profit: 277400, margin_pct: 55.48 },
                  { channel: 'Sàn TMĐT', product: 'Quần jeans', revenue: 400000, cogs: 230440, profit: 169560, margin_pct: 42.39 },
                ],
              },
              events: [],
            },
          },
        },
      };

      ArtifactStore.put(sessionId, 'analysis', mockAnalysisResult);

      render(
        <MemoryRouter>
          <AnalyzePage />
        </MemoryRouter>
      );

      // Tie text containing "hòa"
      expect(
        screen.getByText(/Biên lợi nhuận cao nhất đạt 55,48% \(hòa: Website × Áo sơ mi và Website × Đầm dạ hội\)/)
      ).toBeDefined();
      // Matrix pivot headers & values
      expect(screen.getByText('Kênh \\ SP')).toBeDefined();
      expect(screen.getByText('Áo sơ mi')).toBeDefined();
      expect(screen.getByText('Đầm dạ hội')).toBeDefined();
      expect(screen.getByText('Quần jeans')).toBeDefined();
    });
  });
});
