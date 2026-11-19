import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RouteGuard } from './RouteGuard';
import type { Session } from '../../types/contract';

function makeMockSession(state: Session['state'], unlockedPages: string[]): Session {
  return {
    id: 'test-session-123',
    name: 'Phiên kiểm thử',
    state,
    created_at: '2026-11-14T00:00:00Z',
    updated_at: '2026-11-14T00:00:00Z',
    dataset: null,
    clean_version: null,
    report_status: 'none',
    steps: [
      { key: 'upload', label_vi: 'Dữ liệu', status: state === 'created' ? 'current' : 'done' },
      { key: 'clean', label_vi: 'Làm sạch', status: 'locked' },
      { key: 'review', label_vi: 'Duyệt', status: 'locked' },
      { key: 'analyze', label_vi: 'Phân tích', status: 'locked' },
      { key: 'report', label_vi: 'Báo cáo', status: 'locked' },
    ],
    unlocked_pages: unlockedPages,
  };
}

describe('RouteGuard Component', () => {
  it('renders children when page is unlocked', () => {
    const session = makeMockSession('created', ['home', 'upload', 'agent', 'history', 'config']);
    const onLockedAccess = vi.fn();

    render(
      <MemoryRouter initialEntries={['/nap-du-lieu']}>
        <Routes>
          <Route
            path="/nap-du-lieu"
            element={
              <RouteGuard
                pageKey="upload"
                session={session}
                loading={false}
                onLockedAccess={onLockedAccess}
              >
                <div data-testid="upload-content">Nội dung trang nạp</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('upload-content')).toBeDefined();
    expect(onLockedAccess).not.toHaveBeenCalled();
  });

  it('blocks locked page, does not render children, redirects and triggers onLockedAccess', async () => {
    // Session in 'created' state does NOT have 'clean' in unlocked_pages
    const session = makeMockSession('created', ['home', 'upload', 'agent', 'history', 'config']);
    const onLockedAccess = vi.fn();

    render(
      <MemoryRouter initialEntries={['/lam-sach']}>
        <Routes>
          <Route
            path="/lam-sach"
            element={
              <RouteGuard
                pageKey="clean"
                session={session}
                loading={false}
                onLockedAccess={onLockedAccess}
              >
                <div data-testid="clean-content">Nội dung trang làm sạch</div>
              </RouteGuard>
            }
          />
          <Route path="/nap-du-lieu" element={<div data-testid="redirected-target">Đã chuyển hướng về đây</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Locked children MUST NOT be rendered
    expect(screen.queryByTestId('clean-content')).toBeNull();

    // Redirect target is rendered
    expect(screen.getByTestId('redirected-target')).toBeDefined();

    // Wait for event queue to deliver lock explanation
    await vi.waitFor(() => {
      expect(onLockedAccess).toHaveBeenCalledTimes(1);
      const explanation = onLockedAccess.mock.calls[0][0];
      expect(explanation.pageTitle).toContain('Làm sạch');
      expect(explanation.message).toContain('Bạn cần nạp tệp dữ liệu');
    });
  });

  it('shows loading state while session is loading', () => {
    const onLockedAccess = vi.fn();

    render(
      <MemoryRouter initialEntries={['/nap-du-lieu']}>
        <RouteGuard
          pageKey="upload"
          session={null}
          loading={true}
          onLockedAccess={onLockedAccess}
        >
          <div data-testid="upload-content">Nội dung trang</div>
        </RouteGuard>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('upload-content')).toBeNull();
    expect(screen.getByText('Đang nạp trạng thái phiên làm việc...')).toBeDefined();
  });
});
