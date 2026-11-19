import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from './Topbar';
import { ToastProvider } from '../pixel/PixelToast';
import type { Session } from '../../types/contract';

describe('Topbar Layout Component (D1a)', () => {
  const dummySession: Session = {
    id: 'test-session-12345678',
    created_at: '2026-11-16T10:00:00.000Z',
    updated_at: '2026-11-16T10:00:00.000Z',
    state: 'created',
    report_status: 'none',
    steps: [
      { key: 'upload', label_vi: 'Dữ liệu', status: 'current' },
      { key: 'clean', label_vi: 'Làm sạch', status: 'locked' },
      { key: 'review', label_vi: 'Duyệt', status: 'locked' },
      { key: 'analyze', label_vi: 'Phân tích', status: 'locked' },
      { key: 'report', label_vi: 'Báo cáo', status: 'locked' },
    ],
    unlocked_pages: ['home', 'upload', 'agent', 'history', 'config'],
  };

  it('renders exactly one "Phiên mới" button and one "Xóa sạch" button in topbar', () => {
    const createNewSession = vi.fn().mockResolvedValue(dummySession);

    render(
      <MemoryRouter>
        <ToastProvider>
          <Topbar
            session={dummySession}
            loading={false}
            createNewSession={createNewSession}
          />
        </ToastProvider>
      </MemoryRouter>
    );

    const newButtons = screen.getAllByRole('button', { name: /phiên mới/i });
    expect(newButtons.length).toBe(1);

    const clearButtons = screen.getAllByRole('button', { name: /xóa sạch/i });
    expect(clearButtons.length).toBe(1);

    // Verify ordering in DOM: AI badge -> Phiên mới -> Xóa sạch
    const allButtons = screen.getAllByRole('button');
    const newBtnIndex = allButtons.indexOf(newButtons[0]);
    const clearBtnIndex = allButtons.indexOf(clearButtons[0]);
    expect(newBtnIndex).toBeLessThan(clearBtnIndex);
  });

  it('directly creates session when current session has no uploaded dataset', () => {
    const createNewSession = vi.fn().mockResolvedValue(dummySession);

    render(
      <MemoryRouter>
        <ToastProvider>
          <Topbar
            session={dummySession}
            loading={false}
            createNewSession={createNewSession}
          />
        </ToastProvider>
      </MemoryRouter>
    );

    const newBtn = screen.getByRole('button', { name: /phiên mới/i });
    fireEvent.click(newBtn);

    expect(createNewSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Khi tạo phiên mới, dữ liệu hiện tại trong tab này sẽ mất vĩnh viễn/i)).toBeNull();
  });

  it('opens confirmation dialog when clicking "Phiên mới" with active dataset', () => {
    const createNewSession = vi.fn().mockResolvedValue(dummySession);
    const sessionWithData: Session = {
      ...dummySession,
      state: 'uploaded',
      dataset: {
        filename: 'test.csv',
        rows: 100,
        symbols: ['AAA'],
        date_from: '2025-01-01',
        date_to: '2025-01-10',
      },
    };

    render(
      <MemoryRouter>
        <ToastProvider>
          <Topbar
            session={sessionWithData}
            loading={false}
            createNewSession={createNewSession}
          />
        </ToastProvider>
      </MemoryRouter>
    );

    const newBtn = screen.getByRole('button', { name: /phiên mới/i });
    fireEvent.click(newBtn);

    // Expect dialog to open and createNewSession NOT called yet
    expect(createNewSession).not.toHaveBeenCalled();
    expect(screen.getByText(/Tạo phiên làm việc mới\?/i)).toBeDefined();
    expect(screen.getByText(/Khi tạo phiên mới, dữ liệu hiện tại trong tab này sẽ mất vĩnh viễn/i)).toBeDefined();

    // Confirm the dialog
    const confirmBtn = screen.getByRole('button', { name: /tạo phiên mới/i });
    fireEvent.click(confirmBtn);

    expect(createNewSession).toHaveBeenCalledTimes(1);
  });
});
