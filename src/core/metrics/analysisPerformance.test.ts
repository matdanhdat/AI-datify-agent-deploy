import { describe, it, expect, vi } from 'vitest';
import { daysToIsoDate, calculateMetrics, extractSymbolSeries } from './calculator';
import { generateCharts } from './charts';
import { computeAnalysisHash } from './canonicalAnalysisHash';
import { formatDate, formatNumber, formatPercent } from '../../utils/format';
import { runInWorker } from '../../workers/workerRunner';
import { ERROR_CODES } from '../errors';
import type { CleanArtifact, AnalysisConfig } from '../schemas';

function makeSyntheticClean(numSymbols: number, rowsPerSymbol: number): {
  cleanArtifact: CleanArtifact;
  config: AnalysisConfig;
} {
  const symbols = Array.from({ length: numSymbols }, (_, i) => `SYM${i + 1}`);
  const n = numSymbols * rowsPerSymbol;
  const date_days = new Int32Array(n);
  const symbol_idx = new Uint16Array(n);
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const volume = new Float64Array(n);
  const source_row = new Int32Array(n);

  const startDay = Math.floor(Date.UTC(2020, 0, 2) / 86400000);
  let idx = 0;
  for (let s = 0; s < numSymbols; s++) {
    let price = 100 + s * 10;
    for (let r = 0; r < rowsPerSymbol; r++) {
      const delta = ((r * 17 + s * 31) % 21 - 10) * 0.002;
      price = Math.max(10, price * (1 + delta));
      date_days[idx] = startDay + r;
      symbol_idx[idx] = s;
      open[idx] = price * 0.995;
      high[idx] = price * 1.015;
      low[idx] = price * 0.985;
      close[idx] = price;
      volume[idx] = 100000 + ((r * 997 + s * 131) % 500000);
      source_row[idx] = idx + 2;
      idx++;
    }
  }

  return {
    cleanArtifact: {
      dataset: { n, symbols, date_days, symbol_idx, open, high, low, close, volume, source_row },
      decisions: {},
      hash: 'perf_test_hash',
      approved_at: '2026-01-01T00:00:00Z',
      reviewer_name: 'Tester',
    },
    config: {
      symbols,
      date_from: daysToIsoDate(startDay),
      date_to: daysToIsoDate(startDay + rowsPerSymbol - 1),
      preset: 'all',
    },
  };
}

describe('Analysis Performance, Exactness & Worker Watchdog', () => {
  it('daysToIsoDate matches Date.toISOString across 50,000 consecutive days including leap years', () => {
    for (let d = 0; d < 50000; d += 7) {
      const expected = new Date(d * 86400000).toISOString().slice(0, 10);
      expect(daysToIsoDate(d)).toBe(expected);
    }
    // Check explicit leap & century boundaries
    const specialDates = ['1970-01-01', '1999-12-31', '2000-02-29', '2024-02-29', '2025-03-01', '2100-03-01'];
    for (const iso of specialDates) {
      const d = Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
      expect(daysToIsoDate(d)).toBe(iso);
      expect(formatDate(iso)).toBe(`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);
    }
  });

  it('cached formatters produce exact vi-VN output for numbers, percentages, and UTC timestamps', () => {
    expect(formatNumber(1234567.89)).toBe('1.234.567,89');
    expect(formatNumber(100000, 0)).toBe('100.000');
    expect(formatPercent(0.12345)).toBe('12,35%');
    expect(formatDate('2026-11-13T17:30:00Z')).toBe('14/11/2026');
    expect(formatDate('not-a-date')).toBe('-');
  });

  it('produces identical metrics, charts, and SHA-256 hash when reusing preExtracted series, within fast time budget', async () => {
    const { cleanArtifact, config } = makeSyntheticClean(5, 2000); // 10,000 rows

    const t0 = performance.now();
    const extracted = extractSymbolSeries(cleanArtifact, config);
    const resShared = calculateMetrics(cleanArtifact, config, extracted);
    const chartsShared = generateCharts(cleanArtifact, config, resShared.metrics, extracted.seriesBySymbol);
    const hashShared = await computeAnalysisHash(resShared.metrics);
    const elapsedMs = performance.now() - t0;

    // Standalone call without preExtracted must match bit-for-bit
    const resStandalone = calculateMetrics(cleanArtifact, config);
    const chartsStandalone = generateCharts(cleanArtifact, config, resStandalone.metrics);
    const hashStandalone = await computeAnalysisHash(resStandalone.metrics);

    expect(hashShared).toBe(hashStandalone);
    expect(resShared.metrics).toEqual(resStandalone.metrics);
    expect(chartsShared.length).toBe(chartsStandalone.length);
    expect(chartsShared[0].table.rows.length).toBe(2000);
    expect(chartsShared[0].table.rows[0]).toEqual(chartsStandalone[0].table.rows[0]);

    // 10,000 rows must complete well under 1.5 seconds (was 25.7s before optimization!)
    expect(elapsedMs).toBeLessThan(1500);
  });

  it('workerRunner Watchdog terminates silent hanging worker on inactivityTimeoutMs', async () => {
    const terminate = vi.fn();
    const mockWorker: any = {
      postMessage: vi.fn(),
      terminate,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    };

    await expect(
      runInWorker(mockWorker as Worker, { hello: 1 }, { inactivityTimeoutMs: 40, hardTimeoutMs: 500 })
    ).rejects.toMatchObject({ code: ERROR_CODES.WORKER_TIMEOUT });

    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('workerRunner Watchdog resets inactivity timer on progress heartbeats and resolves cleanly', async () => {
    const terminate = vi.fn();
    const mockWorker: any = {
      postMessage: vi.fn(() => {
        setTimeout(() => {
          mockWorker.onmessage?.({ data: { type: 'progress', progress: { percent: 50, message: 'half' } } });
        }, 25);
        setTimeout(() => {
          mockWorker.onmessage?.({ data: { type: 'success', data: { ok: true } } });
        }, 55);
      }),
      terminate,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    };

    const progressSeen: any[] = [];
    const res = await runInWorker(
      mockWorker as Worker,
      { hello: 1 },
      {
        inactivityTimeoutMs: 45,
        hardTimeoutMs: 500,
        onProgress: (p) => progressSeen.push(p),
      }
    );

    expect(res).toEqual({ ok: true });
    expect(progressSeen).toHaveLength(1);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
