import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CustomWorkflowSection } from './CustomWorkflowSection';
import { ArtifactStore } from '../../core/artifacts';
import { sessionStore } from '../../services/sessionStore';
import * as planService from '../../services/planService';

describe('CustomWorkflowSection Component', () => {
  const sessionId = 'test-session-ui';

  beforeEach(() => {
    ArtifactStore.clearAll();
    sessionStore.clearAll();
    sessionStore.setRecord({
      id: sessionId,
      state: 'analyzed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      meta: {
        clean_version: 1,
        report_status: 'none',
      },
      log: [],
    });
    vi.restoreAllMocks();
  });

  it('renders input box, character counter, and template buttons', () => {
    render(
      <BrowserRouter>
        <CustomWorkflowSection sessionId={sessionId} />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/YÊU CẦU PHÂN TÍCH RIÊNG/i).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/Xếp hạng top mã/i)).toBeTruthy();
    expect(screen.getByText('0/300 ký tự')).toBeTruthy();
    expect(screen.getByText('+ So sánh hai kỳ')).toBeTruthy();
    expect(screen.getByText('+ Xếp hạng mã theo lợi suất')).toBeTruthy();
  });

  it('updates character counter when user types', () => {
    render(
      <BrowserRouter>
        <CustomWorkflowSection sessionId={sessionId} />
      </BrowserRouter>
    );

    const input = screen.getByPlaceholderText(/Xếp hạng top mã/i);
    fireEvent.change(input, { target: { value: 'Xếp hạng cổ phiếu theo biến động' } });

    expect(screen.getByText('32/300 ký tự')).toBeTruthy();
  });

  it('displays infeasible reason message when proposal is rejected', async () => {
    vi.spyOn(planService, 'proposePlan').mockResolvedValue({
      feasible: false,
      reason: 'PREDICTION',
      message_vi: 'Hệ thống chỉ phân tích dữ liệu lịch sử đã có, không đưa ra dự đoán tương lai.',
      source: 'guard',
    });

    render(
      <BrowserRouter>
        <CustomWorkflowSection sessionId={sessionId} />
      </BrowserRouter>
    );

    const input = screen.getByPlaceholderText(/Xếp hạng top mã/i);
    fireEvent.change(input, { target: { value: 'Dự đoán tuần tới' } });

    const btn = screen.getByText('Đề xuất quy trình');
    fireEvent.click(btn);

    const errMsg = await screen.findByText(/Hệ thống chỉ phân tích dữ liệu lịch sử/i);
    expect(errMsg).toBeTruthy();
  });
});
