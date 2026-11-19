/**
 * Strictly Read-Only Query Service (Readers).
 * Implements architectural boundaries: AI Agent, Chat Assistant, and UI query components
 * can ONLY read analyzed data through these functions.
 * Pure TypeScript - zero mutations, zero external dependencies.
 */

import { ArtifactStore } from '../core/artifacts';
import { sessionStore } from './sessionStore';
import type {
  AnalysisResult,
  ChartSpec,
  Metric,
  AuditEntry,
  CleanArtifact,
  Narrative,
  ReportArtifact,
  PlanResult,
  BusinessContext,
} from '../core/schemas';
import type { ValidationOutcome } from '../core/validator';
import { METRIC_DEFINITIONS, type MetricDefinition } from '../core/metrics/metricSpec';
import { getAppGuide } from '../core/chat/appGuide';
import { buildChatContext, type ChatContext } from '../core/chat/context';
import type { SessionRecord } from '../core/state';

export interface AnalysisSummary {
  symbols: string[];
  date_from: string;
  date_to: string;
  clean_hash: string;
  created_at: string;
  metrics_count: number;
  charts_count: number;
  warnings: string[];
}

/**
 * Returns high-level summary of quantitative analysis for a session.
 */
export function getAnalysisSummary(sessionId: string): AnalysisSummary | undefined {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!analysis) return undefined;

  return {
    symbols: analysis.config.symbols,
    date_from: analysis.config.date_from,
    date_to: analysis.config.date_to,
    clean_hash: analysis.clean_hash,
    created_at: analysis.created_at,
    metrics_count: analysis.metrics.length,
    charts_count: analysis.charts.length,
    warnings: analysis.warnings,
  };
}

/**
 * Lists metrics, optionally filtered by symbol.
 */
export function listMetrics(sessionId: string, symbol?: string): Metric[] {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!analysis) return [];

  if (!symbol) {
    return analysis.metrics;
  }
  return analysis.metrics.filter((m) => m.symbol === symbol);
}

/**
 * Retrieves a specific metric by ID and symbol.
 */
export function getMetric(
  sessionId: string,
  metricId: string,
  symbol?: string
): Metric | undefined {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!analysis) return undefined;

  return analysis.metrics.find((m) => {
    if (m.id !== metricId) return false;
    if (symbol !== undefined) return m.symbol === symbol;
    return true;
  });
}

/**
 * Retrieves a specific chart specification by ID.
 */
export function getChartSpec(sessionId: string, chartId: string): ChartSpec | undefined {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  if (!analysis) return undefined;

  return analysis.charts.find((c) => c.id === chartId);
}

/**
 * Retrieves metric definition metadata from single source of truth.
 */
export function getMetricSpecInfo(metricId: string): MetricDefinition | undefined {
  return METRIC_DEFINITIONS[metricId];
}

/**
 * Retrieves the session audit trail.
 */
export function getPipelineLog(sessionId: string): AuditEntry[] {
  const record = sessionStore.getRecord(sessionId);
  return record ? [...record.log] : [];
}

/**
 * Retrieves the data validation report from upload step.
 */
export function getValidationReport(sessionId: string): ValidationOutcome | undefined {
  return ArtifactStore.get<ValidationOutcome>(sessionId, 'validation');
}

/**
 * Retrieves the active clean artifact metadata (without exposing raw mutable internals).
 */
export function getCleanArtifactInfo(sessionId: string): { hash: string; reviewer_name: string; approved_at: string } | undefined {
  const record = sessionStore.getRecord(sessionId);
  if (!record || !record.meta.clean_version) return undefined;
  const clean = ArtifactStore.get<CleanArtifact>(sessionId, `clean_v${record.meta.clean_version}`);
  if (!clean) return undefined;
  return {
    hash: clean.hash,
    reviewer_name: clean.reviewer_name,
    approved_at: clean.approved_at,
  };
}

/**
 * Retrieves the current narrative of the report in the session.
 * Strictly read-only.
 */
export function getNarrative(sessionId: string): Narrative | undefined {
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  return report?.narrative;
}

export interface ReportStatusSummary {
  status: 'draft' | 'approved' | 'none';
  is_stale: boolean;
  reviewer_name: string | null;
  approved_at: string | null;
  report_hash: string | null;
}

/**
 * Retrieves the approval and freshness status of the report.
 * Strictly read-only.
 */
export function getReportStatus(sessionId: string): ReportStatusSummary {
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');

  if (!report) {
    return {
      status: 'none',
      is_stale: false,
      reviewer_name: null,
      approved_at: null,
      report_hash: null,
    };
  }

  const isStale = Boolean(analysis?.analysis_hash && report.analysis_hash !== analysis.analysis_hash);

  return {
    status: report.status,
    is_stale: isStale,
    reviewer_name: report.reviewer_name || null,
    approved_at: report.approved_at || null,
    report_hash: report.report_hash || null,
  };
}

/**
 * Retrieves the full session record in a read-only manner.
 */
export function getSessionRecord(sessionId: string): SessionRecord | undefined {
  const record = sessionStore.getRecord(sessionId);
  return record ? JSON.parse(JSON.stringify(record)) : undefined;
}

/**
 * Retrieves all custom analysis workflow results executed for the session (up to 3).
 * Strictly read-only.
 */
export function getCustomResults(sessionId: string): PlanResult[] {
  const results: PlanResult[] = [];
  for (let i = 1; i <= 3; i++) {
    const res = ArtifactStore.get<PlanResult>(sessionId, `custom_${i}`);
    if (res) results.push(res);
  }
  return results;
}

/**
 * Returns static application guide markdown text (~3-4 KB).
 * Strictly read-only.
 */
export function getGuideText(): string {
  return getAppGuide();
}

/**
 * Constructs a comprehensive ChatContext for the AI or Local rule answer.
 * Strictly read-only, non-raw-data summary.
 */
export function getChatContext(
  sessionId: string,
  page: string,
  activeSymbol?: string
): ChatContext {
  const record = sessionStore.getRecord(sessionId);
  const validation = ArtifactStore.get<ValidationOutcome>(sessionId, 'validation');
  const cleanArtifact = record?.meta.clean_version
    ? ArtifactStore.get<CleanArtifact>(sessionId, `clean_v${record.meta.clean_version}`)
    : null;
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');

  return buildChatContext({
    page,
    record,
    validation,
    cleanArtifact,
    analysis,
    report,
    activeSymbol,
  });
}

/**
 * Returns a read-only copy of the session business context (Prompt D3).
 */
export function getBusinessContext(sessionId: string): BusinessContext | null {
  const record = sessionStore.getRecord(sessionId);
  if (!record || !record.meta || !record.meta.business_context) {
    return null;
  }
  const ctx = record.meta.business_context as BusinessContext;
  return {
    company_name: ctx.company_name,
    role: ctx.role,
    extra_info: ctx.extra_info,
    analysis_questions: [...ctx.analysis_questions],
  };
}


