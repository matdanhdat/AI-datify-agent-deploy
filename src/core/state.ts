import { AppError, ERROR_CODES } from './errors';
import type {
  AuditEntry,
  BusinessContext,
  DatasetMeta,
  ReportStatus,
  Session,
  SessionState,
  StepInfo,
  StepKey,
  StepStatus,
} from './schemas';

export interface SessionRecordMeta {
  dataset?: DatasetMeta | null;
  clean_version?: number | null;
  reviewer_name?: string | null;
  report_status?: ReportStatus;
  business_context?: BusinessContext | null;
  context_hash?: string | null;
  [key: string]: unknown;
}

export interface SessionRecord {
  id: string;
  name?: string | null;
  state: SessionState;
  created_at: string;
  updated_at: string;
  meta: SessionRecordMeta;
  log: readonly AuditEntry[];
}

export const BASE_UNLOCKED_PAGES: string[] = [
  'home',
  'upload',
  'agent',
  'history',
  'config',
];

export const STEP_DEFINITIONS: Array<[StepKey, string]> = [
  ['upload', 'Dữ liệu'],
  ['clean', 'Làm sạch'],
  ['review', 'Duyệt'],
  ['analyze', 'Phân tích'],
  ['report', 'Báo cáo'],
];

export const STEP_STATUS_BY_STATE: Record<SessionState, StepStatus[]> = {
  created: ['current', 'locked', 'locked', 'locked', 'locked'],
  uploaded: ['done', 'current', 'locked', 'locked', 'locked'],
  cleaning_review: ['done', 'done', 'current', 'locked', 'locked'],
  clean_approved: ['done', 'done', 'done', 'current', 'locked'],
  analyzed: ['done', 'done', 'done', 'done', 'current'],
  report_approved: ['done', 'done', 'done', 'done', 'done'],
};

export const EXTRA_PAGES_BY_STATE: Record<SessionState, string[]> = {
  created: [],
  uploaded: ['clean'],
  cleaning_review: ['clean'],
  clean_approved: ['clean', 'analyze'],
  analyzed: ['clean', 'analyze', 'report'],
  report_approved: ['clean', 'analyze', 'report'],
};

// Transition matrix
const SEQUENTIAL_TRANSITIONS: Record<string, SessionState> = {
  'created:upload_ok': 'uploaded',
  'uploaded:proposals_ready': 'cleaning_review',
  'cleaning_review:clean_approved': 'clean_approved',
  'clean_approved:analysis_done': 'analyzed',
  'analyzed:analysis_done': 'analyzed',
  'report_approved:analysis_done': 'analyzed',
  'analyzed:report_approved': 'report_approved',
  'report_approved:report_edited': 'analyzed',
};

const RELOAD_ALLOWED_STATES = new Set<SessionState>([
  'uploaded',
  'cleaning_review',
  'clean_approved',
  'analyzed',
  'report_approved',
]);

const RECLEAN_ALLOWED_STATES = new Set<SessionState>([
  'clean_approved',
  'analyzed',
  'report_approved',
]);

export const TRANSITION_GUIDANCE: Record<string, string> = {
  upload_ok: 'Không thể nạp dữ liệu ở trạng thái này.',
  proposals_ready: 'Bạn cần nạp tệp dữ liệu hợp lệ trước khi tạo đề xuất làm sạch.',
  clean_approved: 'Bạn cần có đề xuất làm sạch đang chờ duyệt trước khi phê duyệt dữ liệu.',
  analysis_done: 'Bạn cần duyệt dữ liệu sạch trước khi phân tích.',
  report_approved: 'Bạn cần hoàn thành phân tích trước khi duyệt báo cáo.',
  report_edited: 'Báo cáo chỉ có thể chỉnh sửa lại sau khi đã được duyệt.',
  reclean: 'Bạn chỉ có thể yêu cầu làm sạch lại sau khi đã từng duyệt dữ liệu sạch.',
};

/**
 * Builds the public Session view contract from an internal SessionRecord.
 */
export function buildSessionView(record: SessionRecord): Session {
  const state = record.state;
  const stepStatuses = STEP_STATUS_BY_STATE[state] || [
    'current',
    'locked',
    'locked',
    'locked',
    'locked',
  ];

  const steps: StepInfo[] = STEP_DEFINITIONS.map(([key, label_vi], idx) => ({
    key,
    label_vi,
    status: stepStatuses[idx] || 'locked',
  }));

  const extraPages = EXTRA_PAGES_BY_STATE[state] || [];
  // Ensure unique list preserving order
  const unlocked_pages = Array.from(new Set([...BASE_UNLOCKED_PAGES, ...extraPages]));

  return {
    id: record.id,
    name: record.name || null,
    state,
    created_at: record.created_at,
    updated_at: record.updated_at,
    dataset: record.meta.dataset || null,
    clean_version: record.meta.clean_version ?? null,
    reviewer_name: (record.meta.reviewer_name as string) || null,
    report_status: record.meta.report_status || 'none',
    steps,
    unlocked_pages,
    business_context: record.meta.business_context || null,
  };
}

/**
 * Enforces that the session is in one of the allowed states.
 */
export function requireState(
  session: { state: SessionState },
  allowed: readonly SessionState[] | Set<SessionState>
): void {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  if (!allowedSet.has(session.state)) {
    const allowedStr = Array.from(allowedSet).sort().join(', ');
    throw new AppError(
      ERROR_CODES.STATE_INVALID,
      `Hành động này không được phép ở trạng thái hiện tại (${session.state}). Yêu cầu trạng thái: ${allowedStr}.`,
      { current_state: session.state, allowed_states: Array.from(allowedSet) },
      409
    );
  }
}

export interface TransitionResult {
  nextRecord: SessionRecord;
  cleanupStage?: 'upload_ok' | 'reclean' | 'report_edited';
}

/**
 * Pure state machine transition function with downstream invalidation.
 */
export function transition(record: SessionRecord, event: string): TransitionResult {
  const fromState = record.state;
  let toState: SessionState | null = null;
  let cleanupStage: 'upload_ok' | 'reclean' | 'report_edited' | undefined;

  const key = `${fromState}:${event}`;
  if (SEQUENTIAL_TRANSITIONS[key]) {
    toState = SEQUENTIAL_TRANSITIONS[key];
  } else if (event === 'upload_ok' && RELOAD_ALLOWED_STATES.has(fromState)) {
    toState = 'uploaded';
    cleanupStage = 'upload_ok';
  } else if (event === 'reclean' && RECLEAN_ALLOWED_STATES.has(fromState)) {
    toState = 'cleaning_review';
    cleanupStage = 'reclean';
  }

  if (!toState) {
    const hint =
      TRANSITION_GUIDANCE[event] ||
      `Không thể chuyển từ trạng thái '${fromState}' qua sự kiện '${event}'.`;
    throw new AppError(
      ERROR_CODES.STATE_INVALID,
      `Vi phạm máy trạng thái: ${hint}`,
      { from_state: fromState, event },
      409
    );
  }

  // Handle downstream invalidation in metadata
  const nextMeta: SessionRecordMeta = { ...record.meta };

  if (toState === 'uploaded') {
    nextMeta.clean_version = null;
    nextMeta.report_status = 'none';
    delete nextMeta.proposals;
    delete nextMeta.metrics;
    delete nextMeta.charts;
    delete nextMeta.report;
    cleanupStage = 'upload_ok';
  } else if (toState === 'cleaning_review' && event === 'reclean') {
    // Keep clean_version history, but invalidate analysis and report
    nextMeta.report_status = 'none';
    delete nextMeta.metrics;
    delete nextMeta.charts;
    delete nextMeta.report;
    cleanupStage = 'reclean';
  } else if (event === 'report_edited') {
    nextMeta.report_status = 'draft';
    cleanupStage = 'report_edited';
  } else if (event === 'analysis_done') {
    nextMeta.report_status = 'none';
    delete nextMeta.report;
  }

  const nextRecord: SessionRecord = {
    ...record,
    state: toState,
    updated_at: new Date().toISOString(),
    meta: nextMeta,
  };

  return { nextRecord, cleanupStage };
}

