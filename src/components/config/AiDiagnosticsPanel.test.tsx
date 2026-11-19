import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiDiagnosticsPanel } from './AiDiagnosticsPanel';
import { ToastProvider } from '../pixel/PixelToast';
import * as aiClient from '../../services/aiClient';

describe('AiDiagnosticsPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial state with Run Diagnostics button', () => {
    render(
      <ToastProvider>
        <AiDiagnosticsPanel />
      </ToastProvider>
    );

    expect(screen.getByText(/CHẨN ĐOÁN CỔNG AI 5 TÁC VỤ/i)).toBeTruthy();
    expect(screen.getByText('Chạy chẩn đoán AI')).toBeTruthy();
  });

  it('runs diagnostics in fallback mode when AI is not configured', async () => {
    vi.spyOn(aiClient, 'isAiAvailable').mockResolvedValue(false);

    render(
      <ToastProvider>
        <AiDiagnosticsPanel />
      </ToastProvider>
    );

    const runBtn = screen.getByText('Chạy chẩn đoán AI');
    fireEvent.click(runBtn);

    const pingTask = await screen.findByText('Kiểm tra kết nối cổng (ping)');
    expect(pingTask).toBeTruthy();
    const badCode = await screen.findAllByText('LLM_NOT_CONFIGURED');
    expect(badCode.length).toBeGreaterThan(0);
  });

  it('renders thinking level and thoughts token columns when diagnostics results are populated', () => {
    window.history.pushState({}, '', '?demoDiag=1');

    render(
      <ToastProvider>
        <AiDiagnosticsPanel />
      </ToastProvider>
    );

    expect(screen.getByText('Mức suy nghĩ')).toBeTruthy();
    expect(screen.getByText('Token suy nghĩ')).toBeTruthy();
    expect(screen.getAllByText('minimal').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('low')).toBeTruthy();
    expect(screen.getByText('38')).toBeTruthy();

    window.history.pushState({}, '', '/');
  });
});
