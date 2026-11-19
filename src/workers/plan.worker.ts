/**
 * Custom Plan Execution Web Worker (Prompt P6 Section 9.2).
 * Runs custom quantitative workflows off the main UI thread.
 * Zero eval, zero AI code generation, zero dynamic execution.
 */

import type { CleanDataset, Plan, PlanResult } from '../core/schemas';
import { runPlan } from '../core/plan/runner';

export interface PlanWorkerInput {
  plan: Plan;
  dataset: CleanDataset;
}

export interface PlanWorkerProgress {
  percent: number;
  message: string;
}

self.onmessage = (e: MessageEvent<PlanWorkerInput>) => {
  const { plan, dataset } = e.data;

  try {
    self.postMessage({
      type: 'progress',
      progress: { percent: 5, message: 'Đang khởi tạo khung dữ liệu cho quy trình...' },
    });

    const result: PlanResult = runPlan(plan, dataset, (pct, stepText) => {
      self.postMessage({
        type: 'progress',
        progress: {
          percent: Math.min(95, Math.max(10, pct)),
          message: `Đang thực thi: ${stepText}`,
        },
      });
    });

    self.postMessage({
      type: 'progress',
      progress: { percent: 100, message: 'Hoàn tất phân tích riêng.' },
    });

    self.postMessage({
      type: 'success',
      data: result,
    });
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      code: 'INTERNAL',
      message_vi: err.message || 'Lỗi khi thực thi quy trình riêng trong Web Worker.',
      details: { stack: err.stack },
    });
  }
};

