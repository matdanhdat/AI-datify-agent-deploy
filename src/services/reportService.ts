/**
 * Human Gate 2 & Report Approval Service (Prompt P5 Section 10).
 * Implements atomic Gate 2 commit, report_hash computation, reviewer stamping,
 * and state transitions (report_approved, report_edited).
 */

import { ArtifactStore } from '../core/artifacts';
import { AppError, ERROR_CODES } from '../core/errors';
import { appendLog } from '../core/audit';
import { dispatch } from './sessionService';
import { sessionStore } from './sessionStore';
import type {
  AnalysisResult,
  Narrative,
  NarrativeParagraph,
  ReportArtifact,
  PlanResult,
} from '../core/schemas';
import { sha256Hex } from '../core/hash';
import { canonicalJsonStringify } from '../core/metrics/canonicalAnalysisHash';
import { checkParagraph, type CheckContext } from '../core/narrative/check';

/**
 * Computes canonical SHA-256 report_hash.
 * Deterministic across any key ordering.
 * Includes custom analysis results if present (Prompt P6 Section 9.3).
 */
export async function computeReportHash(
  cleanHash: string,
  analysisHash: string,
  narrative: Narrative,
  reviewerName: string,
  customResults?: PlanResult[]
): Promise<string> {
  const payload = {
    clean_hash: cleanHash,
    analysis_hash: analysisHash,
    reviewer_name: reviewerName.trim(),
    sections: narrative.sections.map((s) => ({
      id: s.id,
      title_vi: s.title_vi,
      paragraphs: s.paragraphs.map((p) => ({
        id: p.id,
        text: p.text.trim(),
        evidence: [...p.evidence].sort(),
        source: p.source,
      })),
    })),
    custom_workflows: (customResults || []).map((c) => ({
      id: c.id,
      title_vi: c.title_vi,
      steps: c.steps_text,
      tables: c.tables.map((t) => ({ id: t.id, title_vi: t.title_vi, rows_count: t.rows.length })),
      summary_lines: c.summary_lines,
    })),
  };

  const canonical = canonicalJsonStringify(payload);
  return sha256Hex(canonical);
}

/**
 * Returns human-readable blocking reasons if Gate 2 approval conditions are not met.
 * Empty array means ready to approve.
 */
export function getApprovalBlockingReasons(
  sessionId: string,
  reviewerName: string
): string[] {
  const reasons: string[] = [];
  const record = sessionStore.getRecord(sessionId);
  if (!record) {
    return ['Không tìm thấy phiên làm việc.'];
  }

  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!analysis) {
    return ['Chưa hoàn thành phân tích định lượng (analysis).'];
  }

  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  if (!report || !report.narrative) {
    return ['Chưa có phần nhận định báo cáo.'];
  }

  // Check stale
  if (report.analysis_hash !== analysis.analysis_hash) {
    reasons.push('Nhận định này được viết cho số liệu cũ. Bạn cần bấm "Tạo lại nhận định" trước khi duyệt.');
  }

  // Check reviewer name
  const trimmedName = reviewerName.trim();
  if (!trimmedName) {
    reasons.push('Vui lòng nhập tên người duyệt báo cáo.');
  } else if (trimmedName.length > 60) {
    reasons.push('Tên người duyệt không được vượt quá 60 ký tự.');
  }

  // Check paragraphs
  let hasEmptyParagraph = false;
  let hasIssue = false;

  for (const sec of report.narrative.sections) {
    for (const p of sec.paragraphs) {
      if (!p.text || p.text.trim().length === 0) {
        hasEmptyParagraph = true;
      }
      if (p.check_issues && p.check_issues.length > 0) {
        hasIssue = true;
      }
    }
  }

  if (hasEmptyParagraph) {
    reasons.push('Có đoạn văn bị rỗng. Vui lòng điền nội dung hoặc xóa đoạn.');
  }
  if (hasIssue) {
    reasons.push('Còn đoạn văn có số liệu không khớp hoặc vi phạm căn cứ. Hãy sửa lại trước khi duyệt.');
  }

  return reasons;
}

/**
 * Executes atomic Gate 2 approval.
 */
export async function approveReport(
  sessionId: string,
  reviewerName: string
): Promise<ReportArtifact> {
  const blocking = getApprovalBlockingReasons(sessionId, reviewerName);
  if (blocking.length > 0) {
    throw new AppError(
      ERROR_CODES.STATE_INVALID,
      `Không thể duyệt báo cáo: ${blocking.join('; ')}`,
      { blocking_reasons: blocking },
      400
    );
  }

  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis')!;
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report')!;

  const now = new Date().toISOString();
  const trimmedName = reviewerName.trim();

  const customResults: PlanResult[] = [];
  for (let i = 1; i <= 3; i++) {
    const cr = ArtifactStore.get<PlanResult>(sessionId, `custom_${i}`);
    if (cr) customResults.push(cr);
  }

  // Compute report_hash
  const reportHash = await computeReportHash(
    analysis.clean_hash,
    analysis.analysis_hash,
    report.narrative,
    trimmedName,
    customResults
  );

  // Atomic state commit
  const approvedReport: ReportArtifact = {
    ...report,
    status: 'approved',
    reviewer_name: trimmedName,
    approved_at: now,
    report_hash: reportHash,
  };

  ArtifactStore.put(sessionId, 'report', approvedReport);

  // Transition state machine
  dispatch(sessionId, 'report_approved');

  // Update session record meta
  const currentRecord = sessionStore.getRecord(sessionId);
  if (currentRecord) {
    currentRecord.meta = {
      ...currentRecord.meta,
      reviewer_name: trimmedName,
      report_status: 'approved',
    };

    // Counts by source
    let aiCount = 0;
    let templateCount = 0;
    let editedCount = 0;
    for (const sec of approvedReport.narrative.sections) {
      for (const p of sec.paragraphs) {
        if (p.source === 'ai') aiCount++;
        else if (p.source === 'template') templateCount++;
        else if (p.source === 'edited') editedCount++;
      }
    }

    currentRecord.log = appendLog(currentRecord.log, {
      step: 'report',
      actor: 'user',
      action: 'report_approved',
      detail: `Phê duyệt báo cáo bởi "${trimmedName}". Tổng ${approvedReport.narrative.sections.length} mục (${aiCount} AI, ${templateCount} Mẫu, ${editedCount} Đã sửa). Report hash: ${reportHash.slice(0, 12)}...`,
      data_hash: reportHash,
    });
    sessionStore.setRecord(currentRecord);
  }

  return approvedReport;
}

/**
 * Transitions an approved report back to draft for editing.
 */
export function editApprovedReport(sessionId: string): void {
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  if (report) {
    report.status = 'draft';
    ArtifactStore.put(sessionId, 'report', report);
  }

  dispatch(sessionId, 'report_edited');

  const record = sessionStore.getRecord(sessionId);
  if (record) {
    record.log = appendLog(record.log, {
      step: 'report',
      actor: 'user',
      action: 'report_edited',
      detail: 'Mở lại báo cáo để chỉnh sửa nội dung. Đã gỡ bỏ dấu duyệt.',
      data_hash: report?.report_hash || undefined,
    });
    sessionStore.setRecord(record);
  }
}

/**
 * Updates text of a specific paragraph in draft mode and re-checks numbers in real time.
 */
export function updateParagraphText(
  sessionId: string,
  sectionId: string,
  paragraphId: string,
  newText: string
): NarrativeParagraph {
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!report || !analysis) {
    throw new Error('Chưa có báo cáo để chỉnh sửa.');
  }

  const section = report.narrative.sections.find((s) => s.id === sectionId);
  const para = section?.paragraphs.find((p) => p.id === paragraphId);
  if (!para) {
    throw new Error(`Đoạn văn "${paragraphId}" không tồn tại.`);
  }

  const checkContext: CheckContext = {
    metrics: analysis.metrics,
    symbols: analysis.config.symbols,
    trading_days: analysis.assumptions.trading_days,
  };

  // Re-run number check
  const issues = checkParagraph(
    {
      id: para.id,
      text: newText,
      evidence: para.evidence,
    },
    checkContext
  );

  // Preserve original text for undo
  if (!para.original_text) {
    para.original_text = para.text;
  }

  para.text = newText;
  para.source = 'edited';
  para.check_issues = issues;

  ArtifactStore.put(sessionId, 'report', report);
  return para;
}

/**
 * Reverts an edited paragraph back to its original text.
 */
export function revertParagraph(
  sessionId: string,
  sectionId: string,
  paragraphId: string
): NarrativeParagraph {
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!report || !analysis) {
    throw new Error('Chưa có báo cáo để thao tác.');
  }

  const section = report.narrative.sections.find((s) => s.id === sectionId);
  const para = section?.paragraphs.find((p) => p.id === paragraphId);
  if (!para || !para.original_text) {
    throw new Error('Không có bản gốc để hoàn tác.');
  }

  const checkContext: CheckContext = {
    metrics: analysis.metrics,
    symbols: analysis.config.symbols,
    trading_days: analysis.assumptions.trading_days,
  };

  para.text = para.original_text;
  delete para.original_text;
  para.source = 'ai'; // or template if originally template
  para.check_issues = checkParagraph(
    {
      id: para.id,
      text: para.text,
      evidence: para.evidence,
    },
    checkContext
  );

  ArtifactStore.put(sessionId, 'report', report);
  return para;
}

/**
 * Deletes a paragraph from a section (only if section retains >= 1 paragraph).
 */
export function deleteParagraph(
  sessionId: string,
  sectionId: string,
  paragraphId: string
): void {
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  if (!report) return;

  const section = report.narrative.sections.find((s) => s.id === sectionId);
  if (!section) return;

  if (section.paragraphs.length <= 1) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      'Mỗi mục cần có tối thiểu 1 đoạn văn, không thể xóa đoạn cuối cùng.',
      {},
      400
    );
  }

  section.paragraphs = section.paragraphs.filter((p) => p.id !== paragraphId);
  ArtifactStore.put(sessionId, 'report', report);
}
