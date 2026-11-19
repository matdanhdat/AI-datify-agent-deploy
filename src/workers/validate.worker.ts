/**
 * Web Worker for running file validation off the main UI thread.
 * Uses transferables for zero-copy ArrayBuffer return.
 */
import { getTransferableBuffers } from '../core/dataset';
import { validateBytes, type ValidationHooks } from '../core/validator';
import type { ValidatorLimits } from '../core/validator/schemaSpec';

export interface ValidateWorkerInput {
  filename: string;
  bytes: Uint8Array;
  limits?: ValidatorLimits;
}

self.onmessage = async (event: MessageEvent<ValidateWorkerInput>) => {
  const { filename, bytes, limits } = event.data;

  try {
    const hooks: ValidationHooks = {
      onProgress: (p) => {
        self.postMessage({ type: 'progress', progress: p });
      },
    };

    const outcome = await validateBytes(filename, bytes, limits, hooks);

    if (outcome.ok) {
      if (outcome.dataset) {
        const transferables = getTransferableBuffers(outcome.dataset);
        // Post success with transferable ArrayBuffers for zero-copy transfer
        // @ts-expect-error Web Worker postMessage transferable signature
        self.postMessage({ type: 'success', data: outcome }, transferables);
      } else if (outcome.businessTable) {
        const transferables: Transferable[] = [];
        if (outcome.businessTable.source_row?.buffer) {
          transferables.push(outcome.businessTable.source_row.buffer);
        }
        for (const col of outcome.businessTable.columns) {
          if ('values' in col && col.values && typeof col.values === 'object' && 'buffer' in col.values) {
            transferables.push((col.values as any).buffer);
          }
          if ('codes' in col && col.codes?.buffer) {
            transferables.push(col.codes.buffer);
          }
        }
        // @ts-expect-error Web Worker postMessage transferable signature
        self.postMessage({ type: 'success', data: outcome }, transferables);
      } else {
        self.postMessage({ type: 'success', data: outcome });
      }
    } else {
      self.postMessage({ type: 'success', data: outcome });
    }
  } catch (err: any) {
    if (err.message === 'VALIDATION_ABORTED') {
      self.postMessage({
        type: 'error',
        code: 'INTERNAL',
        message_vi: 'Tác vụ kiểm tra tệp đã bị hủy.',
      });
      return;
    }

    self.postMessage({
      type: 'error',
      code: 'INTERNAL',
      message_vi:
        err instanceof Error
          ? `Lỗi khi xử lý tệp: ${err.message}`
          : 'Không thể đọc hoặc xử lý tệp dữ liệu.',
      details: { raw: String(err) },
    });
  }
};

