import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createSession } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { UploadPage } from './UploadPage';

describe('UploadPage Component', () => {
  beforeEach(() => {
    sessionStore.clearAll();
  });

  it('renders dropzone, requirements card, and sample download links', () => {
    createSession('Phiên Kiểm Thử');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Title and dropzone
    expect(screen.getByText('NẠP DỮ LIỆU')).toBeDefined();
    expect(screen.getByText('KÉO THẢ TỆP EXCEL HOẶC CSV VÀO ĐÂY')).toBeDefined();
    expect(screen.getByText('YÊU CẦU FILE')).toBeDefined();

    // Switch to Trading tab to verify trading requirements
    fireEvent.click(screen.getByText('Dữ liệu giao dịch'));

    // 7 Required columns listed
    expect(screen.getByText('7 Cột bắt buộc:')).toBeDefined();
    expect(screen.getByText('Ngày')).toBeDefined();
    expect(screen.getByText('Mã')).toBeDefined();
    expect(screen.getByText('Giá mở')).toBeDefined();
    expect(screen.getByText('Giá cao')).toBeDefined();
    expect(screen.getByText('Giá thấp')).toBeDefined();
    expect(screen.getByText('Giá đóng')).toBeDefined();
    expect(screen.getByText('Khối lượng')).toBeDefined();

    // Sample downloads
    expect(screen.getByText('TẢI FILE MẪU CHUẨN:')).toBeDefined();
    expect(screen.getByText('File .xlsx')).toBeDefined();
    expect(screen.getByText('File .csv')).toBeDefined();
  });

  it('dropzone has button role and responds to keyboard Enter / Space', () => {
    createSession('Phiên Kiểm Thử Bàn Phím');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText('Dữ liệu giao dịch'));
    const dropzone = screen.getByRole('button', { name: /Khu vực kéo thả tệp giao dịch/i });
    expect(dropzone).toBeDefined();
    expect(dropzone.getAttribute('tabindex')).toBe('0');

    // Trigger Enter key
    fireEvent.keyDown(dropzone, { key: 'Enter' });
    // Trigger Space key
    fireEvent.keyDown(dropzone, { key: ' ' });
  });

  it('displays current session dataset card when session has existing data', () => {
    const s = createSession('Phiên Có Dữ Liệu');
    const record = sessionStore.getRecord(s.id)!;
    record.state = 'uploaded';
    record.meta.dataset = {
      filename: 'du-lieu-thuc-te.xlsx',
      rows: 1500,
      symbols: ['TMA', 'TMB'],
      date_from: '2025-01-02',
      date_to: '2025-12-31',
    };
    sessionStore.setRecord(record);

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    expect(screen.getByText('DỮ LIỆU HIỆN CÓ CỦA PHIÊN')).toBeDefined();
    expect(screen.getByText('du-lieu-thuc-te.xlsx')).toBeDefined();
    expect(screen.getByText(/1\.500 dòng/)).toBeDefined();
  });

  it('handles Business Context input, chip additions, and dropzone unlocking (Prompt D3 & U2)', () => {
    createSession('Phiên Kiểm Tra Bối Cảnh');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Switch to Trading tab where question box is active
    fireEvent.click(screen.getByText('Dữ liệu giao dịch'));

    // Frame 1 exists
    expect(screen.getByText('1. BỐI CẢNH VÀ YÊU CẦU PHÂN TÍCH')).toBeDefined();
    expect(screen.getByText('2. NẠP DỮ LIỆU GIAO DỊCH HOẶC BẢNG KINH DOANH')).toBeDefined();

    // Dropzone initially locked
    expect(screen.getByText('Hãy nhập ít nhất một yêu cầu phân tích để Agent biết cần trả lời điều gì.')).toBeDefined();

    // Default suggestion tab is Kinh doanh when no file is loaded
    const bizTab = screen.getByRole('tab', { name: 'Kinh doanh' });
    expect(bizTab.getAttribute('aria-selected')).toBe('true');

    // Click a Business suggestion chip to add a question
    const chipBtn = screen.getByRole('button', { name: /Doanh thu theo kênh bán nào cao nhất\?/i });
    expect(chipBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chipBtn);

    // The question should now be added to textarea, chip marked Đã thêm, dropzone unlocked
    expect(screen.getByDisplayValue(/Doanh thu theo kênh bán nào cao nhất\?/i)).toBeDefined();
    expect(chipBtn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Đã thêm')).toBeDefined();
    expect(screen.getByTestId('questions-counter').textContent).toBe('1/8 câu');
    expect(screen.queryByText('Hãy nhập ít nhất một yêu cầu phân tích để Agent biết cần trả lời điều gì.')).toBeNull();

    // Single-question soft warning appears when count === 1
    expect(screen.getByTestId('single-question-warning').textContent).toContain(
      'Bạn nên nêu 2 đến 3 câu hỏi cụ thể để báo cáo trả lời đầy đủ hơn.'
    );

    // Clicking the same chip again removes it
    fireEvent.click(chipBtn);
    expect(chipBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('questions-counter').textContent).toBe('0/8 câu');
  });

  it('U2: switches suggestion tabs, enforces 8-question limit, and supports "Dùng 3 câu phổ biến"', () => {
    createSession('Phiên Kiểm Tra Gợi Ý U2');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Switch to Trading requirements tab to activate question section
    fireEvent.click(screen.getByText('Dữ liệu giao dịch'));

    // Switch to Giao dịch tab
    const tradingTab = screen.getByRole('tab', { name: 'Giao dịch' });
    fireEvent.click(tradingTab);
    expect(tradingTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /Mã nào sinh lời tốt nhất trong kỳ\?/i })).toBeDefined();

    // Click "Dùng 3 câu phổ biến" on empty textarea -> fills 3 immediately
    const top3Btn = screen.getByRole('button', { name: 'Dùng 3 câu phổ biến' });
    fireEvent.click(top3Btn);
    expect(screen.getByTestId('questions-counter').textContent).toBe('3/8 câu');
    // Single-question warning should NOT show when there are 3 questions
    expect(screen.queryByTestId('single-question-warning')).toBeNull();

    // Click "Dùng 3 câu phổ biến" again when textarea is non-empty -> opens confirm dialog
    const bizTab = screen.getByRole('tab', { name: 'Kinh doanh' });
    fireEvent.click(bizTab);
    fireEvent.click(top3Btn);
    expect(screen.getByText('Thay thế danh sách câu hỏi hiện tại?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Thay thế bằng 3 câu phổ biến' }));
    expect(screen.getByDisplayValue(/Doanh thu theo kênh bán nào cao nhất\?/i)).toBeDefined();
    expect(screen.getByTestId('questions-counter').textContent).toBe('3/8 câu');

    // Fill remaining 5 questions (total 8) across tabs
    const allBizChips = [
      /Sản phẩm nào có biên lợi nhuận thấp nhất cần chú ý\?/i,
      /Khu vực nào có doanh thu thấp nhất\?/i,
      /Doanh thu thay đổi thế nào qua các tháng\?/i,
      /Dữ liệu có dòng trống, trùng lặp hay bất thường nào không\?/i,
    ];
    for (const pattern of allBizChips) {
      fireEvent.click(screen.getByRole('button', { name: pattern }));
    }
    expect(screen.getByTestId('questions-counter').textContent).toBe('7/8 câu');

    // Switch to Chung tab and add 8th question
    fireEvent.click(screen.getByRole('tab', { name: 'Chung' }));
    fireEvent.click(screen.getByRole('button', { name: /Tóm tắt các điểm chính của dữ liệu này\./i }));
    expect(screen.getByTestId('questions-counter').textContent).toBe('8/8 câu');

    // Try adding a 9th question -> blocked with "Tối đa 8 câu hỏi."
    fireEvent.click(screen.getByRole('button', { name: /Dữ liệu có đáng tin cậy để phân tích không\?/i }));
    expect(screen.getByTestId('questions-counter').textContent).toBe('8/8 câu');
    expect(screen.getByTestId('questions-limit-notice').textContent).toContain('Tối đa 8 câu hỏi.');
  });

  it('U2: extra_info field shows char/word counter and toggles warning at 40-char threshold', () => {
    createSession('Phiên Kiểm Tra Thông Tin Bổ Sung');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    const extraInput = screen.getByLabelText(/Thông tin bổ sung về mô hình hoạt động/i) as HTMLTextAreaElement;
    expect(extraInput.maxLength).toBe(2000);
    expect(screen.getByTestId('extra-info-counter').textContent).toContain('0/2.000 ký tự (khoảng 0 từ)');
    expect(screen.getByTestId('extra-info-warning').textContent).toContain('Bạn chưa mô tả bối cảnh.');
    expect(screen.queryByTestId('extra-info-confirm')).toBeNull();

    // Enter 39 chars -> warning still visible
    fireEvent.change(extraInput, { target: { value: 'Cửa hàng bán lẻ thời trang ở Hà Nội nha' } });
    expect(extraInput.value.trim().length).toBe(39);
    expect(screen.getByTestId('extra-info-warning')).toBeDefined();

    // Enter >= 40 chars -> warning disappears and confirmation line appears
    const richText =
      'Cửa hàng thời trang có ba kênh bán (cửa hàng, website, sàn thương mại điện tử). Tôi là chủ cửa hàng.';
    fireEvent.change(extraInput, { target: { value: richText } });
    expect(screen.queryByTestId('extra-info-warning')).toBeNull();
    expect(screen.getByTestId('extra-info-confirm').textContent).toContain(
      'Thông tin này được lưu cùng phiên làm việc.'
    );
    expect(screen.getByTestId('extra-info-counter').textContent).toContain('/2.000 ký tự (khoảng 21 từ)');
  });

  it('U2: defaults suggestion tab to Giao dịch when session already has a trading dataset', () => {
    const s = createSession('Phiên Có Giao Dịch');
    const record = sessionStore.getRecord(s.id)!;
    record.state = 'uploaded';
    record.meta.dataset = {
      filename: 'giao-dich.csv',
      rows: 500,
      symbols: ['TMA'],
      date_from: '2025-01-02',
      date_to: '2025-12-31',
      kind: 'trading',
    };
    sessionStore.setRecord(record);

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    const tradingTab = screen.getByRole('tab', { name: 'Giao dịch' });
    expect(tradingTab.getAttribute('aria-selected')).toBe('true');

    // Keyboard ArrowRight switches tab from Giao dịch -> Chung
    fireEvent.keyDown(tradingTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Chung' }).getAttribute('aria-selected')).toBe('true');
  });

  it('supports two tabs in Yêu cầu file card (Trading & Business) (Prompt M1)', () => {
    createSession('Phiên Hai Tab');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    const tradingTabBtn = screen.getByText('Dữ liệu giao dịch');
    const businessTabBtn = screen.getByText('Dữ liệu kinh doanh');

    expect(tradingTabBtn).toBeDefined();
    expect(businessTabBtn).toBeDefined();

    // Switch to Business tab
    fireEvent.click(businessTabBtn);

    expect(screen.getByText('Quy cách bảng kinh doanh:')).toBeDefined();
    expect(screen.getByText(/1 cột phân loại/)).toBeDefined();
    expect(screen.getByText(/1 cột số liệu/)).toBeDefined();
    expect(screen.getByText('Kinh doanh .csv')).toBeDefined();
    expect(screen.getByText('Kinh doanh .xlsx')).toBeDefined();
  });
});
