import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ToastProvider } from '../components/pixel/PixelToast';

describe('HomePage Component (D1b)', () => {
  const renderHome = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <HomePage />
        </ToastProvider>
      </MemoryRouter>
    );

  it('renders hero badge and 2-line 3D hard-shadow slogan', () => {
    renderHome();

    expect(screen.getByText('DATIFY AI AGENT DASHBOARD')).toBeDefined();
    expect(screen.getByText('SỐ LIỆU ĐÁNG TIN,')).toBeDefined();
    expect(screen.getByText('AGENT CHÍNH XÁC')).toBeDefined();
  });

  it('renders 3 commitment lines with check icons', () => {
    renderHome();

    expect(screen.getByText('Số liệu do code tính, AI không đoán mò')).toBeDefined();
    expect(screen.getByText('Mọi kết luận có căn cứ đối chiếu số thực')).toBeDefined();
    expect(screen.getByText('Có hai điểm dừng bắt buộc để người duyệt phê duyệt')).toBeDefined();
  });

  it('renders 2 main action buttons', () => {
    renderHome();

    expect(screen.getByRole('button', { name: /bắt đầu phân tích/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /xem quy trình/i })).toBeDefined();
  });

  it('renders 5 process step cards with exact texts and ZERO mentions of Python', () => {
    const { container } = renderHome();

    expect(screen.getByText('1. NẠP DỮ LIỆU')).toBeDefined();
    expect(screen.getByText('2. LÀM SẠCH (CỔNG 1)')).toBeDefined();
    expect(screen.getByText('3. TÍNH CHỈ SỐ')).toBeDefined();
    expect(screen.getByText('4. NHẬN ĐỊNH (CỔNG 2)')).toBeDefined();
    expect(screen.getByText('5. XUẤT BẢN')).toBeDefined();

    expect(screen.getByText('QUY TRÌNH PHÂN TÍCH CHẶT CHẼ 5 BƯỚC')).toBeDefined();
    expect(screen.getByText('Không đi tắt đón đầu: mọi giai đoạn đều được kiểm tra và có người duyệt ở hai cổng.')).toBeDefined();

    // Verify zero occurrences of "Python" on the entire homepage
    const textContent = container.textContent || '';
    expect(textContent).not.toContain('Python');
    expect(textContent).not.toContain('Pixel Trading Agent');
    expect(textContent).not.toContain('TODO');
    expect(textContent).not.toContain('Lorem');
  });
});
