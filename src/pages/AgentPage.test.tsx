import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentPage } from './AgentPage';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import type { SessionRecord } from '../core/state';

describe('P7 AgentPage UI Component (ILC Architecture & Progress)', () => {
  const sessionId = 'test-session-ilc';

  beforeEach(() => {
    sessionStore.clearAll();
    ArtifactStore.deleteSession(sessionId);
    vi.restoreAllMocks();
  });

  it('renders empty state when there is no active session or state is created', () => {
    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/TIẾN TRÌNH AGENT & ĐIỀU PHỐI ILC/i)).toBeDefined();
    expect(screen.getByText(/Chưa có phiên làm việc nào đang chạy/i)).toBeDefined();
  });

  it('renders 3 ILC blocks (Intent, Logic, Control), data integrity hashes and audit trail', () => {
    const mockRecord: SessionRecord = {
      id: sessionId,
      state: 'analyzed',
      meta: {
        dataset: {
          filename: 'test_stocks.xlsx',
          rows: 150,
          symbols: ['AAA', 'BBB'],
          date_from: '2026-01-01',
          date_to: '2026-03-31',
          sha256: 'mocksha',
          source_sheet: null,
          columns_present: ['date', 'symbol', 'open', 'high', 'low', 'close', 'volume'],
          optional_columns: [],
          symbol_rows: { AAA: 75, BBB: 75 },
          skipped_blank_rows: 0,
          warning_count: 0,
        },
        clean_version: 1,
      },
      log: [
        { id: 1, ts: '2026-01-01T08:00:00Z', step: 'uploaded', actor: 'system', action: 'file_validated', detail: 'Tệp hợp lệ 150 dòng.' },
        { id: 2, ts: '2026-01-01T08:05:00Z', step: 'cleaning_review', actor: 'user', action: 'clean_approved', detail: 'Duyệt làm sạch dữ liệu.' },
        { id: 3, ts: '2026-01-01T08:10:00Z', step: 'clean_approved', actor: 'system', action: 'analysis_ran', detail: 'Tính toán xong 17 chỉ số.' },
      ],
      created_at: '2026-01-01T08:00:00Z',
      updated_at: '2026-01-01T08:10:00Z',
    };

    sessionStore.setRecord(mockRecord);
    sessionStore.setActiveSessionId(sessionId);

    // Mock CleanArtifact and AnalysisResult in ArtifactStore
    ArtifactStore.put(sessionId, 'clean_v1', {
      hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      reviewer_name: 'Nguyễn Văn Kiểm Duyệt',
      approved_at: '2026-01-01T08:05:00Z',
      dataset: mockRecord.meta.dataset,
    });

    ArtifactStore.put(sessionId, 'analysis', {
      clean_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      config: { symbols: ['AAA', 'BBB'], date_from: '2026-01-01', date_to: '2026-03-31' },
      metrics: [],
      charts: [],
      warnings: [],
      created_at: '2026-01-01T08:10:00Z',
    });

    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    );

    // 1. Check 3 ILC blocks exist
    expect(screen.getByText(/1\. INTENT/i)).toBeDefined();
    expect(screen.getByText(/2\. LOGIC/i)).toBeDefined();
    expect(screen.getByText(/3\. CONTROL/i)).toBeDefined();

    // 2. Check Intent details
    expect(screen.getByText('test_stocks.xlsx')).toBeDefined();
    expect(screen.getAllByText(/150 dòng/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 mã \(AAA, BBB\)/i)).toBeDefined();

    // 3. Check Data Integrity table
    expect(screen.getByText(/TOÀN VẸN DỮ LIỆU & CHUỖI MÃ BĂM MẬT MÃ/i)).toBeDefined();
    expect(screen.getByText(/MÃ BĂM DỮ LIỆU SẠCH/i)).toBeDefined();

    // 4. Check Audit Trail logs
    expect(screen.getAllByText('file_validated').length).toBeGreaterThan(0);
    expect(screen.getAllByText('clean_approved').length).toBeGreaterThan(0);
    expect(screen.getAllByText('analysis_ran').length).toBeGreaterThan(0);

    // 5. Test Audit Trail filtering by Actor
    const actorSelect = screen.getByLabelText(/Tác nhân:/i);
    fireEvent.change(actorSelect, { target: { value: 'user' } });
    expect(screen.getAllByText('clean_approved').length).toBeGreaterThan(0);
    expect(screen.queryByText('file_validated')).toBeNull();
  });
});
