import { AppError, ERROR_CODES } from '../core/errors';

export interface WorkerRunnerOptions<TProgress> {
  onProgress?: (progress: TProgress) => void;
  signal?: AbortSignal;
  /** Max milliseconds without any heartbeat/progress message before terminating worker (default: 15,000ms). */
  inactivityTimeoutMs?: number;
  /** Absolute max milliseconds for the entire worker run (default: 30,000ms). */
  hardTimeoutMs?: number;
  /** Optional non-sensitive metadata for diagnostic copy (stage, rows). Never contains raw data. */
  diagnosticMeta?: {
    stage?: string;
    rows?: number;
  };
}

export const WORKER_TIMEOUT_MESSAGE_VI =
  'Quá trình xử lý mất quá lâu và đã được dừng để bảo vệ trình duyệt. Bạn có thể thử lại, hoặc dùng file nhỏ hơn.';

/**
 * Runs a task inside a Web Worker with typed inputs, outputs, progress, cancellation,
 * and mandatory Watchdog timers (15s inactivity heartbeat + 30s hard ceiling) so UI can never hang.
 * Converts worker errors and timeouts to AppError.
 */
export function runInWorker<TInput, TOutput, TProgress = unknown>(
  worker: Worker,
  input: TInput,
  options: WorkerRunnerOptions<TProgress> = {}
): Promise<TOutput> {
  return new Promise<TOutput>((resolve, reject) => {
    const {
      onProgress,
      signal,
      inactivityTimeoutMs = 15000,
      hardTimeoutMs = 30000,
      diagnosticMeta,
    } = options;

    let settled = false;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let lastStage = diagnosticMeta?.stage || 'init';
    const startTime = Date.now();

    const cleanup = () => {
      settled = true;
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      try {
        worker.terminate();
      } catch {
        // Ignore terminate error if already closed
      }
    };

    const abortHandler = () => {
      if (settled) return;
      cleanup();
      reject(
        new AppError(
          ERROR_CODES.INTERNAL,
          'Tác vụ nền trong Web Worker đã bị hủy.',
          { reason: 'aborted' },
          499
        )
      );
    };

    if (signal?.aborted) {
      cleanup();
      return reject(
        new AppError(
          ERROR_CODES.INTERNAL,
          'Tác vụ đã bị hủy trước khi bắt đầu.',
          { reason: 'aborted' },
          499
        )
      );
    }

    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    const resetInactivityTimer = () => {
      if (settled || inactivityTimeoutMs <= 0) return;
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (settled) return;
        const elapsed = Date.now() - startTime;
        cleanup();
        reject(
          new AppError(
            ERROR_CODES.WORKER_TIMEOUT,
            WORKER_TIMEOUT_MESSAGE_VI,
            {
              stage: lastStage,
              elapsed_ms: elapsed,
              rows: diagnosticMeta?.rows ?? null,
              reason: 'inactivity',
            },
            504
          )
        );
      }, inactivityTimeoutMs);
    };

    resetInactivityTimer();

    if (hardTimeoutMs > 0) {
      hardTimer = setTimeout(() => {
        if (settled) return;
        const elapsed = Date.now() - startTime;
        cleanup();
        reject(
          new AppError(
            ERROR_CODES.WORKER_TIMEOUT,
            WORKER_TIMEOUT_MESSAGE_VI,
            {
              stage: lastStage,
              elapsed_ms: elapsed,
              rows: diagnosticMeta?.rows ?? null,
              reason: 'hard_timeout',
            },
            504
          )
        );
      }, hardTimeoutMs);
    }

    worker.onmessage = (event: MessageEvent) => {
      if (settled) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'progress') {
        if (msg.progress && typeof msg.progress === 'object') {
          if (typeof msg.progress.stage === 'string') lastStage = msg.progress.stage;
          else if (typeof msg.progress.message === 'string') lastStage = msg.progress.message;
        }
        resetInactivityTimer();
        if (onProgress) {
          onProgress(msg.progress as TProgress);
        }
      } else if (msg.type === 'success') {
        cleanup();
        resolve(msg.data as TOutput);
      } else if (msg.type === 'error') {
        cleanup();
        reject(
          new AppError(
            msg.code || ERROR_CODES.INTERNAL,
            msg.message_vi || 'Đã xảy ra lỗi khi tính toán trong Web Worker.',
            msg.details || {},
            500
          )
        );
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      cleanup();
      reject(
        new AppError(
          ERROR_CODES.INTERNAL,
          `Lỗi thực thi trong Web Worker: ${err.message || 'Không thể khởi chạy tiến trình nền'}`,
          { reason: 'worker_error' },
          500
        )
      );
    };

    worker.onmessageerror = () => {
      if (settled) return;
      cleanup();
      reject(
        new AppError(
          ERROR_CODES.INTERNAL,
          'Lỗi tuần tự hóa dữ liệu khi truyền qua Web Worker.',
          { reason: 'message_error' },
          500
        )
      );
    };

    try {
      worker.postMessage(input);
    } catch (postErr: any) {
      cleanup();
      reject(
        new AppError(
          ERROR_CODES.INTERNAL,
          postErr?.message || 'Không thể gửi dữ liệu sang Web Worker.',
          { reason: 'post_message_error' },
          500
        )
      );
    }
  });
}
