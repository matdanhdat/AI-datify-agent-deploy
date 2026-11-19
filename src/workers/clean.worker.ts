/**
 * Dedicated Web Worker for data cleaning, profiling, and pipeline computation.
 * Supports both Trading datasets (RawDataset) and Business datasets (BusinessTable).
 * Executes heavy compute off the main thread with heartbeats to ensure zero UI freeze.
 */

import type { RawDataset } from '../core/dataset';
import type { BusinessTable } from '../core/businessTable';
import { calculateProfile } from '../core/cleaner/profile';
import { generateProposals } from '../core/cleaner/proposals';
import { runCleaningPipeline } from '../core/cleaner/pipeline';
import { computeCanonicalCleanHash } from '../core/cleaner/canonicalHash';
import { getTransferableBuffers } from '../core/dataset';
import {
  calculateBusinessProfile,
  generateBusinessProposals,
  runBusinessCleanPipeline,
  computeBusinessCanonicalHash,
} from '../core/cleaner/businessCleaner';

export interface CleanWorkerInput {
  task: 'profile_and_proposals' | 'diff_pipeline' | 'commit_clean';
  dataset: RawDataset | BusinessTable;
  decisions?: Record<string, boolean>;
  options?: {
    min_sessions?: number;
    strict_mode?: boolean;
    reviewer_name?: string;
  };
}

function isBusinessTable(data: any): data is BusinessTable {
  return data && typeof data === 'object' && data.kind === 'business';
}

function getBusinessTransferables(table: BusinessTable): Transferable[] {
  const buffers: Transferable[] = [];
  if (table.source_row?.buffer) buffers.push(table.source_row.buffer);
  for (const col of table.columns) {
    if (col.role === 'time' && col.values?.buffer) buffers.push(col.values.buffer);
    if (col.role === 'dimension' && col.codes?.buffer) buffers.push(col.codes.buffer);
    if (col.role === 'measure' && col.values?.buffer) buffers.push(col.values.buffer);
  }
  return buffers;
}

self.onmessage = async (e: MessageEvent<CleanWorkerInput>) => {
  const { task, dataset, decisions, options } = e.data;

  try {
    if (isBusinessTable(dataset)) {
      // ==========================================
      // BUSINESS DATASET WORKER TASKS
      // ==========================================
      if (task === 'profile_and_proposals') {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'profiling', percent: 30, message: 'Đang lập hồ sơ dữ liệu kinh doanh...' },
        });

        const profile = calculateBusinessProfile(dataset);

        self.postMessage({
          type: 'progress',
          progress: { stage: 'proposals', percent: 70, message: 'Đang tạo danh mục 5 đề xuất làm sạch...' },
        });

        const proposals = generateBusinessProposals(dataset, profile);

        self.postMessage({
          type: 'success',
          data: { profile, proposals },
        });
        return;
      }

      if (task === 'diff_pipeline') {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'pipeline', percent: 50, message: 'Đang tính toán kết quả thay đổi bảng kinh doanh...' },
        });

        const result = runBusinessCleanPipeline(dataset, decisions || {});

        self.postMessage({
          type: 'success',
          data: result,
        });
        return;
      }

      if (task === 'commit_clean') {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'commit', percent: 40, message: 'Đang áp dụng bộ quyết định làm sạch dữ liệu kinh doanh...' },
        });

        const result = runBusinessCleanPipeline(dataset, decisions || {});

        if (!result.valid) {
          self.postMessage({
            type: 'error',
            code: 'VALIDATION',
            message_vi: 'Không thể duyệt dữ liệu sạch do vi phạm ràng buộc sau làm sạch.',
            details: { violations: result.violations },
          });
          return;
        }

        self.postMessage({
          type: 'progress',
          progress: { stage: 'hash', percent: 80, message: 'Đang tính mã băm SHA-256 chuẩn tắc...' },
        });

        const hash = await computeBusinessCanonicalHash(result.cleanTable);
        const transferables = getBusinessTransferables(result.cleanTable);

        self.postMessage(
          {
            type: 'success',
            data: {
              cleanTable: result.cleanTable,
              cleanDataset: result.cleanTable,
              hash,
              pipelineResult: result,
            },
          },
          // @ts-expect-error Transferable transfer list
          transferables
        );
        return;
      }
    } else {
      // ==========================================
      // TRADING DATASET WORKER TASKS
      // ==========================================
      const raw = dataset as RawDataset;

      if (task === 'profile_and_proposals') {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'profiling', percent: 30, message: 'Đang lập hồ sơ dữ liệu...' },
        });

        const profile = calculateProfile(raw);

        self.postMessage({
          type: 'progress',
          progress: { stage: 'proposals', percent: 70, message: 'Đang tạo danh mục đề xuất làm sạch...' },
        });

        const proposals = generateProposals(raw, profile);

        self.postMessage({
          type: 'success',
          data: { profile, proposals },
        });
        return;
      }

      if (task === 'diff_pipeline') {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'pipeline', percent: 50, message: 'Đang tính toán kết quả thay đổi...' },
        });

        const result = runCleaningPipeline(raw, decisions || {}, options);

        self.postMessage({
          type: 'success',
          data: result,
        });
        return;
      }

      if (task === 'commit_clean') {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'commit', percent: 40, message: 'Đang áp dụng bộ quyết định làm sạch...' },
        });

        const result = runCleaningPipeline(raw, decisions || {}, options);

        if (!result.valid) {
          self.postMessage({
            type: 'error',
            code: 'VALIDATION',
            message_vi: 'Không thể duyệt dữ liệu sạch do vi phạm ràng buộc sau làm sạch.',
            details: { violations: result.violations },
          });
          return;
        }

        self.postMessage({
          type: 'progress',
          progress: { stage: 'hash', percent: 80, message: 'Đang tính mã băm SHA-256 chuẩn tắc...' },
        });

        const hash = await computeCanonicalCleanHash(result.cleanDataset);
        const transferableBuffers = getTransferableBuffers(result.cleanDataset);

        self.postMessage(
          {
            type: 'success',
            data: {
              cleanDataset: result.cleanDataset,
              outlierFlags: result.outlierFlags,
              hash,
              pipelineResult: result,
            },
          },
          // @ts-expect-error Transferable transfer list
          transferableBuffers
        );
        return;
      }
    }

    throw new Error(`Tác vụ không xác định: ${task}`);
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      code: 'INTERNAL',
      message_vi: err?.message || 'Lỗi không xác định khi xử lý trong Worker làm sạch.',
      details: { stack: err?.stack },
    });
  }
};
