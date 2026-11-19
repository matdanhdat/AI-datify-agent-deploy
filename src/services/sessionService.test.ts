import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactStore } from '../core/artifacts';
import { AppError } from '../core/errors';
import {
  createSession,
  deleteSession,
  dispatch,
  getLog,
  getSession,
  listSessions,
  setBusinessContext,
} from './sessionService';
import { sessionStore } from './sessionStore';

describe('In-Memory Session Service', () => {
  beforeEach(() => {
    sessionStore.clearAll();
    ArtifactStore.clearAll();
  });

  it('creates session with state created and initial audit entry', () => {
    const session = createSession('Phiên Kiểm Thử');
    expect(session.id).toBeDefined();
    expect(session.name).toBe('Phiên Kiểm Thử');
    expect(session.state).toBe('created');
    expect(session.steps.length).toBe(5);
    expect(session.unlocked_pages).toContain('upload');

    // Audit log
    const log = getLog(session.id);
    expect(log.length).toBe(1);
    expect(log[0].action).toBe('create_session');
  });

  it('retrieves session by id and throws NOT_FOUND for unknown uuid', () => {
    const created = createSession();
    const fetched = getSession(created.id);
    expect(fetched.id).toBe(created.id);

    expect(() => getSession('00000000-0000-0000-0000-000000000000')).toThrow(AppError);
  });

  it('lists sessions sorted by creation time newest first', () => {
    const s1 = createSession('Phiên 1');
    const s2 = createSession('Phiên 2');

    const list = listSessions();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(s2.id); // Newer first
    expect(list[1].id).toBe(s1.id);
  });

  it('dispatches state machine event and records transition in audit log', () => {
    const s = createSession();
    const uploaded = dispatch(s.id, 'upload_ok', 'user', 'Nạp tệp giao dịch thành công');

    expect(uploaded.state).toBe('uploaded');
    expect(uploaded.unlocked_pages).toContain('clean');

    const log = getLog(s.id);
    expect(log.length).toBe(2);
    expect(log[1].action).toBe('transition:upload_ok');
    expect(log[1].detail).toBe('Nạp tệp giao dịch thành công');
  });

  it('deletes session and purges artifacts from memory', () => {
    const s = createSession();
    ArtifactStore.put(s.id, 'raw', [1, 2, 3]);
    expect(ArtifactStore.has(s.id, 'raw')).toBe(true);

    deleteSession(s.id);

    expect(() => getSession(s.id)).toThrow(AppError);
    expect(ArtifactStore.has(s.id, 'raw')).toBe(false);
  });

  it('cleans downstream artifacts when reclean or upload_ok is dispatched', () => {
    const s = createSession();
    dispatch(s.id, 'upload_ok');
    dispatch(s.id, 'proposals_ready');
    dispatch(s.id, 'clean_approved');

    ArtifactStore.put(s.id, 'clean_v1', { data: 'clean' });
    ArtifactStore.put(s.id, 'analysis', { metrics: [1, 2] });
    ArtifactStore.put(s.id, 'report', { text: 'draft' });

    // Reclean should keep clean_v1, but clear analysis and report
    dispatch(s.id, 'reclean');
    expect(ArtifactStore.has(s.id, 'clean_v1')).toBe(true);
    expect(ArtifactStore.has(s.id, 'analysis')).toBe(false);
    expect(ArtifactStore.has(s.id, 'report')).toBe(false);
  });

  it('D3: setBusinessContext saves context, logs correctly, and manages state transition from report_approved', () => {
    const s = createSession('Test Business Context');

    // 1. Initial save
    const ctx1 = setBusinessContext(s.id, {
      company_name: 'Vinamilk',
      role: 'CFO',
      analysis_questions: ['Doanh thu theo kênh nào cao nhất?'],
    });

    expect(ctx1.company_name).toBe('Vinamilk');
    expect(ctx1.analysis_questions.length).toBe(1);

    const log1 = getLog(s.id);
    const saveEntry = log1.find((l) => l.action === 'context_saved');
    expect(saveEntry).toBeDefined();
    expect(saveEntry?.actor).toBe('user');
    // Ensure raw question content is NOT leaked in log
    expect(saveEntry?.detail).not.toContain('Doanh thu theo kênh nào');
    expect(saveEntry?.data_hash).toBeDefined();

    // 2. Subsequent update
    const ctx2 = setBusinessContext(s.id, {
      company_name: 'Vinamilk',
      role: 'CEO',
      analysis_questions: [
        'Doanh thu theo kênh nào cao nhất?',
        'Sản phẩm nào có biên lợi nhuận tốt nhất?',
      ],
    });
    expect(ctx2.role).toBe('CEO');
    expect(ctx2.analysis_questions.length).toBe(2);

    const log2 = getLog(s.id);
    const changeEntry = log2.find((l) => l.action === 'context_changed');
    expect(changeEntry).toBeDefined();
    expect(changeEntry?.detail).toContain('role');
    expect(changeEntry?.detail).toContain('analysis_questions');

    // 3. Modifying context in report_approved state resets to analyzed (draft)
    dispatch(s.id, 'upload_ok');
    dispatch(s.id, 'proposals_ready');
    dispatch(s.id, 'clean_approved');
    dispatch(s.id, 'analysis_done');
    dispatch(s.id, 'report_approved');

    let currentSession = getSession(s.id);
    expect(currentSession.state).toBe('report_approved');

    setBusinessContext(s.id, {
      company_name: 'Vinamilk Corporation',
      role: 'CEO',
      analysis_questions: ['Doanh thu theo kênh nào cao nhất?'],
    });

    currentSession = getSession(s.id);
    expect(currentSession.state).toBe('analyzed');
    expect(currentSession.report_status).toBe('draft');
  });
});

