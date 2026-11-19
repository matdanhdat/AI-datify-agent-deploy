import { describe, expect, it } from 'vitest';
import { appendLog } from './audit';
import type { AuditEntry } from './schemas';

describe('Audit Trail Immutability & Logging', () => {
  it('appends entries with auto-incremented ID and ISO UTC timestamps', () => {
    let log: readonly AuditEntry[] = [];

    log = appendLog(log, {
      step: 'upload',
      actor: 'user',
      action: 'upload_file',
      detail: 'Tải lên tệp sample.csv',
      data_hash: 'hash123',
    });

    expect(log.length).toBe(1);
    expect(log[0].id).toBe(1);
    expect(log[0].step).toBe('upload');
    expect(log[0].actor).toBe('user');
    expect(log[0].action).toBe('upload_file');
    expect(log[0].data_hash).toBe('hash123');
    expect(new Date(log[0].ts).getTime()).not.toBeNaN();

    log = appendLog(log, {
      step: 'clean',
      actor: 'ai',
      action: 'generate_proposals',
      detail: 'Tạo 3 đề xuất làm sạch',
    });

    expect(log.length).toBe(2);
    expect(log[1].id).toBe(2);
    expect(log[1].actor).toBe('ai');
  });

  it('guarantees immutability via Object.freeze', () => {
    const initialLog: readonly AuditEntry[] = [];
    const log1 = appendLog(initialLog, {
      step: 'upload',
      actor: 'system',
      action: 'init',
      detail: 'Khởi tạo',
    });

    // Attempting to modify frozen entry should fail in strict mode
    expect(() => {
      (log1[0] as any).action = 'tampered';
    }).toThrow();

    expect(() => {
      (log1 as any).push({
        id: 99,
        ts: '',
        step: '',
        actor: 'user',
        action: '',
        detail: '',
      });
    }).toThrow();
  });
});
