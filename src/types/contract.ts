/**
 * Data contracts derived directly from Zod schemas in src/core/schemas.ts.
 * Preserves 100% of P0/P1 field names (snake_case) and types.
 */
export type {
  ErrorResponse,
  ValidationIssue,
  DatasetMeta,
  StepKey,
  StepStatus,
  StepInfo,
  SessionState,
  ReportStatus,
  Session,
  SessionCreate,
  MetricUnit,
  MetricStatus,
  MetricPolarity,
  DeltaMetric,
  Metric,
  ChartKind,
  ChartTable,
  ChartSpec,
  AuditActor,
  AuditEntry,
  AppConfig,
  HealthResponse,
  DeleteResponse,
  DevEventRequest,
  BusinessContext,
  DatasetKind,
  ColumnRoleItem,
} from '../core/schemas';

export type ValidationSeverity = 'error' | 'warning';
export type AiMode = 'ai' | 'fallback';

export type { RawDataset } from '../core/dataset';
export type { BusinessTable, BusinessColumn, ColumnRole, ColumnRoleMapping } from '../core/businessTable';
