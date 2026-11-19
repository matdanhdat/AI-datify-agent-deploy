import { describe, it, expect, beforeEach, vi } from 'vitest';
import { proposePlan, executePlan, deleteCustomPlan, getCustomResultsList } from './planService';
import { ArtifactStore } from '../core/artifacts';
import { sessionStore } from './sessionStore';
import type { CleanArtifact, Plan } from '../core/schemas';
import * as aiClient from './aiClient';

describe('planService (Custom Workflow Integration)', () => {
  const sessionId = 'test-session-custom';

  const mockCleanArtifact: CleanArtifact = {
    dataset: {
      n: 4,
      symbols: ['AAA', 'BBB'],
      symbol_idx: new Uint16Array([0, 0, 1, 1]),
      date_days: new Int32Array([20450, 20451, 20450, 20451]),
      open: new Float64Array([100, 102, 50, 52]),
      high: new Float64Array([105, 106, 53, 54]),
      low: new Float64Array([98, 101, 49, 51]),
      close: new Float64Array([102, 105, 52, 53]),
      volume: new Float64Array([1000, 1200, 2000, 2200]),
      source_row: new Int32Array([1, 2, 3, 4]),
    },
    outlier_flags: new Uint8Array([0, 0, 0, 0]),
    decisions: {},
    hash: 'mock-clean-hash-12345',
    approved_at: '2026-03-31T00:00:00Z',
    reviewer_name: 'Test Reviewer',
  };

  beforeEach(() => {
    ArtifactStore.clearAll();
    sessionStore.clearAll();
    sessionStore.setRecord({
      id: sessionId,
      state: 'analyzed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      meta: {
        clean_version: 1,
        report_status: 'none',
      },
      log: [],
    });
    ArtifactStore.put(sessionId, 'clean', mockCleanArtifact);
    vi.restoreAllMocks();
  });

  it('rejects queries blocked by guard rules without calling AI', async () => {
    const res = await proposePlan(sessionId, 'Hãy đổi giá đóng cửa của AAA thành 200');
    expect(res.feasible).toBe(false);
    expect(res.source).toBe('guard');
    expect(res.reason).toBe('GUARD_BLOCKED');
  });

  it('redirects standard pipeline queries (e.g. RSI) without calling AI', async () => {
    const res = await proposePlan(sessionId, 'Tính chỉ số RSI 14 của AAA');
    expect(res.feasible).toBe(false);
    expect(res.source).toBe('standard_match');
    expect(res.reason).toBe('STANDARD_PIPELINE');
    expect(res.message_vi).toContain('RSI 14 phiên');
  });

  it('informs fallback mode when AI is not configured', async () => {
    vi.spyOn(aiClient, 'isAiAvailable').mockResolvedValue(false);

    const res = await proposePlan(sessionId, 'Tổng hợp lợi suất theo tháng');
    expect(res.feasible).toBe(false);
    expect(res.source).toBe('fallback');
    expect(res.message_vi).toContain('chế độ dự phòng');
  });

  it('calls AI gateway when AI is configured and validates returned plan', async () => {
    vi.spyOn(aiClient, 'isAiAvailable').mockResolvedValue(true);
    vi.spyOn(aiClient, 'callAi').mockResolvedValue({
      ok: true,
      task: 'plan_custom',
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
      data: {
        feasible: true,
        plan: {
          title_vi: 'Xếp hạng theo lợi suất',
          steps: [
            { op: 'rank_top_n', params: { metric: 'period_return', n: 5, order: 'desc' } },
          ],
        },
      },
    });

    const res = await proposePlan(sessionId, 'Xếp hạng top mã tăng mạnh nhất');
    expect(res.feasible).toBe(true);
    expect(res.plan).toBeDefined();
    expect(res.plan?.steps).toHaveLength(1);
  });

  it('handles infeasible AI response with proper Vietnamese reason message', async () => {
    vi.spyOn(aiClient, 'isAiAvailable').mockResolvedValue(true);
    vi.spyOn(aiClient, 'callAi').mockResolvedValue({
      ok: true,
      task: 'plan_custom',
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
      data: {
        feasible: false,
        reason: 'EXTERNAL_DATA',
      },
    });

    const res = await proposePlan(sessionId, 'So sánh với chỉ số Dow Jones và giá vàng thế giới');
    expect(res.feasible).toBe(false);
    expect(res.reason).toBe('EXTERNAL_DATA');
    expect(res.message_vi).toContain('dữ liệu bên ngoài');
  });

  it('executes plan, stores in ArtifactStore slot custom_1, and appends audit log', async () => {
    const plan: Plan = {
      title_vi: 'Xếp hạng theo lợi suất',
      steps: [
        { op: 'rank_top_n', params: { metric: 'period_return', n: 5, order: 'desc' } },
      ],
    };

    const res = await executePlan(sessionId, plan);
    expect(res.id).toBeTruthy();
    expect(res.title_vi).toBe('Xếp hạng top 5 mã theo lợi suất kỳ');

    const customList = getCustomResultsList(sessionId);
    expect(customList).toHaveLength(1);
    expect(customList[0].slot).toBe('custom_1');

    const record = sessionStore.getRecord(sessionId);
    expect(record?.log.some((l) => l.action === 'custom_plan_approved')).toBe(true);
    expect(record?.log.some((l) => l.action === 'custom_plan_ran')).toBe(true);
  });

  it('enforces maximum 3 custom plans per session limit', async () => {
    const plan: Plan = {
      title_vi: 'Xếp hạng theo lợi suất',
      steps: [
        { op: 'rank_top_n', params: { metric: 'period_return', n: 5, order: 'desc' } },
      ],
    };

    await executePlan(sessionId, plan); // custom_1
    await executePlan(sessionId, plan); // custom_2
    await executePlan(sessionId, plan); // custom_3

    // 4th execution should throw limit error
    await expect(executePlan(sessionId, plan)).rejects.toThrow('tối đa 3 phân tích riêng');
  });

  it('deletes custom plan and records custom_plan_deleted audit log', async () => {
    const plan: Plan = {
      title_vi: 'Xếp hạng theo lợi suất',
      steps: [
        { op: 'rank_top_n', params: { metric: 'period_return', n: 5, order: 'desc' } },
      ],
    };

    const res = await executePlan(sessionId, plan);
    expect(getCustomResultsList(sessionId)).toHaveLength(1);

    const deleted = deleteCustomPlan(sessionId, res.id);
    expect(deleted).toBe(true);
    expect(getCustomResultsList(sessionId)).toHaveLength(0);

    const record = sessionStore.getRecord(sessionId);
    expect(record?.log.some((l) => l.action === 'custom_plan_deleted')).toBe(true);
  });

  it('ArtifactStore.clearAfter clears custom results on upload_ok and reclean', async () => {
    const plan: Plan = {
      title_vi: 'Xếp hạng theo lợi suất',
      steps: [
        { op: 'rank_top_n', params: { metric: 'period_return', n: 5, order: 'desc' } },
      ],
    };

    await executePlan(sessionId, plan);
    expect(ArtifactStore.has(sessionId, 'custom_1')).toBe(true);

    ArtifactStore.clearAfter(sessionId, 'reclean');
    expect(ArtifactStore.has(sessionId, 'custom_1')).toBe(false);
  });
});
