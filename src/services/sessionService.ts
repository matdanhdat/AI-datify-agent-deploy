/// <reference types="vite/client" />
import { ArtifactStore } from '../core/artifacts';
import { appendLog } from '../core/audit';
import { AppError, ERROR_CODES } from '../core/errors';
import {
  buildSessionView,
  transition,
  type SessionRecord,
} from '../core/state';
import { normalizeContext } from '../core/context/normalize';
import type {
  AppConfig,
  AuditActor,
  AuditEntry,
  BusinessContext,
  HealthResponse,
  Session,
} from '../core/schemas';
import { APP_CONFIG_DEFAULTS } from './appConfig';
import { sessionStore } from './sessionStore';

/**
 * Creates a brand new session in tab memory.
 */
export function createSession(name?: string | null): Session {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const initialLog = appendLog([], {
    step: 'upload',
    actor: 'user',
    action: 'create_session',
    detail: name ? `Khởi tạo phiên làm việc: ${name}` : 'Khởi tạo phiên làm việc mới',
  });

  const record: SessionRecord = {
    id,
    name: name || null,
    state: 'created',
    created_at: now,
    updated_at: now,
    meta: {
      report_status: 'none',
      clean_version: null,
      dataset: null,
    },
    log: initialLog,
  };

  sessionStore.setRecord(record);
  sessionStore.setActiveSessionId(id);

  return buildSessionView(record);
}

/**
 * Retrieves a session by its UUID. Throws AppError("NOT_FOUND") if missing.
 */
export function getSession(id: string): Session {
  const record = sessionStore.getRecord(id);
  if (!record) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      `Không tìm thấy phiên làm việc với mã: ${id}`,
      { id },
      404
    );
  }
  return buildSessionView(record);
}

/**
 * Lists all active sessions in the current browser tab, newest first.
 */
export function listSessions(): Session[] {
  const records = sessionStore.getAllRecords();
  return [...records]
    .reverse()
    .map(buildSessionView);
}

/**
 * Deletes a session and purges all its heavy artifacts from memory.
 */
export function deleteSession(id: string): void {
  const exists = sessionStore.getRecord(id);
  if (!exists) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      `Không thể xóa vì không tìm thấy phiên: ${id}`,
      { id },
      404
    );
  }
  ArtifactStore.deleteSession(id);
  sessionStore.deleteRecord(id);
}

/**
 * Retrieves immutable audit entries for a session, oldest first.
 */
export function getLog(id: string): AuditEntry[] {
  const record = sessionStore.getRecord(id);
  if (!record) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      `Không tìm thấy phiên làm việc: ${id}`,
      { id },
      404
    );
  }
  // Return shallow copy sorted by id ascending (oldest first)
  return [...record.log].sort((a, b) => a.id - b.id);
}

/**
 * Dispatches an event through the state machine, records audit trail,
 * and clears downstream artifacts if applicable.
 */
export function dispatch(
  id: string,
  event: string,
  actor: AuditActor = 'user',
  detail: string = '',
  dataHash?: string | null
): Session {
  const record = sessionStore.getRecord(id);
  if (!record) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      `Không tìm thấy phiên làm việc: ${id}`,
      { id },
      404
    );
  }

  // Pure state machine transition
  const { nextRecord, cleanupStage } = transition(record, event);

  // Invalidate downstream artifacts in ArtifactStore
  if (cleanupStage) {
    ArtifactStore.clearAfter(id, cleanupStage);
  }

  // Audit event logging
  const actionName = `transition:${event}`;
  const logDetail = detail || `Chuyển trạng thái sang ${nextRecord.state}`;
  const updatedLog = appendLog(nextRecord.log, {
    step: nextRecord.state,
    actor,
    action: actionName,
    detail: logDetail,
    data_hash: dataHash,
  });

  const finalRecord: SessionRecord = {
    ...nextRecord,
    log: updatedLog,
  };

  sessionStore.setRecord(finalRecord);
  return buildSessionView(finalRecord);
}

/**
 * Sets or updates the business context & analysis requirements for a session (Prompt D3).
 * Sanitizes input, enforces invariants, writes audit log, and preserves atomic state.
 */
export function setBusinessContext(sessionId: string, input: unknown): BusinessContext {
  const record = sessionStore.getRecord(sessionId);
  if (!record) {
    throw new AppError(ERROR_CODES.NOT_FOUND, `Không tìm thấy phiên làm việc [${sessionId}]`);
  }

  const normalized = normalizeContext(input);
  if (!normalized.ok || !normalized.data || !normalized.hash) {
    throw new AppError(ERROR_CODES.VALIDATION, normalized.error || 'Dữ liệu bối cảnh không hợp lệ.');
  }

  const isFirstTime = !record.meta.business_context;
  const oldCtx = record.meta.business_context as BusinessContext | undefined;

  const changedFields: string[] = [];
  if (!oldCtx) {
    changedFields.push('analysis_questions');
    if (normalized.data.company_name) changedFields.push('company_name');
    if (normalized.data.role) changedFields.push('role');
    if (normalized.data.extra_info) changedFields.push('extra_info');
  } else {
    if (oldCtx.company_name !== normalized.data.company_name) changedFields.push('company_name');
    if (oldCtx.role !== normalized.data.role) changedFields.push('role');
    if (oldCtx.extra_info !== normalized.data.extra_info) changedFields.push('extra_info');
    if (JSON.stringify(oldCtx.analysis_questions) !== JSON.stringify(normalized.data.analysis_questions)) {
      changedFields.push('analysis_questions');
    }
  }

  // If report was already approved, updating context transitions session back to analyzed (draft review)
  let nextState = record.state;
  let nextReportStatus = record.meta.report_status;
  if (record.state === 'report_approved' && changedFields.length > 0) {
    nextState = 'analyzed';
    nextReportStatus = 'draft';
  }

  const action = isFirstTime ? 'context_saved' : 'context_changed';
  const detail = isFirstTime
    ? `Lưu bối cảnh và ${normalized.data.analysis_questions.length} câu hỏi phân tích ban đầu`
    : `Cập nhật trường: [${changedFields.join(', ')}], tổng số ${normalized.data.analysis_questions.length} câu hỏi`;

  const updatedLog = appendLog(record.log, {
    step: 'upload',
    actor: 'user',
    action,
    detail,
    data_hash: normalized.hash,
  });

  const updatedRecord: SessionRecord = {
    ...record,
    state: nextState,
    updated_at: new Date().toISOString(),
    meta: {
      ...record.meta,
      business_context: normalized.data,
      context_hash: normalized.hash,
      report_status: nextReportStatus,
    },
    log: updatedLog,
  };

  sessionStore.setRecord(updatedRecord);
  return normalized.data;
}

/**
 * Merges local constants with /api/health serverless gateway response.
 * Always resolves gracefully to fallback mode if the gateway is unreachable.
 */
export async function getAppConfig(): Promise<AppConfig> {
  let aiMode: 'ai' | 'fallback' = 'fallback';
  let llmKeySlots = 0;
  let llmModel = 'gemini-2.0-flash';
  let llmKeyConfigured = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data: HealthResponse = await res.json();
      aiMode = data.ai_mode;
      llmKeySlots = data.llm_key_slots;
      llmModel = data.llm_model || llmModel;
      llmKeyConfigured = data.llm_key_slots > 0;
    }
  } catch (_err) {
    // Offline or serverless function not reachable: fallback gracefully
    aiMode = 'fallback';
    llmKeySlots = 0;
    llmKeyConfigured = false;
  }

  return {
    app_name: APP_CONFIG_DEFAULTS.appName,
    llm_provider: APP_CONFIG_DEFAULTS.llmProvider,
    llm_model: llmModel,
    llm_key_configured: llmKeyConfigured,
    llm_key_slots: llmKeySlots,
    min_sessions: APP_CONFIG_DEFAULTS.minSessions,
    strict_mode: APP_CONFIG_DEFAULTS.strictMode,
    trading_days: APP_CONFIG_DEFAULTS.tradingDays,
    max_file_mb: APP_CONFIG_DEFAULTS.maxFileMb,
    max_rows: APP_CONFIG_DEFAULTS.maxRows,
    max_symbols: APP_CONFIG_DEFAULTS.maxSymbols,
    ai_mode: aiMode,
  };
}

/**
 * Dev tool to force state machine events directly for testing.
 * Strictly gated by import.meta.env.DEV or VITE_ENABLE_DEV_TOOLS.
 */
export const devForceEvent =
  import.meta.env.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
    ? (id: string, event: string, actor: AuditActor = 'user', detail: string = 'Dev force event'): Session => {
        return dispatch(id, event, actor, detail);
      }
    : undefined;
