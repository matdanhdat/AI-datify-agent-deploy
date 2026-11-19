import type { AuditActor, AuditEntry } from './schemas';

export interface NewAuditEntryInput {
  step: string;
  actor: AuditActor;
  action: string;
  detail: string;
  data_hash?: string | null;
}

/**
 * Appends a new immutable entry to the audit log.
 * Generates monotonically increasing ID and ISO UTC timestamp.
 * Freezes the entry and returns a new frozen array copy.
 */
export function appendLog(
  currentLog: readonly AuditEntry[] = [],
  input: NewAuditEntryInput
): readonly AuditEntry[] {
  const nextId = currentLog.length > 0 ? currentLog[currentLog.length - 1].id + 1 : 1;
  const ts = new Date().toISOString();

  const newEntry: AuditEntry = Object.freeze({
    id: nextId,
    ts,
    step: input.step,
    actor: input.actor,
    action: input.action,
    detail: input.detail,
    data_hash: input.data_hash || null,
  });

  const nextLog = Object.freeze([...currentLog, newEntry]);
  return nextLog;
}

