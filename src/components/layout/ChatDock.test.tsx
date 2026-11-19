import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatDock } from './ChatDock';
import { ToastProvider } from '../pixel/PixelToast';
import { sessionStore } from '../../services/sessionStore';
import { ArtifactStore } from '../../core/artifacts';
import { _resetRateLimiter } from '../../agent/chat';

describe('P6 ChatDock UI Component (jsdom)', () => {
  const sessionId = 'test-dock-session';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimiter();
    sessionStore.setRecord({
      id: sessionId,
      state: 'analyzed',
      created_at: '2026-11-14T10:00:00Z',
      updated_at: '2026-11-14T10:00:00Z',
      meta: {
        dataset: {
          filename: 'file.xlsx',
          rows: 100,
          symbols: ['TMA'],
          date_from: '2025-01-02',
          date_to: '2025-12-31',
        },
        clean_version: 1,
        report_status: 'draft',
      },
      log: [],
    });
    sessionStore.setActiveSessionId(sessionId);
    ArtifactStore.put(sessionId, 'analysis', {
      config: { symbols: ['TMA'], date_from: '2025-01-02', date_to: '2025-12-31', preset: 'all' },
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: 'clean-123',
      analysis_hash: 'analysis-123',
      assumptions: {} as any,
      warnings: [],
      metrics: [
        {
          id: 'sharpe',
          label_vi: 'Chỉ số Sharpe',
          symbol: 'TMA',
          value: 1.45,
          text: '1,45',
          unit: 'number',
          polarity: 'higher_better',
          status: 'ok',
          formula_vi: 'Sharpe formula',
          inputs: [],
          meaning_vi: 'Hiệu quả trên rủi ro',
          excel_hint: '',
        },
      ],
      charts: [],
    });
  });

  const renderDock = (isOpen = true) => {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <ChatDock isOpen={isOpen} sessionId={sessionId} page="/report" />
        </ToastProvider>
      </MemoryRouter>
    );
  };

  it('renders initial welcome message and read-only mode badge', () => {
    renderDock(true);

    expect(screen.getByText(/Trợ lý Datify \(Chỉ-Đọc\)/i)).toBeTruthy();
    expect(screen.getByText(/Chế độ Chỉ-Đọc: Không sửa dữ liệu/i)).toBeTruthy();
    expect(screen.getByText(/Xin chào! Tôi là Trợ lý Datify/i)).toBeTruthy();
  });

  it('renders floating bot launcher with speech bubble when dock is closed', () => {
    renderDock(false);

    const launcherBtn = screen.getByRole('button', { name: /Mở trợ lý Datify/i });
    expect(launcherBtn).toBeTruthy();
    expect(launcherBtn.getAttribute('aria-expanded')).toBe('false');

    // Speech bubble tooltip
    expect(screen.getByText(/Tôi có thể giúp gì cho bạn\?/i)).toBeTruthy();

    // Dismiss speech bubble
    const dismissBtn = screen.getByRole('button', { name: /Ẩn lời chào/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByText(/Tôi có thể giúp gì cho bạn\?/i)).toBeNull();
  });

  it('renders contextual suggestion buttons based on state', () => {
    renderDock(true);

    expect(screen.getByText(/GỢI Ý CÂU HỎI THEO BƯỚC NÀY:/i)).toBeTruthy();
    expect(screen.getByText(/Chỉ số Sharpe là gì\?/i)).toBeTruthy();
  });

  it('submits a question and renders user message + deterministic answer with source badge', async () => {
    renderDock(true);

    const input = screen.getByPlaceholderText(/Hỏi về chỉ số, công thức/i);
    fireEvent.change(input, { target: { value: 'Chỉ số Sharpe là gì?' } });

    const sendBtn = screen.getByText('GỬI');
    fireEvent.click(sendBtn);

    // User message should appear
    expect(screen.getByText('Chỉ số Sharpe là gì?')).toBeTruthy();

    // Assistant response should appear with "Trả lời từ tài liệu & số liệu"
    await waitFor(() => {
      expect(screen.getAllByText(/Trả lời từ tài liệu & số liệu/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Hiệu quả đầu tư trên mỗi đơn vị rủi ro chấp nhận/i)).toBeTruthy();
    });
  });

  it('clears conversation history when clicking Xóa button', async () => {
    renderDock(true);

    const input = screen.getByPlaceholderText(/Hỏi về chỉ số, công thức/i);
    fireEvent.change(input, { target: { value: 'File cần có những cột nào?' } });
    fireEvent.click(screen.getByText('GỬI'));

    await waitFor(() => {
      expect(screen.getByText('File cần có những cột nào?')).toBeTruthy();
    });

    const clearBtn = screen.getByRole('button', { name: /Xóa cuộc trò chuyện/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByText('File cần có những cột nào?')).toBeNull();
    expect(screen.getByText(/Đã xóa cuộc trò chuyện/i)).toBeTruthy();
  });
});
