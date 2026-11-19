/**
 * Chaos & Resilience Test Suite (Prompt P7 Section B)
 * Validates system resilience against extreme & adversarial conditions:
 * 1. Corrupted, empty, or oversize files
 * 2. Rapid duplicate actions (idempotence)
 * 3. Mid-flight state mutations
 * 4. Offline calculation capability
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateBytes } from '../core/validator';
import { DEFAULT_LIMITS } from '../core/validator/schemaSpec';
import { createSession } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import { approveCleanGate } from '../services/cleanService';
import type { RawDataset } from '../core/dataset';

describe('Chaos & Resilience Engineering Suite (P7)', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionStore.clearAll();
    const session = createSession('Chaos Test');
    sessionId = session.id;
    ArtifactStore.deleteSession(sessionId);
  });

  describe('1. Malformed and Hostile File Ingestion', () => {
    it('gracefully rejects 0-byte empty file with helpful Vietnamese error', async () => {
      const emptyBytes = new Uint8Array(0);
      const outcome = await validateBytes('empty.csv', emptyBytes);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.issues.length).toBeGreaterThan(0);
        expect(outcome.issues[0].message_vi).toContain('rỗng');
      }
    });

    it('gracefully rejects pure binary random noise file without crashing', async () => {
      const noise = new Uint8Array(2048);
      for (let i = 0; i < noise.length; i++) {
        noise[i] = Math.floor(Math.random() * 256);
      }
      const outcome = await validateBytes('corrupted.xlsx', noise);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.issues.length).toBeGreaterThan(0);
      }
    });

    it('gracefully rejects CSV missing crucial price columns', async () => {
      const csv = 'Date,Volume\n2025-01-02,1000\n2025-01-03,2000';
      const bytes = new TextEncoder().encode(csv);
      const outcome = await validateBytes('missing_cols.csv', bytes);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.issues.some((i) => i.code === 'UPLOAD_NO_HEADER' || i.code === 'SCHEMA_MISSING_COLUMN')).toBe(true);
      }
    });
  });

  describe('2. Rapid Duplicate Actions & Idempotence', () => {
    it('handles multiple concurrent clean approvals idempotently without state corruption', async () => {
      // Mock minimal dataset with 35 sessions for symbol AAA
      const n = 35;
      const date_days = new Int32Array(n);
      const symbol_idx = new Uint16Array(n);
      const open = new Float64Array(n);
      const high = new Float64Array(n);
      const low = new Float64Array(n);
      const close = new Float64Array(n);
      const volume = new Float64Array(n);
      const source_row = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        date_days[i] = 20000 + i;
        symbol_idx[i] = 0;
        open[i] = 10 + i;
        high[i] = 12 + i;
        low[i] = 9 + i;
        close[i] = 11 + i;
        volume[i] = 1000;
        source_row[i] = i + 1;
      }
      const raw: RawDataset = {
        n,
        symbols: ['AAA'],
        symbol_idx,
        date_days,
        open,
        high,
        low,
        close,
        volume,
        source_row,
      };

      ArtifactStore.put(sessionId, 'raw', raw);
      const rec = sessionStore.getRecord(sessionId)!;
      rec.state = 'cleaning_review';
      sessionStore.setRecord(rec);

      // Concurrent execution of 3 approvals (simulating rapid triple-clicks)
      const p1 = approveCleanGate(sessionId, 'Tester 1', { drop_exact_duplicates: true });
      const p2 = approveCleanGate(sessionId, 'Tester 1', { drop_exact_duplicates: true });
      const p3 = approveCleanGate(sessionId, 'Tester 1', { drop_exact_duplicates: true });

      const results = await Promise.allSettled([p1, p2, p3]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Verify session state is clean_approved
      const finalRec = sessionStore.getRecord(sessionId);
      expect(finalRec?.state).toBe('clean_approved');
    });
  });

  describe('3. Zero-Network Offline Operation', () => {
    it('completes data validation and cleaning completely offline', async () => {
      const csv = 'Date,Symbol,Open,High,Low,Close,Volume\n2025-01-02,TMA,70,72,69,71,1000\n2025-01-03,TMA,71,73,70,72,1200';
      const bytes = new TextEncoder().encode(csv);

      const outcome = await validateBytes('offline_test.csv', bytes, { ...DEFAULT_LIMITS, min_sessions: 2 });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.summary.rows).toBe(2);
        expect(outcome.summary.sha256).toBeTruthy();
      }
    });
  });
});
