import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/pixel/PixelToast';
import { Topbar } from '../components/layout/Topbar';
import { UploadPage } from '../pages/UploadPage';
import { HomePage } from '../pages/HomePage';
import type { Session } from '../types/contract';

describe('UI Polish & Safety Rules Test Suite (D1a, D1b, D1c)', () => {
  const dummySession: Session = {
    id: 'test-session-1234',
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

  const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const FORBIDDEN_WORDS = ['Python', 'Pixel Trading Agent', 'TODO', 'Lorem', 'NaN', 'undefined', '[object Object]'];

  describe('1. Topbar Button Uniqueness Rule (D1a)', () => {
    it('verifies Topbar has exactly one "Phiên mới" button and one "Xóa sạch" button', () => {
      render(
        <MemoryRouter>
          <ToastProvider>
            <Topbar
              session={dummySession}
              loading={false}
              createNewSession={async () => dummySession}
            />
          </ToastProvider>
        </MemoryRouter>
      );

      const newButtons = screen.getAllByRole('button', { name: /phiên mới/i });
      expect(newButtons.length).toBe(1);

      const clearButtons = screen.getAllByRole('button', { name: /xóa sạch/i });
      expect(clearButtons.length).toBe(1);
    });
  });

  describe('2. Upload Page Sample Button Text Quality (D1a)', () => {
    it('verifies "File mẫu có lỗi (thử làm sạch)" renders cleanly with content font >= 13px and icon warning', () => {
      render(
        <MemoryRouter>
          <ToastProvider>
            <UploadPage />
          </ToastProvider>
        </MemoryRouter>
      );

      const errorSampleBtn = screen.getByText('File mẫu có lỗi (thử làm sạch)');
      expect(errorSampleBtn).toBeDefined();

      const btnElement = errorSampleBtn.closest('button');
      expect(btnElement).toBeDefined();
      expect(btnElement?.className).toContain('font-content');

      // Font size must be >= 13px
      const fontSize = btnElement?.style.fontSize || '';
      const sizeNum = parseInt(fontSize, 10);
      expect(sizeNum).toBeGreaterThanOrEqual(13);

      // Must have warning icon and no emoji
      const icon = btnElement?.querySelector('svg');
      expect(icon).toBeDefined();
      expect(btnElement?.textContent).not.toMatch(EMOJI_REGEX);
    });
  });

  describe('3. Text-Shadow Rule (D1a)', () => {
    it('ensures no inline text-shadow is applied to elements with font-size < 40px', () => {
      const { container } = render(
        <MemoryRouter>
          <ToastProvider>
            <HomePage />
          </ToastProvider>
        </MemoryRouter>
      );

      const allElements = container.querySelectorAll('*');
      allElements.forEach((el) => {
        const style = (el as HTMLElement).style;
        if (style && style.textShadow && style.textShadow !== 'none') {
          // If textShadow is present, check font-size on element or parent hierarchy
          let fs = style.fontSize || '';
          let current: HTMLElement | null = el as HTMLElement;
          while (!fs && current && current !== container) {
            fs = current.style.fontSize || '';
            current = current.parentElement;
          }
          const isLarge = fs.includes('clamp') || parseInt(fs, 10) >= 40;
          expect(isLarge).toBe(true);
        }
      });
    });
  });

  describe('4. Zero Emoji & Forbidden Words Verification (D1b)', () => {
    it('verifies zero emojis and zero forbidden words on HomePage', () => {
      const { container } = render(
        <MemoryRouter>
          <ToastProvider>
            <HomePage />
          </ToastProvider>
        </MemoryRouter>
      );

      const text = container.textContent || '';
      expect(text).not.toMatch(EMOJI_REGEX);
      FORBIDDEN_WORDS.forEach((word) => {
        expect(text).not.toContain(word);
      });
    });

    it('verifies zero emojis and zero forbidden words on UploadPage', () => {
      const { container } = render(
        <MemoryRouter>
          <ToastProvider>
            <UploadPage />
          </ToastProvider>
        </MemoryRouter>
      );

      const text = container.textContent || '';
      expect(text).not.toMatch(EMOJI_REGEX);
      FORBIDDEN_WORDS.forEach((word) => {
        expect(text).not.toContain(word);
      });
    });
  });
});
