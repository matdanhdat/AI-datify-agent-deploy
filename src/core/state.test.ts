import { describe, expect, it } from 'vitest';
import {
  buildSessionView,
  requireState,
  transition,
  type SessionRecord,
} from './state';
import { AppError } from './errors';
import type { SessionState } from './schemas';

function makeRecord(state: SessionState = 'created'): SessionRecord {
  return {
    id: 'test-session-uuid-1',
    name: 'Test Session',
    state,
    created_at: '2026-11-14T00:00:00.000Z',
    updated_at: '2026-11-14T00:00:00.000Z',
    meta: {
      clean_version: 1,
      report_status: 'draft',
      metrics: { return: 0.15 },
      charts: { main: {} },
      report: 'Analysis content',
    },
    log: [],
  };
}

describe('State Machine & Transitions (P0.5 Pure TS)', () => {
  it('executes the full linear valid lifecycle', () => {
    let rec = makeRecord('created');

    // 1. created -> uploaded
    const r1 = transition(rec, 'upload_ok');
    expect(r1.nextRecord.state).toBe('uploaded');
    rec = r1.nextRecord;

    // 2. uploaded -> cleaning_review
    const r2 = transition(rec, 'proposals_ready');
    expect(r2.nextRecord.state).toBe('cleaning_review');
    rec = r2.nextRecord;

    // 3. cleaning_review -> clean_approved (Gate 1 passed)
    const r3 = transition(rec, 'clean_approved');
    expect(r3.nextRecord.state).toBe('clean_approved');
    rec = r3.nextRecord;

    // 4. clean_approved -> analyzed
    const r4 = transition(rec, 'analysis_done');
    expect(r4.nextRecord.state).toBe('analyzed');
    rec = r4.nextRecord;

    // 5. analyzed -> report_approved (Gate 2 passed)
    const r5 = transition(rec, 'report_approved');
    expect(r5.nextRecord.state).toBe('report_approved');
    rec = r5.nextRecord;

    // 6. report_approved -> analyzed (edit report)
    const r6 = transition(rec, 'report_edited');
    expect(r6.nextRecord.state).toBe('analyzed');
    expect(r6.nextRecord.meta.report_status).toBe('draft');
  });

  it('allows file reload from any non-created state and invalidates downstream', () => {
    const states: SessionState[] = [
      'uploaded',
      'cleaning_review',
      'clean_approved',
      'analyzed',
      'report_approved',
    ];

    for (const st of states) {
      const rec = makeRecord(st);
      const { nextRecord, cleanupStage } = transition(rec, 'upload_ok');
      expect(nextRecord.state).toBe('uploaded');
      expect(cleanupStage).toBe('upload_ok');
      expect(nextRecord.meta.clean_version).toBeNull();
      expect(nextRecord.meta.report_status).toBe('none');
      expect(nextRecord.meta.metrics).toBeUndefined();
      expect(nextRecord.meta.charts).toBeUndefined();
      expect(nextRecord.meta.report).toBeUndefined();
    }
  });

  it('allows reclean from clean_approved, analyzed, report_approved and clears downstream', () => {
    const states: SessionState[] = ['clean_approved', 'analyzed', 'report_approved'];

    for (const st of states) {
      const rec = makeRecord(st);
      rec.meta.clean_version = 2;
      const { nextRecord, cleanupStage } = transition(rec, 'reclean');
      expect(nextRecord.state).toBe('cleaning_review');
      expect(cleanupStage).toBe('reclean');
      // Preserves clean_version history
      expect(nextRecord.meta.clean_version).toBe(2);
      expect(nextRecord.meta.report_status).toBe('none');
      // Invalids analysis and report
      expect(nextRecord.meta.metrics).toBeUndefined();
      expect(nextRecord.meta.charts).toBeUndefined();
      expect(nextRecord.meta.report).toBeUndefined();
    }
  });

  it('rejects invalid transitions and throws AppError with STATE_INVALID', () => {
    const rec = makeRecord('created');
    expect(() => transition(rec, 'clean_approved')).toThrow(AppError);
    expect(() => transition(rec, 'analysis_done')).toThrow(AppError);

    try {
      transition(rec, 'clean_approved');
    } catch (err: any) {
      expect(err.code).toBe('STATE_INVALID');
      expect(err.status).toBe(409);
      expect(err.message_vi).toContain('Vi phạm máy trạng thái');
    }
  });

  it('enforces requireState correctly', () => {
    const rec = makeRecord('cleaning_review');
    expect(() => requireState(rec, ['cleaning_review', 'clean_approved'])).not.toThrow();
    expect(() => requireState(rec, ['created', 'uploaded'])).toThrow(AppError);
  });

  it('builds session view mapping steps and unlocked pages exactly per contract', () => {
    // Verified: No state in P0 contract should ever include 'thu-vien-giao-dien' in unlocked_pages
    const allStates: SessionState[] = ['created', 'uploaded', 'cleaning_review', 'clean_approved', 'analyzed', 'report_approved'];
    for (const st of allStates) {
      const view = buildSessionView(makeRecord(st));
      expect(view.unlocked_pages).not.toContain('thu-vien-giao-dien');
      expect(view.unlocked_pages).not.toContain('ui_library');
    }

    // 1. created
    const v1 = buildSessionView(makeRecord('created'));
    expect(v1.steps.map((s) => s.status)).toEqual([
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(v1.unlocked_pages).toEqual(['home', 'upload', 'agent', 'history', 'config']);

    // 2. uploaded
    const v2 = buildSessionView(makeRecord('uploaded'));
    expect(v2.steps.map((s) => s.status)).toEqual([
      'done',
      'current',
      'locked',
      'locked',
      'locked',
    ]);
    expect(v2.unlocked_pages).toEqual(['home', 'upload', 'agent', 'history', 'config', 'clean']);

    // 3. cleaning_review
    const v3 = buildSessionView(makeRecord('cleaning_review'));
    expect(v3.steps.map((s) => s.status)).toEqual([
      'done',
      'done',
      'current',
      'locked',
      'locked',
    ]);
    expect(v3.unlocked_pages).toEqual(['home', 'upload', 'agent', 'history', 'config', 'clean']);

    // 4. clean_approved
    const v4 = buildSessionView(makeRecord('clean_approved'));
    expect(v4.steps.map((s) => s.status)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'locked',
    ]);
    expect(v4.unlocked_pages).toEqual([
      'home',
      'upload',
      'agent',
      'history',
      'config',
      'clean',
      'analyze',
    ]);

    // 5. analyzed
    const v5 = buildSessionView(makeRecord('analyzed'));
    expect(v5.steps.map((s) => s.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
    ]);
    expect(v5.unlocked_pages).toEqual([
      'home',
      'upload',
      'agent',
      'history',
      'config',
      'clean',
      'analyze',
      'report',
    ]);

    // 6. report_approved
    const v6 = buildSessionView(makeRecord('report_approved'));
    expect(v6.steps.map((s) => s.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(v6.unlocked_pages).toEqual([
      'home',
      'upload',
      'agent',
      'history',
      'config',
      'clean',
      'analyze',
      'report',
    ]);
  });
});

