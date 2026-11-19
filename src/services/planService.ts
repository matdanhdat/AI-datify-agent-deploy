/**
 * Custom Plan Service (Prompt P6 Part C).
 * Manages one-off analysis workflows:
 * - AI plan proposal (gateway task plan_custom) or fallback templates
 * - Strict schema and constraint validation
 * - Execution via Web Worker (or pure runner)
 * - Storage in ArtifactStore under custom_1, custom_2, custom_3
 * - Integration with session state machine and audit logs
 */

import { ArtifactStore } from '../core/artifacts';
import { type PlanCustomInput, type PlanCustomOutput } from '../core/aiTaskSchemas';
import { appendLog } from '../core/audit';
import { AppError, ERROR_CODES } from '../core/errors';
import { sessionStore } from './sessionStore';
import { callAi, isAiAvailable } from './aiClient';
import { guardQuestion } from '../core/chat/guard';
import { matchStandard } from '../core/plan/matchStandard';
import { validatePlan } from '../core/plan/validate';
import { runPlan } from '../core/plan/runner';
import { runInWorker } from '../workers/workerRunner';
import { getActiveCleanArtifact } from './cleanService';
import type { CleanArtifact, Plan, PlanResult } from '../core/schemas';

export interface ProposePlanResponse {
  feasible: boolean;
  plan?: Plan;
  reason?: 'PREDICTION' | 'EXTERNAL_DATA' | 'UNSUPPORTED_OPERATION' | 'AMBIGUOUS' | 'STANDARD_PIPELINE' | 'GUARD_BLOCKED';
  message_vi?: string;
  source: 'ai' | 'standard_match' | 'guard' | 'fallback';
}

export const REASON_MESSAGES: Record<string, string> = {
  PREDICTION: 'Hệ thống chỉ phân tích dữ liệu lịch sử đã có, không đưa ra dự đoán giá hoặc xu hướng tương lai.',
  EXTERNAL_DATA: 'Yêu cầu đòi hỏi dữ liệu bên ngoài tập tin bạn đã nạp (như tin tức, vĩ mô, báo cáo tài chính).',
  UNSUPPORTED_OPERATION: 'Yêu cầu chứa thao tác ngoài danh mục cho phép. Hệ thống chỉ hỗ trợ 13 thao tác định lượng nội bộ.',
  AMBIGUOUS: 'Yêu cầu chưa đủ rõ ràng. Bạn vui lòng chỉ định cụ thể mã cổ phiếu và khoảng thời gian phân tích.',
  STANDARD_PIPELINE: 'Yêu cầu này đã được tính toán trong quy trình chuẩn.',
  GUARD_BLOCKED: 'Yêu cầu không hợp lệ hoặc vi phạm quy tắc an toàn của hệ thống.',
};

/**
 * Proposes a quantitative plan for a user request.
 * Never executes AI-generated code. Only generates or parses a Plan schema.
 */
export async function proposePlan(sessionId: string, userRequest: string): Promise<ProposePlanResponse> {
  const reqText = (userRequest || '').trim().slice(0, 300);

  if (!reqText) {
    return {
      feasible: false,
      reason: 'AMBIGUOUS',
      message_vi: 'Vui lòng nhập nội dung yêu cầu phân tích riêng.',
      source: 'guard',
    };
  }

  // 1. Guard check
  const guard = guardQuestion(reqText);
  if (!guard.allowed) {
    return {
      feasible: false,
      reason: 'GUARD_BLOCKED',
      message_vi: guard.cannedAnswer_vi || REASON_MESSAGES.GUARD_BLOCKED,
      source: 'guard',
    };
  }

  // 2. Standard pipeline match check
  const standardMatch = matchStandard(reqText);
  if (standardMatch.matched) {
    return {
      feasible: false,
      reason: 'STANDARD_PIPELINE',
      message_vi: standardMatch.message_vi,
      source: 'standard_match',
    };
  }

  // 3. Retrieve clean dataset for context
  const clean = ArtifactStore.get<CleanArtifact>(sessionId, 'clean') || getActiveCleanArtifact(sessionId);
  if (!clean || !clean.dataset) {
    throw new AppError(ERROR_CODES.INTERNAL, 'Chưa có dữ liệu làm sạch trong phiên để lập kế hoạch.', {}, 400);
  }

  const dataset = clean.dataset;

  // 4. If AI is not configured, inform fallback mode
  const aiReady = await isAiAvailable();
  if (!aiReady) {
    return {
      feasible: false,
      reason: 'AMBIGUOUS',
      message_vi: 'Hệ thống đang ở chế độ dự phòng (chưa kích hoạt AI). Bạn hãy chọn một mẫu kế hoạch dựng sẵn bên dưới.',
      source: 'fallback',
    };
  }

  // 5. Call AI Gateway task 'plan_custom'
  try {
    const dates = dataset.date_days;
    let minDate = '2026-01-01';
    let maxDate = '2026-03-31';
    if (dates && dates.length > 0) {
      minDate = new Date(dates[0] * 86400000).toISOString().slice(0, 10);
      maxDate = new Date(dates[dates.length - 1] * 86400000).toISOString().slice(0, 10);
    }

    const payload: PlanCustomInput = {
      request: reqText,
      data_profile: {
        symbols: dataset.symbols,
        date_from: minDate,
        date_to: maxDate,
        date_range: { from: minDate, to: maxDate },
        bar_count: dataset.n,
        columns: ['open', 'high', 'low', 'close', 'volume'],
      },
    };

    const res = await callAi<PlanCustomOutput>('plan_custom', payload);
    const aiRes = res.data;

    const record = sessionStore.getRecord(sessionId);

    if (!aiRes.feasible) {
      if (record) {
        record.log = appendLog(record.log, {
          step: record.state,
          actor: 'ai',
          action: 'custom_plan_rejected',
          detail: `Từ chối kế hoạch: ${aiRes.reason}`,
        });
      }

      return {
        feasible: false,
        reason: aiRes.reason,
        message_vi: REASON_MESSAGES[aiRes.reason] || 'Không thể tạo kế hoạch cho yêu cầu này.',
        source: 'ai',
      };
    }

    // Validate the proposed plan
    const valResult = validatePlan(aiRes.plan, dataset);
    if (!valResult.valid) {
      if (record) {
        record.log = appendLog(record.log, {
          step: record.state,
          actor: 'system',
          action: 'custom_plan_rejected',
          detail: `Kế hoạch AI không hợp lệ: ${valResult.errors.join('; ')}`,
        });
      }

      return {
        feasible: false,
        reason: 'UNSUPPORTED_OPERATION',
        message_vi: `Kế hoạch do AI đề xuất không hợp lệ: ${valResult.errors.join('; ')}`,
        source: 'ai',
      };
    }

    if (record) {
      record.log = appendLog(record.log, {
        step: record.state,
        actor: 'ai',
        action: 'custom_plan_proposed',
        detail: `Đề xuất kế hoạch: ${aiRes.plan.title_vi} (${aiRes.plan.steps.length} bước)`,
      });
    }

    return {
      feasible: true,
      plan: aiRes.plan,
      source: 'ai',
    };
  } catch (err: any) {
    return {
      feasible: false,
      reason: 'AMBIGUOUS',
      message_vi: `Không thể kết nối cổng AI (${err.message || 'Lỗi mạng'}). Hãy chọn một mẫu dựng sẵn bên dưới.`,
      source: 'fallback',
    };
  }
}

/**
 * Finds next free slot among custom_1, custom_2, custom_3.
 */
export function getNextCustomSlot(sessionId: string): string | null {
  for (let i = 1; i <= 3; i++) {
    const key = `custom_${i}`;
    if (!ArtifactStore.has(sessionId, key)) {
      return key;
    }
  }
  return null;
}

/**
 * Returns all custom plan results currently saved for the session.
 */
export function getCustomResultsList(sessionId: string): Array<{ slot: string; result: PlanResult }> {
  const list: Array<{ slot: string; result: PlanResult }> = [];
  for (let i = 1; i <= 3; i++) {
    const slot = `custom_${i}`;
    const res = ArtifactStore.get<PlanResult>(sessionId, slot);
    if (res) {
      list.push({ slot, result: res });
    }
  }
  return list;
}

/**
 * Executes an approved plan, stores it in ArtifactStore, and appends audit log.
 */
export async function executePlan(
  sessionId: string,
  plan: Plan,
  options?: {
    onProgress?: (progress: { percent: number; message: string }) => void;
    signal?: AbortSignal;
  }
): Promise<PlanResult> {
  const clean = ArtifactStore.get<CleanArtifact>(sessionId, 'clean') || getActiveCleanArtifact(sessionId);
  if (!clean || !clean.dataset) {
    throw new AppError(ERROR_CODES.INTERNAL, 'Chưa có dữ liệu làm sạch trong phiên.', {}, 400);
  }

  const slotKey = getNextCustomSlot(sessionId);
  if (!slotKey) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      'Mỗi phiên chỉ được thực hiện tối đa 3 phân tích riêng. Bạn vui lòng xóa bớt một phân tích đã chạy trước khi tiếp tục.',
      {},
      400
    );
  }

  // Validate plan strictly
  const valResult = validatePlan(plan, clean.dataset);
  if (!valResult.valid) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Kế hoạch không hợp lệ: ${valResult.errors.join('; ')}`,
      {},
      400
    );
  }

  const record = sessionStore.getRecord(sessionId);
  if (record) {
    record.log = appendLog(record.log, {
      step: record.state,
      actor: 'user',
      action: 'custom_plan_approved',
      detail: `Duyệt kế hoạch: ${plan.title_vi}`,
    });
  }

  let result: PlanResult;

  // Execute either in Web Worker or synchronous runner
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('../workers/plan.worker.ts', import.meta.url), {
        type: 'module',
      });
      result = await runInWorker<{ plan: Plan; dataset: any }, PlanResult, { percent: number; message: string }>(
        worker,
        { plan, dataset: clean.dataset },
        {
          onProgress: options?.onProgress,
          signal: options?.signal,
        }
      );
    } catch {
      // Fallback to pure runner if worker instantiating fails (e.g. in test env)
      result = runPlan(plan, clean.dataset, (pct, msg) => {
        if (options?.onProgress) {
          options.onProgress({ percent: pct, message: msg });
        }
      });
    }
  } else {
    result = runPlan(plan, clean.dataset, (pct, msg) => {
      if (options?.onProgress) {
        options.onProgress({ percent: pct, message: msg });
      }
    });
  }

  // Store in ArtifactStore
  ArtifactStore.put(sessionId, slotKey, result);

  if (record) {
    record.log = appendLog(record.log, {
      step: record.state,
      actor: 'system',
      action: 'custom_plan_ran',
      detail: `Hoàn tất phân tích riêng (${slotKey}): ${result.title_vi}`,
    });
  }

  return result;
}

/**
 * Deletes a custom plan result from the session.
 */
export function deleteCustomPlan(sessionId: string, slotOrId: string): boolean {
  let targetSlot = slotOrId;
  if (!/^custom_[123]$/.test(slotOrId)) {
    // Find slot by result.id
    for (let i = 1; i <= 3; i++) {
      const s = `custom_${i}`;
      const res = ArtifactStore.get<PlanResult>(sessionId, s);
      if (res && res.id === slotOrId) {
        targetSlot = s;
        break;
      }
    }
  }

  const deleted = ArtifactStore.delete(sessionId, targetSlot);
  if (deleted) {
    const record = sessionStore.getRecord(sessionId);
    if (record) {
      record.log = appendLog(record.log, {
        step: record.state,
        actor: 'user',
        action: 'custom_plan_deleted',
        detail: `Đã xóa phân tích riêng: ${targetSlot}`,
      });
    }
  }
  return deleted;
}
