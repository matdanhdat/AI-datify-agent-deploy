/**
 * Deterministic Business Insight Rule Engine Adapter (Prompt 5B-FIX).
 * Re-exports core thresholds and types from insightEngine.ts.
 * Adapts app FactsTable / ComputeSelectedOutput into pure InsightInput and maps back to InsightEngineOutput.
 */

import type { FactsTable, FactItem } from './factsBuilder';
import type {
  MetricPivotTable,
  MatrixPivotTable,
} from '../metrics/businessComputeSelected';
import {
  INSIGHT_THRESHOLDS,
  CHECK_AFTER_VALUES,
  type CheckAfter,
  type FindingKind,
  type RuleId,
  type DimensionLabel,
  type GroupStat,
  type MatrixCell,
  type MonthStat,
  type InsightInput,
  type InsightAction,
  type InsightEvidence,
  type InsightFinding as EngineFinding,
  type InsightResult,
  INSIGHT_EMPTY_MESSAGE,
  NO_MARGIN_SENTENCE,
  runInsightRules,
} from './insightEngine';

export {
  INSIGHT_THRESHOLDS,
  CHECK_AFTER_VALUES,
  INSIGHT_EMPTY_MESSAGE,
  NO_MARGIN_SENTENCE,
  runInsightRules,
};
export type {
  CheckAfter,
  FindingKind,
  RuleId,
  DimensionLabel,
  GroupStat,
  MatrixCell,
  MonthStat,
  InsightInput,
  InsightAction,
  InsightEvidence,
  EngineFinding,
  InsightResult,
};

export type CheckAfterOption = CheckAfter;
export const ALLOWED_CHECK_AFTER = CHECK_AFTER_VALUES;

export interface InsightFinding {
  rule_id: RuleId | string;
  title: string;
  evidence: string;
  headline?: string;
  meaning: string;
  opportunity_risk: string;
  hypothesis?: string;
  action: string;
  kpi_metric_id: string | null;
  check_after: CheckAfter;
  source_refs: string[];
  isQuestionRelated?: boolean;
  relatedMetricIds?: string[];
  aiRewrite?: boolean;
  kind?: FindingKind | string;
  dimension?: DimensionLabel | string;
  priority?: number;
}

export interface InsightActionPriority {
  action: string;
  kpi_metric_id: string | null;
  check_after: CheckAfter;
  source_refs: string[];
  rule_id?: RuleId | string;
}

export interface InsightEngineOutput {
  findings: InsightFinding[];
  priority_actions: InsightActionPriority[];
  key_takeaways: string[];
  emptyMessage?: string | null;
}

/**
 * Extracts raw unrounded numbers into InsightInput for insightEngine.
 */
export function toInsightInput(
  selectedResult: any,
  tableMeta?: { rowCount: number },
  selectedMetricIds?: string[]
): InsightInput {
  // If already an InsightInput, return directly
  if (
    selectedResult &&
    typeof selectedResult.rowCount === 'number' &&
    typeof selectedResult.totalRevenue === 'number' &&
    Array.isArray(selectedResult.selectedMetricIds)
  ) {
    return selectedResult as InsightInput;
  }

  const metrics: Record<string, any> =
    selectedResult?.metrics || selectedResult?.metrics_result || {};

  // 1. rowCount
  let rowCount = tableMeta?.rowCount ?? selectedResult?.rowCount ?? 0;
  if (!rowCount && Array.isArray(selectedResult?.facts)) {
    const rowFact = selectedResult.facts.find(
      (f: FactItem) => f.label_vi?.toLowerCase().includes('dòng dữ liệu') && typeof f.value === 'number'
    );
    if (rowFact) rowCount = Number(rowFact.value);
  }
  if (!rowCount && selectedResult?.period) {
    const m = String(selectedResult.period).match(/(\d+)\s*dòng/);
    if (m) rowCount = parseInt(m[1], 10);
  }

  // 2. totalRevenue & totalProfit
  let totalRevenue = selectedResult?.totalRevenue ?? 0;
  if (!totalRevenue && metrics.total_revenue?.events?.[0]?.value !== undefined) {
    totalRevenue = Number(metrics.total_revenue.events[0].value);
  }
  if (!totalRevenue && Array.isArray(selectedResult?.facts)) {
    const revFact = selectedResult.facts.find((f: FactItem) => f.label_vi === 'Tổng doanh thu');
    if (revFact && typeof revFact.value === 'number') totalRevenue = revFact.value;
  }

  let totalProfit: number | null = null;
  const hasProfitMetric =
    metrics.gross_profit?.feasible ||
    metrics.gross_margin?.feasible ||
    metrics.margin_by_channel?.feasible ||
    metrics.margin_by_product?.feasible ||
    selectedResult?.isProfitComputed ||
    typeof selectedResult?.totalProfit === 'number' ||
    (selectedResult?.totalCogs !== undefined && selectedResult?.totalCogs !== null);

  if (hasProfitMetric) {
    if (typeof selectedResult?.totalProfit === 'number') {
      totalProfit = selectedResult.totalProfit;
    } else if (metrics.gross_profit?.events?.[0]?.value !== undefined) {
      totalProfit = Number(metrics.gross_profit.events[0].value);
    } else if (metrics.gross_margin?.events?.[0]?.value !== undefined && totalRevenue > 0) {
      totalProfit = Math.round((totalRevenue * Number(metrics.gross_margin.events[0].value)) / 100);
    } else if (
      selectedResult?.totalRevenue !== undefined &&
      selectedResult?.totalCogs !== undefined &&
      selectedResult?.totalCogs !== null
    ) {
      totalProfit = selectedResult.totalRevenue - selectedResult.totalCogs;
    } else if (Array.isArray(selectedResult?.facts)) {
      const profFact = selectedResult.facts.find(
        (f: FactItem) => f.label_vi === 'Tổng lợi nhuận gộp' || f.label_vi === 'Tổng lợi nhuận'
      );
      if (profFact && typeof profFact.value === 'number') {
        totalProfit = profFact.value;
      } else {
        const marginFact = selectedResult.facts.find(
          (f: FactItem) => f.label_vi === 'Biên lợi nhuận gộp tổng thể'
        );
        if (marginFact && typeof marginFact.value === 'number' && totalRevenue > 0) {
          totalProfit = Math.round((totalRevenue * marginFact.value) / 100);
        }
      }
    }
  }

  // 3. channels
  const channelMap = new Map<string, { revenue: number; profit?: number | null }>();
  const chRevRows: any[] = (metrics.revenue_by_channel?.pivot as MetricPivotTable)?.rows || [];
  chRevRows.forEach((r) => {
    if (r.label) channelMap.set(r.label, { revenue: r.revenue ?? 0, profit: r.profit ?? null });
  });
  const chMarginRows: any[] = (metrics.margin_by_channel?.pivot as MetricPivotTable)?.rows || [];
  chMarginRows.forEach((r) => {
    const existing = channelMap.get(r.label);
    if (existing) {
      if (r.profit !== undefined && r.profit !== null) {
        existing.profit = r.profit;
      } else if (r.margin_pct !== undefined && existing.revenue) {
        existing.profit = Math.round((existing.revenue * r.margin_pct) / 100);
      }
      if (!existing.revenue && r.revenue) existing.revenue = r.revenue;
    } else if (r.label) {
      const rev = r.revenue ?? 0;
      const prof = r.profit !== undefined && r.profit !== null
        ? r.profit
        : r.margin_pct !== undefined && rev
          ? Math.round((rev * r.margin_pct) / 100)
          : null;
      channelMap.set(r.label, { revenue: rev, profit: prof });
    }
  });
  const channels: GroupStat[] = Array.from(channelMap.entries()).map(([name, s]) => ({
    name,
    revenue: s.revenue,
    profit: s.profit,
  }));

  // 4. products
  const prodMap = new Map<string, { revenue: number; profit?: number | null }>();
  const prRevRows: any[] = (metrics.revenue_by_product?.pivot as MetricPivotTable)?.rows || [];
  prRevRows.forEach((r) => {
    if (r.label) prodMap.set(r.label, { revenue: r.revenue ?? 0, profit: r.profit ?? null });
  });
  const prMarginRows: any[] = (metrics.margin_by_product?.pivot as MetricPivotTable)?.rows || [];
  prMarginRows.forEach((r) => {
    const existing = prodMap.get(r.label);
    if (existing) {
      if (r.profit !== undefined && r.profit !== null) {
        existing.profit = r.profit;
      } else if (r.margin_pct !== undefined && existing.revenue) {
        existing.profit = Math.round((existing.revenue * r.margin_pct) / 100);
      }
      if (!existing.revenue && r.revenue) existing.revenue = r.revenue;
    } else if (r.label) {
      const rev = r.revenue ?? 0;
      const prof = r.profit !== undefined && r.profit !== null
        ? r.profit
        : r.margin_pct !== undefined && rev
          ? Math.round((rev * r.margin_pct) / 100)
          : null;
      prodMap.set(r.label, { revenue: rev, profit: prof });
    }
  });
  const products: GroupStat[] = Array.from(prodMap.entries()).map(([name, s]) => ({
    name,
    revenue: s.revenue,
    profit: s.profit,
  }));

  // Fallback totalProfit from groups if still null
  if (totalProfit === null && channels.length > 0 && channels.every((c) => c.profit != null)) {
    totalProfit = channels.reduce((sum, c) => sum + (c.profit as number), 0);
  } else if (totalProfit === null && products.length > 0 && products.every((p) => p.profit != null)) {
    totalProfit = products.reduce((sum, p) => sum + (p.profit as number), 0);
  }

  // 5. regions
  const regRows: any[] = (metrics.revenue_by_region?.pivot as MetricPivotTable)?.rows || [];
  const regions: GroupStat[] = regRows.map((r) => ({
    name: r.label,
    revenue: r.revenue ?? 0,
    profit: null,
  }));

  // 6. months
  const monthRows: any[] = (metrics.revenue_by_month?.pivot as MetricPivotTable)?.rows || [];
  const months: MonthStat[] = monthRows.map((r) => ({
    label: r.key || r.label,
    revenue: r.revenue ?? 0,
  }));

  // 7. matrix
  const matrixCells: any[] = (metrics.channel_product_matrix?.pivot as MatrixPivotTable)?.cells || [];
  const matrix: MatrixCell[] = matrixCells.map((c) => ({
    channel: c.channel,
    product: c.product,
    revenue: c.revenue ?? 0,
    profit: c.profit ?? 0,
  }));

  // 8. selectedMetricIds
  let effectiveMetricIds = selectedMetricIds;
  if (!effectiveMetricIds || effectiveMetricIds.length === 0) {
    if (Array.isArray(selectedResult?.question_metric_ids) && selectedResult.question_metric_ids.length > 0) {
      effectiveMetricIds = selectedResult.question_metric_ids;
    } else {
      effectiveMetricIds = Object.keys(metrics).filter(
        (k) => metrics[k]?.feasible || metrics[k]?.status === 'tính được'
      );
    }
  }

  return {
    rowCount,
    totalRevenue,
    totalProfit,
    channels: channels.length > 0 ? channels : undefined,
    products: products.length > 0 ? products : undefined,
    regions: regions.length > 0 ? regions : undefined,
    months: months.length > 0 ? months : undefined,
    matrix: matrix.length > 0 ? matrix : undefined,
    selectedMetricIds: effectiveMetricIds ?? [],
  };
}

/**
 * Evaluates business insight rules on FactsTable and maps to InsightEngineOutput.
 */
export function evaluateInsightRules(
  factsTable: FactsTable,
  questionMetricIds?: string[]
): InsightEngineOutput {
  const input = toInsightInput(factsTable, undefined, questionMetricIds || factsTable.question_metric_ids);
  const engineResult = runInsightRules(input);

  const facts = factsTable.facts || [];
  let factSeq = facts.length + 1;

  const findings: InsightFinding[] = engineResult.findings.map((f) => {
    const sourceRefs: string[] = [];
    const evidenceTexts: string[] = [];

    f.evidence.forEach((ev) => {
      // Find matching fact in factsTable
      const matchedFact = facts.find(
        (item) =>
          item.label_vi.toLowerCase().includes(ev.key.toLowerCase()) ||
          item.display.toLowerCase().includes(ev.text.toLowerCase())
      );

      let refId: string;
      if (matchedFact) {
        refId = matchedFact.id;
      } else {
        // Create new fact item so chip [F#] is never empty or dangling
        refId = `F${factSeq++}`;
        const nums = ev.text.match(/\d+([.,]\d+)?/g)?.map((s) => parseFloat(s.replace(/\./g, '').replace(',', '.'))) || [];
        facts.push({
          id: refId,
          category: (f.dimension as any) || 'quality',
          label_vi: ev.key,
          value: nums[0] ?? 0,
          display: ev.text,
          unit: ev.text.includes('%') ? '%' : 'VND',
          raw_numbers: nums.filter(Number.isFinite),
        });
      }

      sourceRefs.push(refId);
      evidenceTexts.push(`${ev.text} [${refId}]`);
    });

    if (sourceRefs.length === 0 && facts.length > 0) {
      const defaultFact = facts[0];
      sourceRefs.push(defaultFact.id);
      if (evidenceTexts.length === 0) {
        evidenceTexts.push(`${f.headline || f.title} [${defaultFact.id}]`);
      }
    }

    const isQuestionRelated = Boolean(
      questionMetricIds &&
        questionMetricIds.length > 0 &&
        (f.relatedMetricIds.some((id) => questionMetricIds.includes(id)) ||
          (f.actions[0]?.kpiMetricId && questionMetricIds.includes(f.actions[0].kpiMetricId)))
    );

    return {
      rule_id: f.ruleId,
      title: f.title,
      headline: f.headline,
      evidence: evidenceTexts.join(' '),
      meaning: f.meaning,
      opportunity_risk: f.opportunityRisk,
      hypothesis: f.hypothesis,
      action: f.actions[0]?.what ?? '',
      kpi_metric_id: f.actions[0]?.kpiMetricId ?? null,
      check_after: f.actions[0]?.checkAfter ?? '4 tuần',
      source_refs: sourceRefs,
      isQuestionRelated,
      relatedMetricIds: f.relatedMetricIds,
      aiRewrite: f.aiRewrite,
      kind: f.kind,
      dimension: f.dimension,
      priority: f.priority,
    };
  });

  // Sort findings: prioritize question-related findings while maintaining stable order
  findings.sort((a, b) => {
    if (a.isQuestionRelated && !b.isQuestionRelated) return -1;
    if (!a.isQuestionRelated && b.isQuestionRelated) return 1;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });

  const priority_actions: InsightActionPriority[] = engineResult.priorityActions.map((act) => {
    const parentFinding = findings.find((f) => f.rule_id === act.ruleId);
    return {
      action: act.what,
      kpi_metric_id: act.kpiMetricId,
      check_after: act.checkAfter,
      source_refs: parentFinding?.source_refs || [],
      rule_id: act.ruleId,
    };
  });

  const key_takeaways = engineResult.headline.map((h) => h.headline);

  return {
    findings,
    priority_actions,
    key_takeaways,
    emptyMessage: engineResult.emptyMessage,
  };
}
