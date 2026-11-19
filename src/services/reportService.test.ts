import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactStore } from '../core/artifacts';
import { sessionStore } from './sessionStore';
import {
  approveReport,
  editApprovedReport,
  updateParagraphText,
  revertParagraph,
  deleteParagraph,
  computeReportHash,
} from './reportService';
import type { AnalysisResult, ReportArtifact } from '../core/schemas';
import type { SessionRecord } from '../core/state';

describe('P5 reportService - Human Gate 2 & Narrative Editing', () => {
  const sessionId = '88888888-7777-6666-5555-444444444444';

  function setupSessionWithDraftReport(): {
    analysis: AnalysisResult;
    report: ReportArtifact;
  } {
    const analysis: AnalysisResult = {
      config: {
        symbols: ['TMA', 'TMB'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        preset: 'all',
      },
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: 'mock-clean-hash-1234567890',
      analysis_hash: 'mock-analysis-hash-abcdef123456',
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
        return_type: 'simple_close',
      },
      warnings: [],
      metrics: [
        {
          id: 'sessions',
          label_vi: 'Số phiên',
          symbol: 'TMA',
          value: 250,
          text: '250',
          unit: 'count',
          polarity: 'neutral',
          status: 'ok',
          formula_vi: 'Đếm số dòng',
          inputs: [],
        },
        {
          id: 'last_close',
          label_vi: 'Giá đóng cửa gần nhất',
          symbol: 'TMA',
          value: 70370,
          text: '70.370 đ',
          unit: 'currency',
          polarity: 'neutral',
          status: 'ok',
          formula_vi: 'Giá đóng cửa phiên cuối',
          inputs: [],
        },
        {
          id: 'period_return',
          label_vi: 'Lợi suất cả kỳ',
          symbol: 'TMA',
          value: 0.3465,
          text: '34,65%',
          unit: 'ratio',
          polarity: 'higher_better',
          status: 'ok',
          formula_vi: '(P_end - P_start) / P_start',
          inputs: [],
        },
      ],
      charts: [],
    };

    const report: ReportArtifact = {
      narrative: {
        analysis_hash: analysis.analysis_hash,
        generated_at: '2026-11-14T11:00:00Z',
        mode: 'ai',
        disclaimer_vi: 'Nội dung phân tích mang tính tham khảo.',
        sections: [
          {
            id: 'overview',
            title_vi: 'Tổng quan kỳ phân tích',
            source: 'ai',
            paragraphs: [
              {
                id: 'overview-1',
                text: 'Kỳ phân tích gồm 250 phiên giao dịch với giá đóng cửa gần nhất là 70.370 đ.',
                evidence: ['m:sessions:TMA', 'm:last_close:TMA'],
                source: 'ai',
                check_issues: [],
              },
            ],
          },
        ],
      },
      analysis_hash: analysis.analysis_hash,
      status: 'draft',
    };

    const record: SessionRecord = {
      id: sessionId,
      state: 'analyzed',
      created_at: '2026-11-14T10:00:00Z',
      updated_at: '2026-11-14T10:00:00Z',
      meta: {
        clean_version: 1,
      },
      log: [],
    };

    sessionStore.setRecord(record);
    sessionStore.setActiveSessionId(sessionId);
    ArtifactStore.put(sessionId, 'analysis', analysis);
    ArtifactStore.put(sessionId, 'report', report);

    return { analysis, report };
  }

  beforeEach(() => {
    ArtifactStore.clearAll();
    sessionStore.clearAll();
  });

  it('computes deterministic SHA-256 report_hash', async () => {
    const { analysis, report } = setupSessionWithDraftReport();
    const hash1 = await computeReportHash(
      analysis.clean_hash,
      analysis.analysis_hash,
      report.narrative,
      'Nguyen Van A'
    );
    const hash2 = await computeReportHash(
      analysis.clean_hash,
      analysis.analysis_hash,
      report.narrative,
      'Nguyen Van A'
    );

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('rejects Gate 2 approval if reviewer name is blank', async () => {
    setupSessionWithDraftReport();
    await expect(approveReport(sessionId, '   ')).rejects.toThrow(/người duyệt/i);
  });

  it('rejects Gate 2 approval if reviewer name exceeds 60 characters', async () => {
    setupSessionWithDraftReport();
    const longName = 'A'.repeat(61);
    await expect(approveReport(sessionId, longName)).rejects.toThrow(/60 ký tự/i);
  });

  it('rejects Gate 2 approval if narrative has blocking number check issues', async () => {
    const { report } = setupSessionWithDraftReport();
    report.narrative.sections[0].paragraphs[0].check_issues = [
      {
        token: '99999',
        reason: 'NOT_IN_DATA',
        detail_vi: 'Con số 99999 không có trong dữ liệu',
      },
    ];
    ArtifactStore.put(sessionId, 'report', report);

    await expect(approveReport(sessionId, 'Trần Kiểm Soát')).rejects.toThrow(/không khớp|vi phạm căn cứ/i);
  });

  it('successfully approves report: transitions state to report_approved, stamps reviewer & report_hash', async () => {
    setupSessionWithDraftReport();
    const approved = await approveReport(sessionId, 'Nguyễn Văn Kiểm Duyệt');

    expect(approved.status).toBe('approved');
    expect(approved.reviewer_name).toBe('Nguyễn Văn Kiểm Duyệt');
    expect(approved.approved_at).toBeDefined();
    expect(approved.report_hash).toHaveLength(64);

    const record = sessionStore.getRecord(sessionId);
    expect(record?.state).toBe('report_approved');
    expect(record?.meta.report_status).toBe('approved');

    // Audit log recorded
    const lastLog = record?.log[record.log.length - 1];
    expect(lastLog?.action).toBe('report_approved');
    expect(lastLog?.data_hash).toBe(approved.report_hash);
  });

  it('transitions approved report back to draft with editApprovedReport', async () => {
    setupSessionWithDraftReport();
    await approveReport(sessionId, 'Nguyen Reviewer');

    editApprovedReport(sessionId);

    const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
    expect(report?.status).toBe('draft');

    const record = sessionStore.getRecord(sessionId);
    expect(record?.state).toBe('analyzed');
  });

  it('updates paragraph text in real-time and performs dynamic check', () => {
    setupSessionWithDraftReport();
    const updated = updateParagraphText(
      sessionId,
      'overview',
      'overview-1',
      'Kỳ phân tích gồm 250 phiên giao dịch với mức sinh lời 34,65%.'
    );

    expect(updated.text).toBe('Kỳ phân tích gồm 250 phiên giao dịch với mức sinh lời 34,65%.');
    expect(updated.source).toBe('edited');
    expect(updated.original_text).toBeDefined();
  });

  it('reverts edited paragraph back to original text', () => {
    setupSessionWithDraftReport();
    updateParagraphText(
      sessionId,
      'overview',
      'overview-1',
      'Kỳ phân tích gồm 250 phiên giao dịch với mức sinh lời 34,65%.'
    );

    const reverted = revertParagraph(sessionId, 'overview', 'overview-1');
    expect(reverted.text).toContain('70.370 đ');
    expect(reverted.source).toBe('ai');
    expect(reverted.original_text).toBeUndefined();
  });

  it('deletes paragraph cleanly', () => {
    const { report } = setupSessionWithDraftReport();
    report.narrative.sections[0].paragraphs.push({
      id: 'overview-2',
      text: 'Đoạn thứ hai trong mục tổng quan.',
      evidence: [],
      source: 'ai',
      check_issues: [],
    });
    ArtifactStore.put(sessionId, 'report', report);

    deleteParagraph(sessionId, 'overview', 'overview-1');

    const updatedReport = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
    const sec = updatedReport?.narrative.sections.find((s) => s.id === 'overview');
    expect(sec?.paragraphs).toHaveLength(1);
    expect(sec?.paragraphs[0].id).toBe('overview-2');
  });
});
