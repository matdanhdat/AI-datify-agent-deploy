/**
 * Pure Chat Context Builder (Prompt P6 Section 3 & 5.2).
 * Aggregates high-level statistical summaries from readers.
 * Strictly ZERO raw data rows. Hard-bounded to <= 64 KB.
 * Pure TypeScript - zero external runtime dependencies.
 */

import { METRIC_DEFINITIONS } from '../metrics/metricSpec';
import type {
  AnalysisResult,
  AuditEntry,
  CleanArtifact,
  ReportArtifact,
} from '../schemas';
import type { ValidationOutcome } from '../validator';
import type { SessionRecord } from '../state';

export interface ChatMetricSummary {
  id: string;
  symbol: string;
  label_vi: string;
  value: number | null;
  display: string;
  formula_vi: string;
  meaning_vi: string;
  calc?: Array<{ label_vi: string; value: number | string }>;
}

export interface ChatContext {
  page: string;
  state: string;
  step: number;
  data_summary?: {
    filename: string;
    rows: number;
    symbols: string[];
    date_from: string;
    date_to: string;
  };
  cleaning_summary?: {
    operations_enabled: number;
    rows_dropped: number;
    rows_cleaned: number;
  };
  last_rejection?: Array<{
    code: string;
    message_vi: string;
    fix_vi: string;
  }>;
  active_symbol?: string;
  metrics: ChatMetricSummary[];
  insufficient_metrics: Array<{
    id: string;
    symbol: string;
    label_vi: string;
    reason_vi: string;
  }>;
  report_status: {
    status: 'draft' | 'approved' | 'none';
    reviewer_name: string | null;
    approved_at: string | null;
    report_hash: string | null;
  };
  recent_log: Array<{
    step: string;
    action: string;
    detail: string;
    time: string;
  }>;
  glossary: Array<{
    id: string;
    label_vi: string;
    formula_vi: string;
    meaning_vi: string;
    excel_hint: string;
  }>;
}

export interface BuildContextParams {
  page: string;
  record?: SessionRecord | null;
  validation?: ValidationOutcome | null;
  cleanArtifact?: CleanArtifact | null;
  analysis?: AnalysisResult | null;
  report?: ReportArtifact | null;
  activeSymbol?: string;
}

export function buildChatContext(params: BuildContextParams): ChatContext {
  const { page, record, validation, cleanArtifact, analysis, report, activeSymbol } = params;

  const state = record?.state || 'created';
  const stepMap: Record<string, number> = {
    created: 1,
    uploaded: 2,
    cleaning_review: 2,
    clean_approved: 3,
    analyzed: 4,
    report_approved: 5,
  };
  const step = stepMap[state] || 1;

  // 1. Data summary
  let data_summary: ChatContext['data_summary'] = undefined;
  if (record?.meta.dataset) {
    const ds = record.meta.dataset;
    data_summary = {
      filename: ds.filename || 'unknown.xlsx',
      rows: ds.rows || 0,
      symbols: ds.symbols || [],
      date_from: ds.date_from || '',
      date_to: ds.date_to || '',
    };
  }

  // 2. Cleaning summary
  let cleaning_summary: ChatContext['cleaning_summary'] = undefined;
  if (cleanArtifact) {
    const enabledOps = cleanArtifact.decisions ? Object.values(cleanArtifact.decisions).filter(Boolean).length : 0;
    const rawRows = record?.meta.dataset?.rows || cleanArtifact.dataset?.n || cleanArtifact.businessTable?.n || 0;
    const cleanRows = cleanArtifact.dataset?.n || cleanArtifact.businessTable?.n || 0;
    cleaning_summary = {
      operations_enabled: enabledOps,
      rows_dropped: Math.max(0, rawRows - cleanRows),
      rows_cleaned: cleanRows,
    };
  }

  // 3. Last rejection
  let last_rejection: ChatContext['last_rejection'] = undefined;
  if (validation && !validation.ok && 'issues' in validation && Array.isArray((validation as any).issues)) {
    const errorIssues = (validation as any).issues.filter((i: any) => i.severity === 'error');
    last_rejection = errorIssues.slice(0, 10).map((e: any) => ({
      code: e.code,
      message_vi: e.message_vi,
      fix_vi: e.fix_vi,
    }));
  }

  // 4. Metrics
  const metrics: ChatMetricSummary[] = [];
  const insufficient_metrics: ChatContext['insufficient_metrics'] = [];

  if (analysis?.metrics) {
    for (const m of analysis.metrics) {
      if (m.status === 'ok') {
        let display = m.text || '';
        if (!display && m.value !== null && m.value !== undefined) {
          if (m.unit === 'ratio') display = `${(m.value * 100).toFixed(2).replace('.', ',')}%`;
          else if (m.unit === 'currency') display = `${m.value.toFixed(2).replace('.', ',')} đ`;
          else display = m.value.toLocaleString('vi-VN');
        }

        metrics.push({
          id: m.id,
          symbol: m.symbol || '*',
          label_vi: m.label_vi,
          value: m.value ?? null,
          display,
          formula_vi: m.formula_vi,
          meaning_vi: m.meaning_vi || '',
          calc: m.calc,
        });
      } else if (m.status === 'insufficient_data') {
        insufficient_metrics.push({
          id: m.id,
          symbol: m.symbol || '*',
          label_vi: m.label_vi,
          reason_vi: m.reason_vi || 'Số phiên dữ liệu chưa đạt ngưỡng tối thiểu',
        });
      }
    }
  }

  // 5. Report status
  const report_status: ChatContext['report_status'] = {
    status: report?.status || 'none',
    reviewer_name: report?.reviewer_name || null,
    approved_at: report?.approved_at || null,
    report_hash: report?.report_hash || null,
  };

  // 6. Recent log (max 15 entries)
  const recent_log = (record?.log || []).slice(-15).map((l: AuditEntry) => ({
    step: l.step,
    action: l.action,
    detail: (l.detail || '').slice(0, 150),
    time: l.ts,
  }));

  // 7. Glossary from METRIC_DEFINITIONS
  const glossary = Object.values(METRIC_DEFINITIONS).map((def) => ({
    id: def.id,
    label_vi: def.label_vi,
    formula_vi: def.formula_vi,
    meaning_vi: def.meaning_vi,
    excel_hint: def.excel_hint,
  }));

  const context: ChatContext = {
    page,
    state,
    step,
    data_summary,
    cleaning_summary,
    last_rejection,
    active_symbol: activeSymbol || (analysis?.config.symbols[0] ?? undefined),
    metrics,
    insufficient_metrics,
    report_status,
    recent_log,
    glossary,
  };

  // Enforce size limit <= 64 KB
  const jsonStr = JSON.stringify(context);
  if (jsonStr.length > 60000) {
    // Truncate recent log and calc details if needed
    context.recent_log = context.recent_log.slice(-5);
    for (const m of context.metrics) {
      delete m.calc;
    }
  }

  return context;
}
