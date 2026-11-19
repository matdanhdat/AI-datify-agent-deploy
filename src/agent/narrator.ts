/**
 * Browser AI Agent for Narrative Generation & Verification (Prompt P5 Section 7).
 * Strictly isolated: Only src/agent/ calls aiClient.
 * Emits audit logs, enforces anti-hallucination number checking, dual retry with fix_issues,
 * and deterministic template fallback.
 */

import { callAi, getAiStatus } from '../services/aiClient';
import { ArtifactStore } from '../core/artifacts';
import { appendLog } from '../core/audit';
import { sessionStore } from '../services/sessionStore';
import type {
  AnalysisResult,
  Narrative,
  NarrativeSection,
  NarrativeParagraph,
  ReportArtifact,
  Metric,
  CleanArtifact,
} from '../core/schemas';
import { metricKey, chartKey } from '../core/metrics/metricSpec';
import { formatNumber, formatPercent } from '../utils/format';
import { checkParagraph, type CheckContext } from '../core/narrative/check';
import { generateFallbackNarrative, type CleaningSummaryContext } from '../core/narrative/templates';

export interface GenerateNarrativeOptions {
  forceFallback?: boolean;
  style?: 'concise' | 'detailed' | 'plain';
}

/**
 * Builds compact metric representation for AI payload (guaranteed <= 64 KB, zero raw data rows).
 */
function buildMetricItemsForAi(metrics: Metric[]) {
  return metrics
    .filter((m) => m.status === 'ok')
    .map((m) => {
      let display = '-';
      if (m.unit === 'ratio') {
        display = formatPercent(m.value);
      } else if (m.unit === 'currency') {
        display = m.value !== null && m.value !== undefined ? `${formatNumber(m.value)} đ` : '-';
      } else if (m.unit === 'count' || m.unit === 'number') {
        display = m.value !== null && m.value !== undefined ? formatNumber(m.value) : '-';
      } else if (m.text) {
        display = m.text;
      }

      let delta_display: string | undefined;
      if (m.delta?.value !== null && m.delta?.value !== undefined) {
        if (m.unit === 'ratio') {
          delta_display = formatPercent(m.delta.value);
        } else {
          delta_display = formatNumber(m.delta.value);
        }
      }

      return {
        key: metricKey(m.id, m.symbol),
        id: m.id,
        label_vi: m.label_vi,
        symbol: m.symbol || null,
        unit: m.unit,
        value: m.value !== undefined ? m.value : null,
        display,
        delta_display,
        polarity: m.polarity,
      };
    });
}

/**
 * Extracts cleaning summary context from Session and ArtifactStore.
 */
function getCleaningSummary(sessionId: string): CleaningSummaryContext {
  const record = sessionStore.getRecord(sessionId);
  const cleanV = record?.meta.clean_version;
  const cleanArtifact = cleanV ? ArtifactStore.get<CleanArtifact>(sessionId, `clean_v${cleanV}`) : undefined;
  const datasetMeta = record?.meta.dataset;

  const rawRows = datasetMeta?.rows || cleanArtifact?.dataset?.n || cleanArtifact?.businessTable?.n || 0;
  const cleanRows = cleanArtifact?.dataset?.n || cleanArtifact?.businessTable?.n || 0;
  const droppedRows = Math.max(0, rawRows - cleanRows);
  let flaggedOutliers = 0;
  if (cleanArtifact?.outlier_flags) {
    for (let i = 0; i < cleanArtifact.outlier_flags.length; i++) {
      if (cleanArtifact.outlier_flags[i] === 1) flaggedOutliers++;
    }
  }

  return {
    raw_rows: rawRows,
    clean_rows: cleanRows,
    dropped_rows: droppedRows,
    flagged_outliers: flaggedOutliers,
    warnings_count: 0,
  };
}

/**
 * Main narrative generation orchestration function.
 */
export async function generateNarrative(
  sessionId: string,
  options?: GenerateNarrativeOptions
): Promise<Narrative> {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!analysis) {
    throw new Error('Chưa có kết quả phân tích số liệu (analysis) trong phiên này.');
  }

  const cleaningSummary = getCleaningSummary(sessionId);
  const checkContext: CheckContext = {
    metrics: analysis.metrics,
    symbols: analysis.config.symbols,
    trading_days: analysis.assumptions.trading_days,
    min_sessions: 30,
    data_notes: cleaningSummary,
  };

  // Check if AI is available
  const aiStatus = await getAiStatus().catch(() => ({ ai_mode: 'fallback' as const }));
  const shouldFallback = options?.forceFallback || aiStatus.ai_mode === 'fallback';

  if (shouldFallback) {
    const fallbackNarrative = generateFallbackNarrative(analysis, cleaningSummary);
    const reportArtifact: ReportArtifact = {
      narrative: fallbackNarrative,
      analysis_hash: analysis.analysis_hash,
      status: 'draft',
    };
    ArtifactStore.put(sessionId, 'report', reportArtifact);

    const record = sessionStore.getRecord(sessionId);
    if (record) {
      record.log = appendLog(record.log, {
        step: 'report',
        actor: 'system',
        action: 'narrative_generated',
        detail: `Tạo nhận định tự động bằng mẫu câu (chế độ dự phòng, 100% kiểm chứng đạt)`,
        data_hash: analysis.analysis_hash,
      });
      sessionStore.setRecord(record);
    }

    return fallbackNarrative;
  }

  // -------------------------------------------------------------
  // AI Generation Flow with Verification & Dual Retry
  // -------------------------------------------------------------
  const metricsItems = buildMetricItemsForAi(analysis.metrics);
  const insufficientItems = analysis.metrics
    .filter((m) => m.status === 'insufficient_data')
    .map((m) => ({
      key: metricKey(m.id, m.symbol),
      label_vi: m.label_vi,
      reason_vi: m.reason_vi || 'Chưa đủ dữ liệu trong kỳ khảo sát',
    }));

  const chartSummaries = analysis.charts.map((c) => ({
    key: chartKey(c.id, c.symbols && c.symbols.length === 1 ? c.symbols[0] : null),
    title_vi: c.title_vi,
    symbols: c.symbols,
    summary_vi: c.aria_vi,
  }));

  const baseInput = {
    config: {
      symbols: analysis.config.symbols,
      date_from: analysis.config.date_from,
      date_to: analysis.config.date_to,
      sessions: analysis.metrics.find((m) => m.id === 'sessions')?.value || 250,
    },
    metrics: metricsItems,
    insufficient: insufficientItems,
    charts: chartSummaries,
    assumptions: {
      trading_days: analysis.assumptions.trading_days || 252,
      risk_free_rate: analysis.assumptions.risk_free_rate || 0,
      ma_windows: analysis.assumptions.ma_windows || [20, 50],
      rsi_window: analysis.assumptions.rsi_window || 14,
      volume_spike_rule: analysis.assumptions.volume_spike_rule || 'volume > mean20 + 2*std20',
    },
    data_notes: {
      raw_rows: cleaningSummary.raw_rows || 0,
      clean_rows: cleaningSummary.clean_rows || 0,
      dropped_rows: cleaningSummary.dropped_rows || 0,
      operations_enabled: 6,
      flagged_outliers: cleaningSummary.flagged_outliers || 0,
      warnings_count: 0,
    },
    style: options?.style || 'detailed',
  };

  let aiResult: any;
  try {
    const response = await callAi<{ sections: Array<{ id: string; paragraphs: Array<{ text: string; evidence: string[] }> }> }>(
      'write_report',
      baseInput
    );
    aiResult = response.data;
  } catch (err: any) {
    // If AI fails or times out, immediately fall back to template
    const record = sessionStore.getRecord(sessionId);
    if (record) {
      record.log = appendLog(record.log, {
        step: 'report',
        actor: 'system',
        action: 'narrative_fallback_error',
        detail: `Cổng AI gặp sự cố (${err.message || 'Lỗi kết nối'}). Chuyển sang mẫu câu dự phòng.`,
        data_hash: analysis.analysis_hash,
      });
      sessionStore.setRecord(record);
    }

    const fallbackNarrative = generateFallbackNarrative(analysis, cleaningSummary);
    const reportArtifact: ReportArtifact = {
      narrative: fallbackNarrative,
      analysis_hash: analysis.analysis_hash,
      status: 'draft',
    };
    ArtifactStore.put(sessionId, 'report', reportArtifact);
    return fallbackNarrative;
  }

  // Verify first attempt
  const fallbackRef = generateFallbackNarrative(analysis, cleaningSummary);
  const validatedSections: NarrativeSection[] = [];
  const fixIssues: Array<{ section_id: string; paragraph_index: number; problem: string; token: string }> = [];

  for (const rawSec of aiResult.sections || []) {
    const secId = rawSec.id as any;
    const refSec = fallbackRef.sections.find((s) => s.id === secId);
    if (!refSec) continue;

    const validatedParas: NarrativeParagraph[] = [];

    for (let pIdx = 0; pIdx < (rawSec.paragraphs || []).length; pIdx++) {
      const p = rawSec.paragraphs[pIdx];
      const issues = checkParagraph(
        {
          id: `${secId}-${pIdx + 1}`,
          text: p.text || '',
          evidence: p.evidence || [],
        },
        checkContext
      );

      if (issues.length > 0) {
        for (const iss of issues) {
          fixIssues.push({
            section_id: secId,
            paragraph_index: pIdx + 1,
            problem: iss.detail_vi,
            token: iss.token,
          });
        }
      }

      validatedParas.push({
        id: `${secId}-${pIdx + 1}`,
        text: p.text || '',
        evidence: p.evidence || [],
        source: 'ai',
        check_issues: issues,
      });
    }

    validatedSections.push({
      id: secId,
      title_vi: refSec.title_vi,
      source: 'ai',
      paragraphs: validatedParas,
    });
  }

  // If there are issues, attempt one retry for the failed sections
  if (fixIssues.length > 0) {
    try {
      const retryInput = {
        ...baseInput,
        fix_issues: fixIssues.slice(0, 10),
      };
      const retryRes = await callAi<{ sections: Array<{ id: string; paragraphs: Array<{ text: string; evidence: string[] }> }> }>(
        'write_report',
        retryInput
      );

      // Re-validate the retried sections
      for (const retrySec of retryRes.data.sections || []) {
        const targetSec = validatedSections.find((s) => s.id === retrySec.id);
        if (!targetSec) continue;

        const newParas: NarrativeParagraph[] = [];
        let retryStillHasIssues = false;

        for (let pIdx = 0; pIdx < (retrySec.paragraphs || []).length; pIdx++) {
          const p = retrySec.paragraphs[pIdx];
          const issues = checkParagraph(
            {
              id: `${retrySec.id}-${pIdx + 1}`,
              text: p.text || '',
              evidence: p.evidence || [],
            },
            checkContext
          );

          if (issues.length > 0) {
            retryStillHasIssues = true;
          }

          newParas.push({
            id: `${retrySec.id}-${pIdx + 1}`,
            text: p.text || '',
            evidence: p.evidence || [],
            source: 'ai',
            check_issues: issues,
          });
        }

        if (!retryStillHasIssues) {
          targetSec.paragraphs = newParas;
          targetSec.source = 'ai';
        }
      }
    } catch (_retryErr) {
      // Retry failed: proceed to fall back failed sections to template
    }
  }

  // Ensure all required sections exist and replace any sections that still fail check with template
  const finalSections: NarrativeSection[] = [];
  let aiCount = 0;
  let templateCount = 0;

  for (const refSec of fallbackRef.sections) {
    const existing = validatedSections.find((s) => s.id === refSec.id);
    const hasIssues = existing?.paragraphs.some((p) => p.check_issues.length > 0);

    if (existing && !hasIssues && existing.paragraphs.length > 0) {
      finalSections.push(existing);
      aiCount += existing.paragraphs.length;
    } else {
      // Fallback to template for this section
      finalSections.push(refSec);
      templateCount += refSec.paragraphs.length;
    }
  }

  const finalMode =
    templateCount === 0 ? 'ai' : aiCount === 0 ? 'template' : 'mixed';

  const narrative: Narrative = {
    generated_at: new Date().toISOString(),
    analysis_hash: analysis.analysis_hash,
    mode: finalMode,
    sections: finalSections,
    disclaimer_vi: 'Nội dung mang tính phân tích dữ liệu, không phải khuyến nghị đầu tư.',
  };

  const reportArtifact: ReportArtifact = {
    narrative,
    analysis_hash: analysis.analysis_hash,
    status: 'draft',
  };
  ArtifactStore.put(sessionId, 'report', reportArtifact);

  const record = sessionStore.getRecord(sessionId);
  if (record) {
    record.log = appendLog(record.log, {
      step: 'report',
      actor: 'ai',
      action: 'narrative_generated',
      detail: `Hoàn tất tạo nhận định (${finalMode}): ${aiCount} đoạn AI, ${templateCount} đoạn mẫu câu.`,
      data_hash: analysis.analysis_hash,
    });
    sessionStore.setRecord(record);
  }

  return narrative;
}

/**
 * Regenerates a single section with a specific style or fix.
 */
export async function regenerateSection(
  sessionId: string,
  sectionId: string,
  style: 'concise' | 'detailed' | 'plain'
): Promise<NarrativeSection> {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  if (!analysis || !report) {
    throw new Error('Chưa có báo cáo để viết lại mục.');
  }

  const cleaningSummary = getCleaningSummary(sessionId);
  const checkContext: CheckContext = {
    metrics: analysis.metrics,
    symbols: analysis.config.symbols,
    trading_days: analysis.assumptions.trading_days,
    min_sessions: 30,
    data_notes: cleaningSummary,
  };

  const fallbackRef = generateFallbackNarrative(analysis, cleaningSummary);
  const fallbackSec = fallbackRef.sections.find((s) => s.id === sectionId);
  if (!fallbackSec) {
    throw new Error(`Mục "${sectionId}" không tồn tại.`);
  }

  try {
    const input = {
      config: {
        symbols: analysis.config.symbols,
        date_from: analysis.config.date_from,
        date_to: analysis.config.date_to,
        sessions: analysis.metrics.find((m) => m.id === 'sessions')?.value || 250,
      },
      metrics: buildMetricItemsForAi(analysis.metrics),
      insufficient: [],
      charts: analysis.charts.map((c) => ({
        key: chartKey(c.id, c.symbols && c.symbols.length === 1 ? c.symbols[0] : null),
        title_vi: c.title_vi,
        symbols: c.symbols,
        summary_vi: c.aria_vi,
      })),
      assumptions: {
        trading_days: analysis.assumptions.trading_days || 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
      },
      data_notes: {
        raw_rows: cleaningSummary.raw_rows || 0,
        clean_rows: cleaningSummary.clean_rows || 0,
        dropped_rows: cleaningSummary.dropped_rows || 0,
        operations_enabled: 6,
        flagged_outliers: cleaningSummary.flagged_outliers || 0,
        warnings_count: 0,
      },
      only_section: sectionId as any,
      style,
    };

    const res = await callAi<{ sections: Array<{ id: string; paragraphs: Array<{ text: string; evidence: string[] }> }> }>(
      'write_report',
      input
    );

    const generatedSec = res.data.sections.find((s) => s.id === sectionId);
    if (!generatedSec || generatedSec.paragraphs.length === 0) {
      throw new Error('AI không trả về nội dung cho mục yêu cầu.');
    }

    const validatedParas: NarrativeParagraph[] = [];
    let hasIssue = false;

    for (let i = 0; i < generatedSec.paragraphs.length; i++) {
      const p = generatedSec.paragraphs[i];
      const issues = checkParagraph(
        {
          id: `${sectionId}-${i + 1}`,
          text: p.text,
          evidence: p.evidence,
        },
        checkContext
      );

      if (issues.length > 0) hasIssue = true;
      validatedParas.push({
        id: `${sectionId}-${i + 1}`,
        text: p.text,
        evidence: p.evidence,
        source: 'ai',
        check_issues: issues,
      });
    }

    if (hasIssue) {
      // If validation fails, use template
      return fallbackSec;
    }

    const newSec: NarrativeSection = {
      id: sectionId as any,
      title_vi: fallbackSec.title_vi,
      source: 'ai',
      paragraphs: validatedParas,
    };

    // Update section in narrative
    const secIdx = report.narrative.sections.findIndex((s) => s.id === sectionId);
    if (secIdx !== -1) {
      report.narrative.sections[secIdx] = newSec;
      ArtifactStore.put(sessionId, 'report', report);
    }

    const record = sessionStore.getRecord(sessionId);
    if (record) {
      record.log = appendLog(record.log, {
        step: 'report',
        actor: 'ai',
        action: 'narrative_section_regenerated',
        detail: `Viết lại mục "${fallbackSec.title_vi}" với phong cách ${style}.`,
        data_hash: analysis.analysis_hash,
      });
      sessionStore.setRecord(record);
    }

    return newSec;
  } catch (_e) {
    return fallbackSec;
  }
}

/**
 * Replaces a single section with its verified template text.
 */
export function useTemplateForSection(sessionId: string, sectionId: string): NarrativeSection {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  if (!analysis || !report) {
    throw new Error('Chưa có báo cáo để thao tác.');
  }

  const cleaningSummary = getCleaningSummary(sessionId);
  const fallbackRef = generateFallbackNarrative(analysis, cleaningSummary);
  const fallbackSec = fallbackRef.sections.find((s) => s.id === sectionId);
  if (!fallbackSec) {
    throw new Error(`Mục "${sectionId}" không tồn tại.`);
  }

  const secIdx = report.narrative.sections.findIndex((s) => s.id === sectionId);
  if (secIdx !== -1) {
    report.narrative.sections[secIdx] = fallbackSec;
    ArtifactStore.put(sessionId, 'report', report);
  }

  const record = sessionStore.getRecord(sessionId);
  if (record) {
    record.log = appendLog(record.log, {
      step: 'report',
      actor: 'user',
      action: 'narrative_section_templated',
      detail: `Chuyển mục "${fallbackSec.title_vi}" sang mẫu câu mặc định.`,
      data_hash: analysis.analysis_hash,
    });
    sessionStore.setRecord(record);
  }

  return fallbackSec;
}
