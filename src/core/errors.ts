import type { ErrorResponse } from './schemas';

/**
 * Standard system error codes for Datify AI Agent.
 * Preserves all P0 codes and adds LLM_* gateway error codes.
 */
export const ERROR_CODES = {
  // Upload and file verification
  UPLOAD_FILE_TOO_LARGE: 'UPLOAD_FILE_TOO_LARGE',
  UPLOAD_INVALID_EXT: 'UPLOAD_INVALID_EXT',
  UPLOAD_EMPTY: 'UPLOAD_EMPTY',

  // Spreadsheet schema and columns
  SCHEMA_MISSING_COLUMN: 'SCHEMA_MISSING_COLUMN',
  SCHEMA_EXTRA_COLUMN: 'SCHEMA_EXTRA_COLUMN',
  SCHEMA_INVALID_TYPE: 'SCHEMA_INVALID_TYPE',

  // Data content validation
  DATA_BAD_NUMBER: 'DATA_BAD_NUMBER',
  DATA_BAD_DATE: 'DATA_BAD_DATE',
  DATA_EMPTY: 'DATA_EMPTY',
  DATA_INSUFFICIENT_ROWS: 'DATA_INSUFFICIENT_ROWS',
  DATA_TOO_FEW_ROWS: 'DATA_TOO_FEW_ROWS',

  // Business profile & context errors (Prompt D3 & M1)
  CONTEXT_REQUIRED: 'CONTEXT_REQUIRED',
  SCHEMA_PROFILE_UNKNOWN: 'SCHEMA_PROFILE_UNKNOWN',
  SCHEMA_NO_MEASURE_COLUMN: 'SCHEMA_NO_MEASURE_COLUMN',
  SCHEMA_NO_DIMENSION_COLUMN: 'SCHEMA_NO_DIMENSION_COLUMN',
  SCHEMA_TOO_MANY_COLUMNS: 'SCHEMA_TOO_MANY_COLUMNS',

  // State machine & Access control
  STATE_INVALID: 'STATE_INVALID',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  INTERNAL: 'INTERNAL',
  WORKER_TIMEOUT: 'WORKER_TIMEOUT',

  // AI Gateway (Section 7.5)
  LLM_NOT_CONFIGURED: 'LLM_NOT_CONFIGURED',
  LLM_RATE_LIMITED: 'LLM_RATE_LIMITED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_UPSTREAM_ERROR: 'LLM_UPSTREAM_ERROR',
  LLM_BAD_OUTPUT: 'LLM_BAD_OUTPUT',
  LLM_PAYLOAD_TOO_LARGE: 'LLM_PAYLOAD_TOO_LARGE',
  LLM_UNKNOWN_TASK: 'LLM_UNKNOWN_TASK',
  LLM_BAD_INPUT: 'LLM_BAD_INPUT',
  LLM_MODEL_UNAVAILABLE: 'LLM_MODEL_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

export class AppError extends Error {
  public readonly code: string;
  public readonly message_vi: string;
  public readonly details: Record<string, unknown>;
  public readonly status: number;

  constructor(
    code: string,
    message_vi: string,
    details: Record<string, unknown> = {},
    status: number = 400
  ) {
    super(message_vi);
    this.name = 'AppError';
    this.code = code;
    this.message_vi = message_vi;
    this.details = details;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toResponse(): ErrorResponse {
    return {
      code: this.code,
      message_vi: this.message_vi,
      details: this.details,
    };
  }
}

/**
 * Safely converts any unknown caught error into a well-typed AppError.
 * Unexpected internal errors hide stack traces from users.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  // Log full technical trace in developer console only
  console.error('[AppError Caught]', err);

  const fallbackMessage =
    err instanceof Error && err.message
      ? `Đã xảy ra sự cố: ${err.message}`
      : 'Đã xảy ra sự cố nội bộ. Vui lòng thử lại sau.';

  return new AppError(
    ERROR_CODES.INTERNAL,
    fallbackMessage,
    {},
    500
  );
}

/**
 * Registers global unhandled error and rejection listeners.
 */
export function setupGlobalErrorHandlers(
  onToast: (toast: { title: string; message: string; type: 'error' }) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const errorHandler = (event: ErrorEvent) => {
    event.preventDefault();
    const appErr = toAppError(event.error || event.message);
    onToast({
      title: 'Lỗi giao diện',
      message: appErr.message_vi,
      type: 'error',
    });
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    const appErr = toAppError(event.reason);
    onToast({
      title: 'Lỗi bất đồng bộ',
      message: appErr.message_vi,
      type: 'error',
    });
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
}

