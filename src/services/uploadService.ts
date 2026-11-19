/**
 * Upload service bridging UI, Web Worker, and Session state.
 * Manages client-side validation, rejection logging, error CSV generation,
 * and atomic session updates.
 */

import { ArtifactStore } from '../core/artifacts';
import { appendLog } from '../core/audit';
import { AppError, ERROR_CODES } from '../core/errors';
import type { ValidationIssue } from '../core/schemas';
import {
  validateBytes,
  type ValidationOutcome,
  type ValidationProgress,
} from '../core/validator';
import {
  DEFAULT_LIMITS,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  type ValidatorLimits,
} from '../core/validator/schemaSpec';
import { APP_CONFIG_DEFAULTS } from './appConfig';
import { dispatch } from './sessionService';
import { sessionStore } from './sessionStore';

export interface PrecheckResult {
  ok: boolean;
  error?: ValidationIssue;
}

/**
 * 7.1 Synchronously pre-checks uploaded files before reading bytes (< 10ms).
 */
export function precheckFile(
  files: FileList | File[] | null | undefined,
  limits: ValidatorLimits = DEFAULT_LIMITS
): PrecheckResult {
  if (!files || files.length === 0) {
    return {
      ok: false,
      error: {
        code: 'FILE_EMPTY',
        severity: 'error',
        message_vi: 'Vui lòng chọn hoặc kéo thả một tệp dữ liệu.',
        fix_vi: 'Kéo thả một tệp .xlsx hoặc .csv vào khung tải lên.',
      },
    };
  }

  if (files.length > 1) {
    return {
      ok: false,
      error: {
        code: 'FILE_MULTIPLE',
        severity: 'error',
        message_vi: 'Chỉ chấp nhận duy nhất 1 tệp dữ liệu cho mỗi lần nạp.',
        fix_vi: 'Vui lòng chỉ chọn 1 tệp duy nhất thay vì nhiều tệp cùng lúc.',
      },
    };
  }

  const file = files[0];
  const lastDot = file.name.lastIndexOf('.');
  const ext = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : '';

  if (ext !== '.xlsx' && ext !== '.csv') {
    return {
      ok: false,
      error: {
        code: 'FILE_EXT_INVALID',
        severity: 'error',
        message_vi: `Định dạng tệp '${ext || 'không rõ'}' không được hỗ trợ.`,
        fix_vi: 'Vui lòng chỉ sử dụng tệp có phần mở rộng .xlsx hoặc .csv.',
      },
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: {
        code: 'FILE_EMPTY',
        severity: 'error',
        message_vi: 'Tệp tải lên rỗng (0 bytes).',
        fix_vi: 'Kiểm tra lại tệp nguồn và chọn tệp có chứa dữ liệu giao dịch.',
      },
    };
  }

  const maxBytes = limits.max_file_mb * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: {
        code: 'FILE_TOO_LARGE',
        severity: 'error',
        message_vi: `Kích thước tệp (${sizeMb} MB) vượt quá giới hạn cho phép (${limits.max_file_mb} MB).`,
        fix_vi: `Giảm bớt số lượng dòng hoặc nén nhỏ hơn ${limits.max_file_mb} MB trước khi nạp.`,
      },
    };
  }

  return { ok: true };
}

/**
 * Executes validation in a Web Worker (or in-thread fallback in tests).
 */
export async function runValidationWorker(
  filename: string,
  bytes: Uint8Array,
  limits: ValidatorLimits,
  onProgress?: (progress: ValidationProgress) => void,
  signal?: AbortSignal
): Promise<ValidationOutcome> {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return new Promise((resolve, reject) => {
      let worker: Worker | null = null;
      try {
        worker = new Worker(
          new URL('../workers/validate.worker.ts', import.meta.url),
          { type: 'module' }
        );
      } catch {
        // Fallback to in-thread validation if worker creation fails
        validateBytes(filename, bytes, limits, { onProgress, signal }).then(
          resolve,
          reject
        );
        return;
      }

      const cleanup = () => {
        if (worker) {
          worker.terminate();
          worker = null;
        }
      };

      if (signal) {
        if (signal.aborted) {
          cleanup();
          reject(new Error('VALIDATION_ABORTED'));
          return;
        }
        signal.addEventListener('abort', () => {
          cleanup();
          reject(new Error('VALIDATION_ABORTED'));
        });
      }

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          onProgress?.(msg.progress);
        } else if (msg.type === 'success') {
          cleanup();
          resolve(msg.data);
        } else if (msg.type === 'error') {
          cleanup();
          reject(new Error(msg.message_vi || 'Lỗi khi xử lý tệp'));
        }
      };

      worker.onerror = (err) => {
        cleanup();
        reject(err);
      };

      // Pass ArrayBuffer as transferable for zero-copy memory handover
      worker.postMessage({ filename, bytes, limits }, [bytes.buffer]);
    });
  }

  // Fallback for Node.js / unit test environments without Worker
  return validateBytes(filename, bytes, limits, { onProgress, signal });
}

export interface UploadOptions {
  onProgress?: (p: ValidationProgress) => void;
  signal?: AbortSignal;
  limits?: ValidatorLimits;
}

/**
 * Reads raw bytes from File / Blob safely across browser, worker, and Node/jsdom test environments.
 */
async function readFileBytes(file: File | Blob): Promise<Uint8Array> {
  if (typeof (file as any).arrayBuffer === 'function') {
    const ab = await (file as any).arrayBuffer();
    return new Uint8Array(ab);
  }
  if ((file as any) instanceof Uint8Array) {
    return file as any;
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      };
      reader.onerror = () => reject(reader.error || new Error('Không thể đọc tệp.'));
      reader.readAsArrayBuffer(file);
    });
  }
  return new Uint8Array((file as any).buffer || []);
}

/**
 * 7.2 Main upload orchestration. Reads bytes, runs validation in worker,
 * commits atomically on success, or logs rejection on failure.
 */
export async function runUpload(
  sessionId: string,
  file: File,
  options?: UploadOptions
): Promise<ValidationOutcome> {
  const limits: ValidatorLimits = {
    ...DEFAULT_LIMITS,
    max_file_mb: APP_CONFIG_DEFAULTS.maxFileMb,
    max_rows: APP_CONFIG_DEFAULTS.maxRows,
    max_symbols: APP_CONFIG_DEFAULTS.maxSymbols,
    min_sessions: APP_CONFIG_DEFAULTS.minSessions,
    ...options?.limits,
  };

  // Immediate Context Requirement Check (Prompt D3)
  const sessionRecord = sessionStore.getRecord(sessionId);
  const context = sessionRecord?.meta?.business_context;
  if (!context || !context.analysis_questions || context.analysis_questions.length === 0) {
    throw new AppError(
      ERROR_CODES.CONTEXT_REQUIRED,
      'Bạn cần nhập ít nhất một yêu cầu phân tích để Agent biết cần trả lời điều gì.',
      {},
      400
    );
  }

  // Synchronous precheck first
  const pre = precheckFile([file], limits);
  if (!pre.ok && pre.error) {
    const outcome: ValidationOutcome = {
      ok: false,
      filename: file.name,
      issues: [pre.error],
      total_errors: pre.error.severity === 'error' ? 1 : 0,
      total_warnings: pre.error.severity === 'warning' ? 1 : 0,
      truncated: false,
    };
    recordRejection(sessionId, outcome);
    return outcome;
  }

  // Read raw bytes from File
  const bytes = await readFileBytes(file);

  // Run validation off the main thread
  const outcome = await runValidationWorker(
    file.name,
    bytes,
    limits,
    options?.onProgress,
    options?.signal
  );

  if (outcome.ok) {
    // 1. Commit raw dataset or business table to ArtifactStore
    if (outcome.businessTable) {
      ArtifactStore.put(sessionId, 'raw', outcome.businessTable);
    } else if (outcome.dataset) {
      ArtifactStore.put(sessionId, 'raw', outcome.dataset);
    }

    // 2. Update session record meta
    const record = sessionStore.getRecord(sessionId);
    if (record) {
      record.meta.dataset = outcome.meta;
      record.meta.last_rejection = null;
      sessionStore.setRecord(record);
    }

    // 3. Transition state to 'uploaded' via dispatch (creates transition:upload_ok audit log)
    const detailMsg = outcome.meta.kind === 'business'
      ? `Nạp bảng kinh doanh ${file.name} thành công (${outcome.meta.rows.toLocaleString('vi-VN')} dòng, ${outcome.meta.n_columns || 0} cột)`
      : `Nạp tệp ${file.name} thành công (${outcome.meta.rows.toLocaleString('vi-VN')} dòng, ${outcome.meta.symbols.length} mã)`;
    dispatch(sessionId, 'upload_ok', 'user', detailMsg, outcome.meta.sha256);

    // 4. Also append upload_accepted audit log
    const updatedRecord = sessionStore.getRecord(sessionId);
    if (updatedRecord) {
      const newLog = appendLog(updatedRecord.log, {
        step: 'uploaded',
        actor: 'system',
        action: 'upload_accepted',
        detail: `Tệp ${file.name} được chấp nhận với băm SHA-256: ${outcome.meta.sha256}`,
        data_hash: outcome.meta.sha256,
      });
      sessionStore.setRecord({
        ...updatedRecord,
        log: newLog,
      });
    }
  } else {
    // Rejection: preserves existing state & data atomically
    recordRejection(sessionId, outcome);
  }

  return outcome;
}

/**
 * 7.3 Records rejection in session metadata and audit log without state change.
 */
export function recordRejection(
  sessionId: string,
  outcome: ValidationOutcome & { ok: false }
): void {
  const record = sessionStore.getRecord(sessionId);
  if (!record) return;

  const errorIssues = outcome.issues.filter((i) => i.severity === 'error');
  const errorCount = outcome.total_errors ?? errorIssues.length;
  const warnCount = outcome.total_warnings ?? outcome.issues.filter((i) => i.severity === 'warning').length;

  // Aggregate all error codes with their counts
  const errorCounts: Record<string, number> = {};
  for (const issue of errorIssues) {
    const c = issue.code || 'UNKNOWN';
    errorCounts[c] = (errorCounts[c] || 0) + (issue.count || 1);
  }
  const codeSummary = Object.entries(errorCounts)
    .map(([c, count]) => `${c}: ${count}`)
    .join(', ');

  const detailMsg = `Từ chối tệp (${outcome.filename}): ${errorCount} lỗi, ${warnCount} cảnh báo. Danh mục lỗi: ${codeSummary || 'Không xác định'}`;

  const updatedLog = appendLog(record.log, {
    step: record.state,
    actor: 'system',
    action: 'upload_rejected',
    detail: detailMsg,
  });

  const updatedRecord = {
    ...record,
    meta: {
      ...record.meta,
      last_rejection: outcome,
    },
    log: updatedLog,
  };

  sessionStore.setRecord(updatedRecord);
}

/**
 * Neutralizes Excel formula injection characters (=, +, -, @).
 */
function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);

  // If cell starts with formula trigger characters, prefix with single quote '
  if (/^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }

  // Escape inner double quotes
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * 7.4 Generates an RFC 4180 CSV report of validation errors with UTF-8 BOM
 * and Formula Injection Defense.
 */
export function buildErrorCsv(
  rejection: ValidationOutcome & { ok: false }
): string {
  const headers = [
    'Ma_Loi',
    'Muc_Do',
    'Sheet',
    'Dong',
    'Cot',
    'Gia_Tri_Loi',
    'Thong_Bao',
    'Cach_Khac_Phuc',
  ];

  const lines: string[] = [];
  // UTF-8 BOM
  lines.push(headers.map((h) => `"${h}"`).join(','));

  for (const issue of rejection.issues) {
    const rowNum =
      issue.row !== undefined && issue.row !== null ? String(issue.row) : '';
    const val =
      issue.value !== undefined && issue.value !== null ? issue.value : '';

    const rowCells = [
      sanitizeCsvCell(issue.code),
      sanitizeCsvCell(issue.severity),
      sanitizeCsvCell(issue.sheet || ''),
      sanitizeCsvCell(rowNum),
      sanitizeCsvCell(issue.column || ''),
      sanitizeCsvCell(val),
      sanitizeCsvCell(issue.message_vi),
      sanitizeCsvCell(issue.fix_vi),
    ];
    lines.push(rowCells.join(','));
  }

  if (rejection.truncated) {
    const truncatedNotice = [
      sanitizeCsvCell('...'),
      sanitizeCsvCell('warning'),
      sanitizeCsvCell(''),
      sanitizeCsvCell(''),
      sanitizeCsvCell(''),
      sanitizeCsvCell(''),
      sanitizeCsvCell(
        'Danh sách lỗi vượt quá giới hạn hiển thị (500 lỗi) và đã được rút gọn.'
      ),
      sanitizeCsvCell('Vui lòng khắc phục các lỗi đầu tiên trong tệp nguồn.'),
    ];
    lines.push(truncatedNotice.join(','));
  }

  // Prepend UTF-8 BOM
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 7.5 Exposes schema requirements and validation limits for UI rendering.
 */
export function getSchemaInfo(limits: ValidatorLimits = DEFAULT_LIMITS) {
  return {
    requiredColumns: REQUIRED_COLUMNS,
    optionalColumns: OPTIONAL_COLUMNS,
    limits: {
      max_file_mb: limits.max_file_mb,
      max_rows: limits.max_rows,
      max_symbols: limits.max_symbols,
      min_sessions: limits.min_sessions,
    },
  };
}
