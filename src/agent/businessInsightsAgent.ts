/**
 * Browser AI Agent for Non-Blocking Business Insights (Prompt M3-B).
 * Strictly isolated in src/agent/:
 * - ONLY reads code-computed BusinessAnalysisSummary & FactsTable (< 4 KB).
 * - NEVER touches raw data rows, NEVER computes or modifies numbers.
 * - Enforces AbortController (<= 25s), max 1 retry with short backoff, session cache by facts_hash,
 *   post-AI number/evidence verification, and deterministic template fallback.
 * - Writes structured audit log (facts_hash, model, latency_ms, rejected_count, source).
 */

import { callAi, getAiStatus } from '../services/aiClient';
import { ArtifactStore } from '../core/artifacts';
import { appendLog } from '../core/audit';
import { sessionStore } from '../services/sessionStore';
import { getBusinessContext } from '../services/readers';
import type { AnalysisResult, CleanArtifact, Narrative, NarrativeSection, ReportArtifact } from '../core/schemas';
import type { BusinessAnalysisSummary } from '../core/metrics/businessAnalyzer';
import { getActiveCleanArtifact } from '../services/cleanService';
import { computeSelected } from '../core/metrics/businessComputeSelected';
import { mapQuestionsToMetrics } from '../core/metrics/questionToMetrics';
import {
  buildBusinessFactsTable,
  sanitizeDataLabel,
  type FactsTable,
} from '../core/narrative/factsBuilder';
import {
  buildTemplateBusinessInsights,
  verifyBusinessInsightsOutput,
  type BusinessInsightsReport,
} from '../core/narrative/businessInsights';
import { sha256Sync } from '../core/context/normalize';
import { BUSINESS_METRIC_CATALOG } from '../core/metrics/businessCatalog';

export interface GenerateBusinessInsightsOptions {
  signal?: AbortSignal;
  forceFallback?: boolean;
  /** Reviewer feedback from Gate 2 rejection (used strictly as rewriting guidance, never changes numbers) */
  reviewerFeedback?: string;
  /** Bypass session cache (e.g. when user clicks regenerate) */
  forceRefresh?: boolean;
}

export interface BusinessInsightsBundle {
  factsTable: FactsTable;
  report: BusinessInsightsReport;
  fromCache: boolean;
}

// Session-scoped in-memory cache: key = `${sessionId}::${factsHash}::${feedbackHash}`
const insightsCache = new Map<string, BusinessInsightsReport>();

export function clearBusinessInsightsCache(sessionId?: string): void {
  if (!sessionId) {
    insightsCache.clear();
    return;
  }
  const prefix = `${sessionId}::`;
  for (const key of Array.from(insightsCache.keys())) {
    if (key.startsWith(prefix)) {
      insightsCache.delete(key);
    }
  }
}

/**
 * Converts a verified BusinessInsightsReport into a compatible Narrative + ReportArtifact
 * so Gate 2 approval (approveReport, computeReportHash, audit logs) works seamlessly without breaking contracts.
 */
function toCompatibleReportArtifact(
  analysis: AnalysisResult,
  insightsReport: BusinessInsightsReport
): ReportArtifact {
  const sections: NarrativeSection[] = [];

  // 1. Two-Tier format mapping (Prompt 3B)
  if (insightsReport.summary && insightsReport.summary.length > 0) {
    sections.push({
      id: 'overview',
      title_vi: 'Tóm tắt tổng quan từ số liệu',
      source: insightsReport.source,
      paragraphs: insightsReport.summary.slice(0, 3).map((text, idx) => ({
        id: `biz-sum-${idx + 1}`,
        text: text.slice(0, 700),
        evidence: ['F1'],
        source: insightsReport.source,
        check_issues: [],
      })),
    });
  }

  if (insightsReport.by_metric && Object.keys(insightsReport.by_metric).length > 0) {
    const metricParas: NarrativeSection['paragraphs'] = [];
    let pIdx = 1;
    for (const [mId, sList] of Object.entries(insightsReport.by_metric)) {
      const metricObj = BUSINESS_METRIC_CATALOG.find((m) => m.id === mId);
      const mName = metricObj?.name || mId;
      for (const s of sList) {
        metricParas.push({
          id: `biz-met-${pIdx++}`,
          text: `[${mName}] ${s.text}`.slice(0, 700),
          evidence: s.refs,
          source: insightsReport.source,
          check_issues: [],
        });
      }
    }
    if (metricParas.length > 0) {
      sections.push({
        id: 'comparison',
        title_vi: 'Nhận định chi tiết theo từng chỉ số',
        source: insightsReport.source,
        paragraphs: metricParas,
      });
    }
  }

  if (insightsReport.followups && insightsReport.followups.length > 0) {
    sections.push({
      id: 'watch',
      title_vi: 'Gợi ý theo dõi trọng điểm',
      source: insightsReport.source,
      paragraphs: insightsReport.followups.slice(0, 2).map((text, idx) => ({
        id: `biz-fol-${idx + 1}`,
        text: text.slice(0, 700),
        evidence: ['F1'],
        source: insightsReport.source,
        check_issues: [],
      })),
    });
  }

  // 2. Legacy fallback mapping if two-tier fields empty
  if (sections.length === 0) {
    if (insightsReport.insights && insightsReport.insights.length > 0) {
      sections.push({
        id: 'overview',
        title_vi: 'Nhận định chính từ số liệu kinh doanh',
        source: insightsReport.source,
        paragraphs: insightsReport.insights.slice(0, 3).map((ins, idx) => ({
          id: `biz-ins-${idx + 1}`,
          text: `${ins.title}: ${ins.statement}`.slice(0, 700),
          evidence: ins.evidence_ids,
          source: insightsReport.source,
          check_issues: [],
        })),
      });
    }

    if (insightsReport.recommendations && insightsReport.recommendations.length > 0) {
      sections.push({
        id: 'watch',
        title_vi: 'Đề xuất hành động có căn cứ',
        source: insightsReport.source,
        paragraphs: insightsReport.recommendations.slice(0, 3).map((rec, idx) => ({
          id: `biz-rec-${idx + 1}`,
          text: `${rec.action} (${rec.rationale})`.slice(0, 700),
          evidence: rec.evidence_ids,
          source: insightsReport.source,
          check_issues: [],
        })),
      });
    }
  }

  if (insightsReport.limitations && insightsReport.limitations.length > 0) {
    sections.push({
      id: 'limits',
      title_vi: 'Giới hạn của tập dữ liệu',
      source: insightsReport.source,
      paragraphs: [
        {
          id: 'biz-lim-1',
          text: insightsReport.limitations.join(' ').slice(0, 700),
          evidence: ['F1'],
          source: insightsReport.source,
          check_issues: [],
        },
      ],
    });
  }

  const narrative: Narrative = {
    generated_at: insightsReport.generated_at,
    mode: insightsReport.source,
    analysis_hash: analysis.analysis_hash,
    disclaimer_vi: 'Nhận định chỉ tổng hợp từ số liệu do mã nguồn tính toán trong phiên, không thay thế quyết định quản trị.',
    sections,
  };

  return {
    narrative,
    analysis_hash: analysis.analysis_hash,
    status: 'draft',
  };
}

/**
 * Stores Gate 2 reviewer rejection feedback in ArtifactStore (tab memory only)
 * while preserving computed clean & analysis artifacts unchanged.
 */
export function saveGate2BusinessFeedback(sessionId: string, feedback: string): string {
  const cleanFb = sanitizeDataLabel(feedback, 360);
  ArtifactStore.put(sessionId, 'gate2_feedback', cleanFb);
  const record = sessionStore.getRecord(sessionId);
  if (record) {
    record.log = appendLog(record.log, {
      step: 'report',
      actor: 'user',
      action: 'gate2_feedback_returned',
      detail: `Người duyệt Cổng 2 yêu cầu viết lại nhận định (giữ nguyên số liệu đã tính, độ dài góp ý: ${cleanFb.length} ký tự)`,
    });
    sessionStore.setRecord(record);
  }
  return cleanFb;
}

export function getGate2BusinessFeedback(sessionId: string): string | undefined {
  return ArtifactStore.get<string>(sessionId, 'gate2_feedback');
}

export function getStoredBusinessInsights(sessionId: string): BusinessInsightsBundle | undefined {
  const factsTable = ArtifactStore.get<FactsTable>(sessionId, 'business_facts');
  const report = ArtifactStore.get<BusinessInsightsReport>(sessionId, 'business_insights');
  if (!factsTable || !report) return undefined;
  return { factsTable, report, fromCache: true };
}

/**
 * Generates (or loads cached) verified business insights asynchronously without blocking KPIs/charts.
 */
export async function generateBusinessInsights(
  sessionId: string,
  options?: GenerateBusinessInsightsOptions
): Promise<BusinessInsightsBundle> {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  const summary = analysis?.business_analysis as BusinessAnalysisSummary | undefined;
  if (!analysis || !summary) {
    throw new Error('Chưa có kết quả phân tích kinh doanh để tạo nhận định.');
  }

  const record = sessionStore.getRecord(sessionId);
  const rawRows = record?.meta.dataset?.rows ?? summary.total_rows;
  const droppedRowsDuringClean = Math.max(0, rawRows - summary.total_rows);

  const factsTable = buildBusinessFactsTable(summary, { droppedRowsDuringClean });

  const cleanArtifact =
    getActiveCleanArtifact(sessionId) ||
    ArtifactStore.get<CleanArtifact>(sessionId, 'clean_v1') ||
    ArtifactStore.get<CleanArtifact>(sessionId, 'clean');

  if (cleanArtifact?.businessTable) {
    const selectedIds =
      (record?.meta?.selected_metric_ids as string[] | undefined) ||
      BUSINESS_METRIC_CATALOG.map((m) => m.id);
    const selectedOutput = computeSelected(cleanArtifact.businessTable, selectedIds, {
      customRoles: record?.meta?.custom_roles as any,
    });
    factsTable.confidence = selectedOutput.confidence;
    factsTable.data_limits = selectedOutput.dataLimits;
    factsTable.metrics_result = selectedOutput.metrics;

    const bQuestions = record?.meta?.business_questions as string[] | undefined;
    if (bQuestions && bQuestions.length > 0) {
      const fRecord: Record<string, { feasible: boolean; reason?: string }> = {};
      BUSINESS_METRIC_CATALOG.forEach((m) => {
        fRecord[m.id] = { feasible: Boolean(selectedOutput.metrics?.[m.id]?.feasible) };
      });
      const qRes = mapQuestionsToMetrics(bQuestions, fRecord);
      factsTable.question_metric_ids = qRes.tickUnion;
    }
  }

  ArtifactStore.put(sessionId, 'business_facts', factsTable);

  const rawFeedback = options?.reviewerFeedback ?? getGate2BusinessFeedback(sessionId) ?? '';
  const safeFeedback = sanitizeDataLabel(rawFeedback, 360);
  const feedbackHash = safeFeedback ? sha256Sync(safeFeedback).slice(0, 12) : 'none';
  const cacheKey = `${sessionId}::${factsTable.hash}::${feedbackHash}`;

  if (!options?.forceRefresh && insightsCache.has(cacheKey)) {
    const cached = insightsCache.get(cacheKey)!;
    ArtifactStore.put(sessionId, 'business_insights', cached);
    ArtifactStore.put(sessionId, 'report', toCompatibleReportArtifact(analysis, cached));
    return { factsTable, report: cached, fromCache: true };
  }

  const startMs = Date.now();
  const commitAndLog = (report: BusinessInsightsReport): BusinessInsightsBundle => {
    insightsCache.set(cacheKey, report);
    ArtifactStore.put(sessionId, 'business_insights', report);
    ArtifactStore.put(sessionId, 'report', toCompatibleReportArtifact(analysis, report));

    const rec = sessionStore.getRecord(sessionId);
    if (rec) {
      rec.log = appendLog(rec.log, {
        step: 'analyze',
        actor: report.source === 'ai' ? 'ai' : 'system',
        action: 'business_insights_generated',
        detail: `Nguồn: ${report.source} | Model: ${report.model} | Thời gian AI: ${report.latency_ms}ms | Đạt: ${report.insights.length} nhận định, ${report.recommendations.length} đề xuất | Bị loại kiểm chứng: ${report.rejected_count}${safeFeedback ? ' | Có góp ý Cổng 2' : ''}`,
        data_hash: factsTable.hash,
      });
      sessionStore.setRecord(rec);
    }

    return { factsTable, report, fromCache: false };
  };

  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const aiStatus = await getAiStatus().catch(() => ({ ai_mode: 'fallback' as const, model: 'template-local' }));
  if (options?.forceFallback || aiStatus.ai_mode === 'fallback') {
    const tpl = buildTemplateBusinessInsights(factsTable, {
      latency_ms: Date.now() - startMs,
      feedback_applied: safeFeedback || undefined,
    });
    return commitAndLog(tpl);
  }

  // Build compact AI payload (< 4 KB facts + sanitized context + optional Gate 2 feedback)
  const userCtx = getBusinessContext(sessionId);
  const contextParts: string[] = [];
  if (userCtx?.company_name) contextParts.push(`Doanh nghiệp: [DATA:${sanitizeDataLabel(userCtx.company_name, 60)}]`);
  if (userCtx?.role) contextParts.push(`Vai trò: [DATA:${sanitizeDataLabel(userCtx.role, 50)}]`);
  if (userCtx?.extra_info) contextParts.push(`Mô hình: [DATA:${sanitizeDataLabel(userCtx.extra_info, 360)}]`);

  // Prompt 2A-2: If analysis_questions is empty, generate prompt from selected metric names
  let questions = (userCtx?.analysis_questions || []).slice(0, 8).map((q) => sanitizeDataLabel(q, 180));
  const sessionRec = sessionStore.getRecord(sessionId);
  if (questions.length === 0) {
    const selectedIds = sessionRec?.meta?.selected_metric_ids;
    if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
      const metricNames = selectedIds
        .map((id) => {
          const m = BUSINESS_METRIC_CATALOG.find((item) => item.id === id);
          return m?.name || (m as any)?.label_vi;
        })
        .filter(Boolean) as string[];
      if (metricNames.length > 0) {
        questions = [`Phân tích các chỉ số: ${metricNames.join(', ')}`];
      }
    }
  }

  // Derive has_* flags and metricEventMap (Prompt 3B)
  const has_margin = factsTable.facts.some(
    (f) => f.label_vi.includes('Biên') || f.label_vi.includes('lợi nhuận') || f.label_vi.includes('giá vốn')
  );
  const has_orders = factsTable.facts.some(
    (f) => f.label_vi.includes('số đơn') || f.label_vi.includes('Đơn hàng')
  );
  const has_product = factsTable.facts.some((f) => f.category === 'product');
  const has_channel = factsTable.facts.some((f) => f.category === 'channel');
  const has_region = factsTable.facts.some((f) => f.category === 'region');
  const has_time = factsTable.facts.some((f) => f.category === 'month');

  const flags = {
    has_margin,
    has_orders,
    has_product,
    has_channel,
    has_region,
    has_time,
  };

  const metricEventMap: Record<string, string[]> = {};
  if (factsTable.metrics_result) {
    for (const [mId, mRes] of Object.entries(factsTable.metrics_result)) {
      if ((mRes as any)?.events && Array.isArray((mRes as any).events)) {
        metricEventMap[mId] = (mRes as any).events.map((e: any) => e.id);
      }
    }
  }

  const templateReport = buildTemplateBusinessInsights(factsTable, {
    feedback_applied: safeFeedback || undefined,
  });

  const payload = {
    facts_hash: factsTable.hash,
    period: factsTable.period,
    facts: factsTable.facts.map((f) => ({
      id: f.id,
      category: f.category,
      label_vi: f.label_vi,
      display: f.display,
      unit: f.unit,
    })),
    findings: templateReport.findings.map((f) => ({
      rule_id: f.rule_id,
      title: f.title,
      evidence: f.evidence,
      meaning: f.meaning,
      opportunity_risk: f.opportunity_risk,
      action: f.action,
      kpi_metric_id: f.kpi_metric_id,
      check_after: f.check_after,
      source_refs: f.source_refs,
    })),
    questions,
    context_note: contextParts.length > 0 ? contextParts.join(' | ').slice(0, 580) : undefined,
    reviewer_feedback: safeFeedback || undefined,
    has_margin,
    has_orders,
    has_product,
    has_channel,
    has_region,
    has_time,
    confidence_level: factsTable.confidence?.level_vi || 'CAO',
    data_limits: factsTable.data_limits || [],
  };

  // Client timeout capped at 9,000 ms (Prompt 3B)
  const timeoutMs = 9000;
  const timeoutController = new AbortController();
  let clientTimedOut = false;
  const timeoutId = setTimeout(() => {
    clientTimedOut = true;
    timeoutController.abort(new Error('LLM_TIMEOUT'));
  }, timeoutMs);

  if (options?.signal) {
    options.signal.addEventListener('abort', () => timeoutController.abort(options.signal?.reason));
  }

  // Call AI with max 1 retry (400ms backoff) on transient upstream errors; never retry on abort or timeout
  let lastError: any = null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        const res = await callAi<unknown>('business_insights', payload, timeoutController.signal);
        const latencyMs = Date.now() - startMs;
        const verified = verifyBusinessInsightsOutput(res.data, factsTable, {
          model: res.model || aiStatus.model || 'gemini',
          latency_ms: res.latency_ms ?? latencyMs,
          feedback_applied: safeFeedback || undefined,
          flags,
          metricEventMap,
        });
        return commitAndLog(verified);
      } catch (err: any) {
        lastError = err;
        if (options?.signal?.aborted) {
          throw err;
        }
        const isTimeout = clientTimedOut || err?.code === 'LLM_TIMEOUT' || err?.status === 504 || err?.name === 'AbortError';
        const isClientErr = err?.status && err.status >= 400 && err.status < 500 && err.status !== 429;
        if (isTimeout || isClientErr || attempt === 1) {
          break;
        }
        // Single short backoff before retry #1
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  // Fallback to deterministic template on any AI failure / timeout (never blocks user or Gate 2!)
  const fallback = buildTemplateBusinessInsights(factsTable, {
    latency_ms: Date.now() - startMs,
    rejected_count: 0,
    rejected_reasons: lastError?.message ? [`Chuyển mẫu tự động do AI không phản hồi: ${lastError.message}`] : [],
    feedback_applied: safeFeedback || undefined,
  });
  return commitAndLog(fallback);
}
