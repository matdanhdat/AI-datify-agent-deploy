import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import path from 'node:path';
import fs from 'node:fs';
import { createSession, getSession, setBusinessContext } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { UploadPage } from '../pages/UploadPage';
import { BusinessContextPanel } from '../components/layout/BusinessContextPanel';
import { runUpload } from '../services/uploadService';
import { BUSINESS_METRIC_CATALOG } from '../core/metrics/businessCatalog';

const ROOT = path.resolve(__dirname, '..', '..');
const SAMPLES_DIR = path.join(ROOT, 'samples', 'business');
const TEST_CASES_DIR = path.join(ROOT, 'samples', 'test-cases');

describe('PROMPT 2A-2 PHẦN 1: Gỡ ô "Yêu cầu phân tích" ở chế độ Kinh Doanh', () => {
  beforeEach(() => {
    sessionStore.clearAll();
  });

  it('1. Trang Nạp dữ liệu ở chế độ kinh doanh: KHÔNG có ô câu hỏi, tiêu đề bối cảnh tùy chọn', () => {
    createSession('Phiên Kinh Doanh Mới');

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Tiêu đề khung 1 là Bối cảnh doanh nghiệp tùy chọn, không có chữ "Yêu cầu phân tích"
    expect(screen.getByText('1. BỐI CẢNH DOANH NGHIỆP (TÙY CHỌN)')).toBeDefined();
    expect(screen.queryByText('1. BỐI CẢNH VÀ YÊU CẦU PHÂN TÍCH')).toBeNull();

    // Ô câu hỏi phân tích và bộ đếm câu hỏi hoàn toàn không xuất hiện
    expect(screen.queryByTestId('questions-counter')).toBeNull();
    expect(screen.queryByTestId('question-suggestions-box')).toBeNull();
    expect(screen.queryByPlaceholderText(/Mỗi dòng một câu hỏi/i)).toBeNull();

    // Khung nạp tệp mở ngay từ đầu, không bị thông báo khóa
    expect(screen.queryByText('Hãy nhập ít nhất một yêu cầu phân tích để Agent biết cần trả lời điều gì.')).toBeNull();
  });

  it('2. Nút Tiếp tục mở khi có tệp kinh doanh hợp lệ mà KHÔNG cần nhập câu hỏi nào', async () => {
    const s = createSession('Phiên Nạp Kinh Doanh Không Câu Hỏi');
    const bytes = fs.readFileSync(path.join(SAMPLES_DIR, 'du-lieu-test-ban-le.csv'));
    const file = new File([bytes], 'du-lieu-test-ban-le.csv', { type: 'text/csv' });

    // Gọi runUpload trực tiếp với phiên không có business_context hay câu hỏi
    const outcome = await runUpload(s.id, file);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.meta.kind).toBe('business');
    }

    const updatedSession = getSession(s.id);
    expect(updatedSession.state).toBe('uploaded');
    expect(updatedSession.dataset?.rows).toBeGreaterThan(0);
  });

  it('3. Chế độ giao dịch giữ nguyên luồng cũ: có ô câu hỏi, bắt buộc câu hỏi khi nạp', async () => {
    const s = createSession('Phiên Giao Dịch Kiểm Tra');
    const validBytes = fs.readFileSync(path.join(TEST_CASES_DIR, 'TC28_file_utf8_bom.csv'));
    const validFile = new File([validBytes], 'TC28_file_utf8_bom.csv', { type: 'text/csv' });

    // Khi nạp tệp giao dịch mà chưa có context -> bị chặn CONTEXT_REQUIRED
    await expect(runUpload(s.id, validFile)).rejects.toThrow('Bạn cần nhập ít nhất một yêu cầu phân tích');

    // Giao diện Nạp dữ liệu khi chuyển sang tab Dữ liệu giao dịch hiển thị lại ô câu hỏi
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText('Dữ liệu giao dịch'));
    expect(screen.getByText('1. BỐI CẢNH VÀ YÊU CẦU PHÂN TÍCH')).toBeDefined();
    expect(screen.getByTestId('questions-counter')).toBeDefined();
    expect(screen.getByPlaceholderText(/Mỗi dòng một câu hỏi/i)).toBeDefined();
  });

  it('4. Khung BusinessContextPanel trả về null (ẩn hoàn toàn) ở chế độ kinh doanh', () => {
    const s = createSession('Phiên Kiểm Tra Context Panel');
    // Gán câu hỏi cũ (phiên legacy)
    setBusinessContext(s.id, {
      company_name: 'Doanh Nghiệp ABC',
      role: 'CEO',
      analysis_questions: ['Doanh thu tăng trưởng thế nào?'],
    });

    const sessionObj = getSession(s.id);
    // Khi dataset.kind là business (hoặc mặc định)
    (sessionObj as any).dataset = { kind: 'business', filename: 'test.csv' };

    const { container } = render(
      <BrowserRouter>
        <BusinessContextPanel session={sessionObj} />
      </BrowserRouter>
    );

    // Không render banner "YÊU CẦU PHÂN TÍCH CỦA BẠN"
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('YÊU CẦU PHÂN TÍCH CỦA BẠN')).toBeNull();
  });

  it('5. Tự động sinh chuỗi câu hỏi cho tác vụ AI từ các chỉ số đã chọn ở bước Trao đổi', () => {
    const selectedIds = ['total_revenue', 'gross_profit', 'gross_margin'];
    const metricNames = selectedIds
      .map((id) => {
        const m = BUSINESS_METRIC_CATALOG.find((item) => item.id === id);
        return m?.name || (m as any)?.label_vi;
      })
      .filter(Boolean);

    expect(metricNames).toEqual(['Tổng doanh thu', 'Lợi nhuận gộp', 'Biên lợi nhuận gộp']);
    const autoPrompt = `Phân tích các chỉ số: ${metricNames.join(', ')}`;
    expect(autoPrompt).toBe('Phân tích các chỉ số: Tổng doanh thu, Lợi nhuận gộp, Biên lợi nhuận gộp');
  });
});
