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

  describe('Prompt FIX-CONTEXT: Business vs Trading Context Validation', () => {
    it('(1) business: lưu bối cảnh có chữ, không câu hỏi → thành công', () => {
      const s = createSession('Biz Test 1');
      const ctx = setBusinessContext(
        s.id,
        {
          company_name: 'An Phát',
          role: 'Chủ shop',
          extra_info: 'Bán quần áo thời trang',
          analysis_questions: [],
        },
        { allowEmptyQuestions: true }
      );
      expect(ctx.company_name).toBe('An Phát');
      expect(ctx.role).toBe('Chủ shop');
      expect(ctx.extra_info).toBe('Bán quần áo thời trang');
      expect(ctx.analysis_questions.length).toBe(0);
    });

    it('(2) business: bối cảnh rỗng → thành công', () => {
      const s = createSession('Biz Test 2');
      const ctx = setBusinessContext(s.id, {}, { allowEmptyQuestions: true });
      expect(ctx.analysis_questions.length).toBe(0);
      expect(ctx.company_name).toBeUndefined();
    });

    it('(3) business: chữ vượt 2.000 ký tự → lỗi đúng lý do, không phải lỗi câu hỏi', () => {
      const s = createSession('Biz Test 3');
      expect(() =>
        setBusinessContext(s.id, { extra_info: 'a'.repeat(2001) }, { allowEmptyQuestions: true })
      ).toThrowError(/Thông tin bổ sung tối đa 2\.000 ký tự\./);
      try {
        setBusinessContext(s.id, { extra_info: 'a'.repeat(2001) }, { allowEmptyQuestions: true });
      } catch (err: any) {
        expect(err.message).not.toContain('yêu cầu phân tích');
      }
    });

    it('(4) trading: không câu hỏi → vẫn lỗi CONTEXT_REQUIRED', () => {
      const s = createSession('Trading Test 4');
      sessionStore.getRecord(s.id)!.meta.dataset = { kind: 'trading' } as any;
      expect(() =>
        setBusinessContext(
          s.id,
          { company_name: 'Trading Co', extra_info: 'Swing trade' },
          { allowEmptyQuestions: false }
        )
      ).toThrowError(/Bạn cần nhập ít nhất một yêu cầu phân tích\./);
    });

    it('(5) trading: có câu hỏi → thành công', () => {
      const s = createSession('Trading Test 5');
      sessionStore.getRecord(s.id)!.meta.dataset = { kind: 'trading' } as any;
      const ctx = setBusinessContext(
        s.id,
        { company_name: 'Trading Co', analysis_questions: ['Mã nào tăng trưởng mạnh nhất?'] },
        { allowEmptyQuestions: false }
      );
      expect(ctx.analysis_questions.length).toBe(1);
      expect(ctx.analysis_questions[0]).toBe('Mã nào tăng trưởng mạnh nhất?');
    });

    it('(6) phiên cũ có analysis_questions trong bối cảnh kinh doanh → mở lại không lỗi và không mất dữ liệu', () => {
      const s = createSession('Biz Test 6');
      setBusinessContext(
        s.id,
        {
          company_name: 'Old Business',
          extra_info: 'Mô tả ban đầu',
          analysis_questions: ['Doanh thu theo kênh nào cao nhất?'],
        },
        { allowEmptyQuestions: true }
      );

      // Mở lại phiên: không lỗi, dữ liệu còn nguyên vẹn
      const reopened = getSession(s.id);
      expect(reopened.business_context?.analysis_questions.length).toBe(1);
      expect(reopened.business_context?.analysis_questions[0]).toBe('Doanh thu theo kênh nào cao nhất?');
      expect(reopened.business_context?.company_name).toBe('Old Business');
      expect(reopened.business_context?.extra_info).toBe('Mô tả ban đầu');

      // Khi lưu lại từ UploadPage (không có ô câu hỏi trong form), analysis_questions vẫn được bảo toàn
      const updated = setBusinessContext(
        s.id,
        {
          company_name: 'Old Business',
          extra_info: 'Cập nhật thêm mô tả hoạt động',
          analysis_questions: [],
        },
        { allowEmptyQuestions: true }
      );
      expect(updated.analysis_questions.length).toBe(1);
      expect(updated.analysis_questions[0]).toBe('Doanh thu theo kênh nào cao nhất?');
      expect(updated.extra_info).toBe('Cập nhật thêm mô tả hoạt động');
      expect(updated.company_name).toBe('Old Business');
    });
  });
});

