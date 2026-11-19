import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, toAppError } from './errors';

describe('AppError & Error Sanitization', () => {
  it('instantiates AppError with code, message_vi, details, and status', () => {
    const err = new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiên', { id: '123' }, 404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message_vi).toBe('Không tìm thấy phiên');
    expect(err.details).toEqual({ id: '123' });
    expect(err.status).toBe(404);
    expect(err.toResponse()).toEqual({
      code: 'NOT_FOUND',
      message_vi: 'Không tìm thấy phiên',
      details: { id: '123' },
    });
  });

  it('toAppError preserves existing AppError instances', () => {
    const custom = new AppError('CUSTOM_CODE', 'Lỗi tùy chỉnh', { key: 'val' }, 422);
    const converted = toAppError(custom);
    expect(converted).toBe(custom);
    expect(converted.code).toBe('CUSTOM_CODE');
  });

  it('toAppError wraps unexpected exceptions into INTERNAL without exposing stack traces', () => {
    const rawError = new Error('Database connection failed at /var/secrets/key.db:12');
    const converted = toAppError(rawError);

    expect(converted.code).toBe(ERROR_CODES.INTERNAL);
    expect(converted.status).toBe(500);
    // User message is friendly and does not reveal internal filepaths or sensitive stack details
    expect(converted.message_vi).toContain('Đã xảy ra sự cố');
    expect(converted.details).toEqual({});
  });
});

