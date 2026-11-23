/**
 * Shared AI Task Schemas (Single Source of Truth for Client & AI Gateway).
 * Defines Zod schemas for all AI Gateway task inputs and outputs.
 * Imported by both client-side callers (src/) and serverless handlers (api/_lib/).
 */

import { z } from 'zod';

// ============================================================================
// 1. Ping Task (Connectivity & Latency Diagnostic)
// ============================================================================
export const PingInputSchema = z.object({
  timestamp: z.number().optional(),
});
export type PingInput = z.infer<typeof PingInputSchema>;

export const PingOutputSchema = z.object({
  pong: z.boolean(),
  message: z.string(),
  timestamp: z.number(),
});
export type PingOutput = z.infer<typeof PingOutputSchema>;

// ============================================================================
// 2. Explain Cleaning Task (Data Cleaning Proposals Explanation)
// ============================================================================
export const ExplainCleaningProposalInputSchema = z.object({
  id: z.string().max(60),
  op: z.enum([
    'drop_exact_duplicates',
    'drop_rows_missing_ohlc',
    'fill_missing_volume_zero',
    'flag_outliers',
    'drop_flagged_outliers',
    'sort_by_symbol_date',
  ]),
  rows_affected: z.number().int().nonnegative(),
  affected_symbols: z.array(z.string().max(12)).max(10),
  severity: z.enum(['info', 'warn']),
  default_enabled: z.boolean(),
});
export type ExplainCleaningProposalInput = z.infer<typeof ExplainCleaningProposalInputSchema>;

export const ExplainCleaningInputSchema = z.object({
  total_rows: z.number().int().positive(),
  total_symbols: z.number().int().positive(),
  date_from: z.string().max(20),
  date_to: z.string().max(20),
  proposals: z.array(ExplainCleaningProposalInputSchema).min(1).max(12),
});
export type ExplainCleaningInput = z.infer<typeof ExplainCleaningInputSchema>;

export const ExplainCleaningOutputSchema = z.object({
  explanations: z.array(
    z.object({
      id: z.string().max(60),
      why_vi: z.string().max(400),
      risk_vi: z.string().max(400),
    })
  ),
});
export type ExplainCleaningOutput = z.infer<typeof ExplainCleaningOutputSchema>;

// ============================================================================
// 3. Write Report Task (Quantitative Analysis Narrative)
// ============================================================================
export const MetricItemInputSchema = z.object({
  key: z.string().max(80),
  id: z.string().max(40),
  label_vi: z.string().max(100),
  symbol: z.string().max(20).nullable(),
  unit: z.string().max(20),
  value: z.number().nullable(),
  display: z.string().max(100),
  delta_display: z.string().max(100).optional().nullable(),
  polarity: z.string().max(30),
});
export type MetricItemInput = z.infer<typeof MetricItemInputSchema>;

export const InsufficientMetricInputSchema = z.object({
  key: z.string().max(80),
  label_vi: z.string().max(100),
  reason_vi: z.string().max(200),
});
export type InsufficientMetricInput = z.infer<typeof InsufficientMetricInputSchema>;

export const ChartSummaryInputSchema = z.object({
  key: z.string().max(80),
  title_vi: z.string().max(120),
  symbols: z.array(z.string().max(20)),
  summary_vi: z.string().max(1000).optional().default(''),
});
export type ChartSummaryInput = z.infer<typeof ChartSummaryInputSchema>;

export const FixIssueInputSchema = z.object({
  section_id: z.string().max(40),
  paragraph_index: z.number().int().nonnegative(),
  problem: z.string().max(200),
  token: z.string().max(100),
});
export type FixIssueInput = z.infer<typeof FixIssueInputSchema>;

export const WriteReportInputSchema = z.object({
  config: z.object({
    symbols: z.array(z.string().max(20)).min(1).max(10),
    date_from: z.string().max(20),
    date_to: z.string().max(20),
    sessions: z.number().int().positive(),
  }),
  metrics: z.array(MetricItemInputSchema).max(150),
  insufficient: z.array(InsufficientMetricInputSchema).max(50).default([]),
  charts: z.array(ChartSummaryInputSchema).max(30).default([]),
  assumptions: z.object({
    trading_days: z.number().int().default(252),
    risk_free_rate: z.number().default(0),
    ma_windows: z.array(z.number().int()).default([20, 50]),
    rsi_window: z.number().int().default(14),
    volume_spike_rule: z.string().default('volume > mean20 + 2*std20'),
  }),
  data_notes: z.object({
    raw_rows: z.number().int().nonnegative(),
    clean_rows: z.number().int().nonnegative(),
    dropped_rows: z.number().int().nonnegative(),
    operations_enabled: z.number().int().nonnegative(),
    flagged_outliers: z.number().int().nonnegative(),
    warnings_count: z.number().int().nonnegative(),
  }),
  only_section: z.enum(['overview', 'trend', 'volume', 'risk', 'comparison', 'watch', 'limits']).optional(),
  style: z.enum(['concise', 'detailed', 'plain']).optional(),
  fix_issues: z.array(FixIssueInputSchema).max(20).optional(),
});
export type WriteReportInput = z.infer<typeof WriteReportInputSchema>;

export const WriteReportOutputSchema = z.object({
  sections: z.array(
    z.object({
      id: z.enum(['overview', 'trend', 'volume', 'risk', 'comparison', 'watch', 'limits']),
      paragraphs: z.array(
        z.object({
          text: z.string().max(700),
          evidence: z.array(z.string().max(80)),
        })
      ).min(1).max(3),
    })
  ).min(1).max(7),
});
export type WriteReportOutput = z.infer<typeof WriteReportOutputSchema>;

// ============================================================================
// 4. Chat Explain Task (Read-Only Assistant Answers)
// ============================================================================
export const ChatExplainInputSchema = z.object({
  question: z.string().min(1).max(500),
  page: z.string().max(50),
  state: z.string().max(50),
  history: z
    .array(
      z.object({
        sender: z.enum(['user', 'assistant', 'ai']), // Accepts both 'assistant' and 'ai'
        text: z.string().max(300),
      })
    )
    .max(6)
    .default([]),
  context: z.record(z.string(), z.any()),
});
export type ChatExplainInput = z.infer<typeof ChatExplainInputSchema>;

export const ChatExplainOutputSchema = z.object({
  intent: z.enum([
    'explain_metric',
    'explain_result',
    'how_to',
    'explain_error',
    'off_topic',
    'change_request',
  ]),
  answer_vi: z.string().max(900),
  evidence: z.array(z.string().max(80)).default([]),
});
export type ChatExplainOutput = z.infer<typeof ChatExplainOutputSchema>;

// ============================================================================
// 5. Plan Custom Task (One-Off Quantitative Workflow Planning)
// ============================================================================
export const PlanCustomInputSchema = z.object({
  request: z.string().min(1).max(300),
  data_profile: z.object({
    symbols: z.array(z.string().max(12)).min(1).max(10),
    date_from: z.string().max(20).optional(),
    date_to: z.string().max(20).optional(),
    date_range: z.object({ from: z.string().max(20), to: z.string().max(20) }).optional(),
    symbol_sessions: z.record(z.string(), z.number()).optional(),
    bar_count: z.number().int().nonnegative().optional(),
    columns: z.array(z.string()).default([]),
  }).refine(
    (d) => Boolean((d.date_from && d.date_to) || (d.date_range?.from && d.date_range?.to)),
    { message: 'Yêu cầu có date_from/date_to hoặc date_range' }
  ).transform((d) => ({
    ...d,
    date_from: d.date_from || d.date_range?.from || '',
    date_to: d.date_to || d.date_range?.to || '',
  })),
});
export type PlanCustomInput = z.infer<typeof PlanCustomInputSchema>;

export const PlanCustomOutputSchema = z.discriminatedUnion('feasible', [
  z.object({
    feasible: z.literal(true),
    title_vi: z.string().max(150),
    steps: z
      .array(
        z.object({
          op: z.enum([
            'filter_symbols',
            'filter_date_range',
            'resample_ohlcv',
            'pct_change',
            'cumulative_return',
            'rolling_mean',
            'rolling_volatility',
            'normalize_base100',
            'drawdown',
            'correlation',
            'rank_top_n',
            'compare_periods',
            'group_aggregate',
          ]),
          params: z.record(z.string(), z.any()),
        })
      )
      .min(1)
      .max(8),
    plan: z
      .object({
        title_vi: z.string().max(150),
        steps: z.array(
          z.object({
            op: z.string(),
            params: z.record(z.string(), z.any()),
          })
        ).max(8),
      })
      .optional(),
  }),
  z.object({
    feasible: z.literal(false),
    reason: z.enum(['PREDICTION', 'EXTERNAL_DATA', 'UNSUPPORTED_OPERATION', 'AMBIGUOUS']),
  }),
]).transform((val) => {
  if (val.feasible) {
    return {
      ...val,
      plan: val.plan || { title_vi: val.title_vi, steps: val.steps },
    };
  }
  return val;
});
export type PlanCustomOutput = z.infer<typeof PlanCustomOutputSchema>;

// ============================================================================
// 6. Business Insights Task (Prompt M3-B: Non-blocking Verified Business AI)
// ============================================================================
export const BusinessFactInputSchema = z.object({
  id: z.string().max(12),
  category: z.string().max(24),
  label_vi: z.string().max(160),
  display: z.string().max(220),
  unit: z.string().max(30),
});

export const InsightFindingInputSchema = z.object({
  rule_id: z.string().max(60),
  title: z.string().max(200),
  evidence: z.string().max(500),
  meaning: z.string().max(500),
  opportunity_risk: z.string().max(500),
  action: z.string().max(500),
  kpi_metric_id: z.string().max(60),
  check_after: z.enum(['1 tuần', '2 tuần', '4 tuần', '8 tuần', '1 quý']),
  source_refs: z.array(z.string().max(16)).min(1),
});
export type InsightFindingInput = z.infer<typeof InsightFindingInputSchema>;

export const InsightFindingOutputSchema = z.object({
  rule_id: z.string().max(60),
  title: z.string().max(200),
  evidence: z.string().max(500),
  meaning: z.string().max(500),
  opportunity_risk: z.string().max(500),
  action: z.string().max(500),
  kpi_metric_id: z.string().max(60),
  check_after: z.enum(['1 tuần', '2 tuần', '4 tuần', '8 tuần', '1 quý']),
  source_refs: z.array(z.string().max(16)).min(1),
});
export type InsightFindingOutput = z.infer<typeof InsightFindingOutputSchema>;

export const BusinessInsightsInputSchema = z.object({
  facts_hash: z.string().max(80),
  period: z.string().max(100),
  facts: z.array(BusinessFactInputSchema).min(1).max(50),
  findings: z.array(InsightFindingInputSchema).max(6).optional().default([]),
  questions: z.array(z.string().max(220)).max(8).optional().default([]),
  context_note: z.string().max(600).optional(),
  reviewer_feedback: z.string().max(400).optional(),
  // Prompt 3B Part 1: Two-tier flags & limits
  has_margin: z.boolean().optional().default(false),
  has_orders: z.boolean().optional().default(false),
  has_product: z.boolean().optional().default(false),
  has_channel: z.boolean().optional().default(false),
  has_region: z.boolean().optional().default(false),
  has_time: z.boolean().optional().default(false),
  confidence_level: z.string().optional().default('CAO'),
  data_limits: z.array(z.string()).optional().default([]),
});
export type BusinessInsightsInput = z.infer<typeof BusinessInsightsInputSchema>;

export const ByMetricSentenceSchema = z.object({
  text: z.string().max(350),
  refs: z.array(z.string().max(16)).min(1),
});
export type ByMetricSentence = z.infer<typeof ByMetricSentenceSchema>;

export const BusinessInsightsOutputSchema = z.object({
  findings: z.array(InsightFindingOutputSchema).max(6).optional().default([]),
  key_takeaways: z.array(z.string().max(350)).max(3).optional().default([]),
  summary: z.array(z.string().max(350)).max(3).optional().default([]),
  by_metric: z.record(z.string(), z.array(ByMetricSentenceSchema).max(2)).optional().default({}),
  followups: z.array(z.string().max(200)).max(2).optional().default([]),
  // Backward compatibility fields for old sessions
  insights: z
    .array(
      z.object({
        title: z.string().max(160),
        statement: z.string().max(500),
        evidence_ids: z.array(z.string().max(16)).min(1).max(8),
        confidence: z.enum(['cao', 'vừa', 'thấp']).default('vừa'),
      })
    )
    .max(5)
    .optional(),
  recommendations: z
    .array(
      z.object({
        action: z.string().max(240),
        rationale: z.string().max(400),
        evidence_ids: z.array(z.string().max(16)).min(1).max(8),
        expected_effect_note: z.string().max(280).optional().default(''),
        risk: z.string().max(280).optional().default(''),
      })
    )
    .max(5)
    .optional(),
  limitations: z.array(z.string().max(280)).max(5).optional(),
});
export type BusinessInsightsOutput = z.infer<typeof BusinessInsightsOutputSchema>;

// ============================================================================
// 7. Question To Metrics Task (Prompt 5B: User Query to Catalog Metrics)
// ============================================================================
export const QuestionToMetricsInputSchema = z.object({
  questions: z.array(z.string()).max(3),
  catalog_metrics: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      feasible: z.boolean(),
      reason: z.string().optional(),
    })
  ),
});
export type QuestionToMetricsInput = z.infer<typeof QuestionToMetricsInputSchema>;

export const QuestionToMetricsOutputSchema = z.object({
  matches: z.array(
    z.object({
      question_index: z.number(),
      metric_ids: z.array(z.string()),
      reason: z.string(),
    })
  ),
  unanswerable: z.array(
    z.object({
      question_index: z.number(),
      reason: z.string(),
    })
  ),
});
export type QuestionToMetricsOutput = z.infer<typeof QuestionToMetricsOutputSchema>;

