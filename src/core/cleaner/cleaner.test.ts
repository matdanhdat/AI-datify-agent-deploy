import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dropExactDuplicates } from './ops/dropExactDuplicates';
import { dropRowsMissingOhlc } from './ops/dropRowsMissingOhlc';
import { fillMissingVolumeZero } from './ops/fillMissingVolumeZero';
import { flagOutliers } from './ops/flagOutliers';
import { dropFlaggedOutliers } from './ops/dropFlaggedOutliers';
import { sortBySymbolDate } from './ops/sortBySymbolDate';
import { calculateProfile } from './profile';
import { generateProposals } from './proposals';
import { runCleaningPipeline } from './pipeline';
import { computeCanonicalCleanHash } from './canonicalHash';
import { validateBytes, DEFAULT_LIMITS } from '../validator';
import type { RawDataset } from '../dataset';

function createMockDataset(rows: Array<{
  symbol: string;
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>): RawDataset {
  const n = rows.length;
  const symbols = Array.from(new Set(rows.map((r) => r.symbol)));
  const symbol_idx = new Uint16Array(n);
  const date_days = new Int32Array(n);
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const volume = new Float64Array(n);
  const source_row = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    symbol_idx[i] = symbols.indexOf(r.symbol);
    date_days[i] = r.date;
    open[i] = r.open;
    high[i] = r.high;
    low[i] = r.low;
    close[i] = r.close;
    volume[i] = r.volume;
    source_row[i] = i + 1;
  }

  return {
    n,
    symbols,
    symbol_idx,
    date_days,
    open,
    high,
    low,
    close,
    volume,
    source_row,
  };
}

describe('P3 Data Cleaning Core - Unit Tests', () => {
  it('dropExactDuplicates drops duplicate rows and preserves first occurrence', () => {
    const ds = createMockDataset([
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 }, // Exact dup
      { symbol: 'TMA', date: 101, open: 11, high: 13, low: 10, close: 12, volume: 200 },
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 }, // Another dup
    ]);

    const res = dropExactDuplicates(ds);
    expect(res.droppedIndices).toEqual([1, 3]);
    expect(res.dataset.n).toBe(2);
    expect(res.dataset.date_days[0]).toBe(100);
    expect(res.dataset.date_days[1]).toBe(101);
  });

  it('dropRowsMissingOhlc drops rows with NaN in any of open, high, low, close', () => {
    const ds = createMockDataset([
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 101, open: NaN, high: 12, low: 9, close: 11, volume: 100 }, // Missing open
      { symbol: 'TMA', date: 102, open: 10, high: NaN, low: 9, close: 11, volume: 100 }, // Missing high
      { symbol: 'TMA', date: 103, open: 10, high: 12, low: NaN, close: 11, volume: 100 }, // Missing low
      { symbol: 'TMA', date: 104, open: 10, high: 12, low: 9, close: NaN, volume: 100 }, // Missing close
      { symbol: 'TMA', date: 105, open: 10, high: 12, low: 9, close: 11, volume: NaN }, // Missing volume (kept)
    ]);

    const res = dropRowsMissingOhlc(ds);
    expect(res.droppedIndices).toEqual([1, 2, 3, 4]);
    expect(res.dataset.n).toBe(2);
    expect(res.dataset.date_days[0]).toBe(100);
    expect(res.dataset.date_days[1]).toBe(105);
  });

  it('fillMissingVolumeZero fills NaN volume cells with 0', () => {
    const ds = createMockDataset([
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 101, open: 11, high: 13, low: 10, close: 12, volume: NaN },
      { symbol: 'TMA', date: 102, open: 12, high: 14, low: 11, close: 13, volume: NaN },
    ]);

    const res = fillMissingVolumeZero(ds);
    expect(res.filledIndices).toEqual([1, 2]);
    expect(res.dataset.volume[0]).toBe(100);
    expect(res.dataset.volume[1]).toBe(0);
    expect(res.dataset.volume[2]).toBe(0);
  });

  it('flagOutliers flags price shocks meeting z > 6 and |return| > 10%', () => {
    // Generate 35 sessions with steady 0.5% drift, then inject 1 shock
    const rows = [];
    let p = 50.0;
    for (let i = 0; i < 35; i++) {
      if (i === 20) {
        p = p * 2.5; // +150% shock
      } else {
        p = p * 1.005;
      }
      rows.push({
        symbol: 'TMA',
        date: 100 + i,
        open: p,
        high: p * 1.01,
        low: p * 0.99,
        close: p,
        volume: 10000,
      });
    }

    const ds = createMockDataset(rows);
    const res = flagOutliers(ds);
    expect(res.flaggedIndices).toContain(20);
    expect(res.outlierFlags[20]).toBe(1);
    expect(res.outlierFlags[0]).toBe(0);
  });

  it('flagOutliers skips symbol series with fewer than 10 sessions', () => {
    const rows = [];
    for (let i = 0; i < 8; i++) {
      rows.push({
        symbol: 'SHORT',
        date: 100 + i,
        open: 50.0,
        high: 51.0,
        low: 49.0,
        close: i === 4 ? 150.0 : 50.0, // Spike but series < 10
        volume: 10000,
      });
    }

    const ds = createMockDataset(rows);
    const res = flagOutliers(ds);
    expect(res.flaggedIndices.length).toBe(0);
  });

  it('dropFlaggedOutliers drops flagged outlier rows', () => {
    const ds = createMockDataset([
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 101, open: 10, high: 50, low: 9, close: 45, volume: 100 }, // Outlier
      { symbol: 'TMA', date: 102, open: 11, high: 13, low: 10, close: 12, volume: 100 },
    ]);
    const flags = new Uint8Array([0, 1, 0]);

    const res = dropFlaggedOutliers(ds, flags);
    expect(res.droppedIndices).toEqual([1]);
    expect(res.dataset.n).toBe(2);
    expect(res.dataset.date_days[0]).toBe(100);
    expect(res.dataset.date_days[1]).toBe(102);
  });

  it('sortBySymbolDate stably sorts by symbol then date', () => {
    const ds = createMockDataset([
      { symbol: 'TMB', date: 105, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 110, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMB', date: 102, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    ]);

    const res = sortBySymbolDate(ds);
    expect(res.dataset.symbols[res.dataset.symbol_idx[0]]).toBe('TMA');
    expect(res.dataset.date_days[0]).toBe(100);
    expect(res.dataset.symbols[res.dataset.symbol_idx[1]]).toBe('TMA');
    expect(res.dataset.date_days[1]).toBe(110);
    expect(res.dataset.symbols[res.dataset.symbol_idx[2]]).toBe('TMB');
    expect(res.dataset.date_days[2]).toBe(102);
    expect(res.dataset.symbols[res.dataset.symbol_idx[3]]).toBe('TMB');
    expect(res.dataset.date_days[3]).toBe(105);
  });
});

describe('P3 Profiling & Proposals Generation', () => {
  it('computes accurate Profile and only generates proposals for ops with rows_affected > 0', () => {
    const ds = createMockDataset([
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { symbol: 'TMA', date: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 }, // Dup
      { symbol: 'TMA', date: 101, open: NaN, high: 12, low: 9, close: 11, volume: 100 }, // Missing open
      { symbol: 'TMA', date: 102, open: 10, high: 12, low: 9, close: 11, volume: NaN }, // Missing vol
    ]);

    const profile = calculateProfile(ds);
    expect(profile.total_rows).toBe(4);
    expect(profile.total_symbols).toBe(1);
    expect(profile.total_exact_duplicates).toBe(1);
    expect(profile.total_missing_cells).toBe(2);

    const proposals = generateProposals(ds, profile);
    const propOps = proposals.map((p) => p.op);
    expect(propOps).toContain('drop_exact_duplicates');
    expect(propOps).toContain('drop_rows_missing_ohlc');
    expect(propOps).toContain('fill_missing_volume_zero');
    // flag_outliers is not present because rows < 10
    expect(propOps).not.toContain('flag_outliers');
  });
});

describe('P3 Section 9 - Sample File Verification (file-co-loi-lam-sach.xlsx)', () => {
  it('parses file-co-loi-lam-sach.xlsx and matches expected-clean.json metrics exactly', async () => {
    const filePath = path.resolve('public/samples/file-co-loi-lam-sach.xlsx');
    const expectedPath = path.resolve('samples/expected-clean.json');

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(expectedPath)).toBe(true);

    const expectedJson = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    const fileBytes = new Uint8Array(fs.readFileSync(filePath));

    const outcome = await validateBytes('file-co-loi-lam-sach.xlsx', fileBytes, DEFAULT_LIMITS);
    if (!outcome.ok) {
      console.error('[file-co-loi-lam-sach issues]:', outcome.issues);
    }
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset).toBeDefined();

    const ds = outcome.dataset!;
    const profile = calculateProfile(ds);

    // Verify exact error counts from Section 9
    expect(profile.total_exact_duplicates).toBe(expectedJson.expected_ops.drop_exact_duplicates.affected_rows); // 6
    expect(profile.total_outliers).toBe(expectedJson.expected_ops.flag_outliers.affected_rows); // 3
    expect(profile.by_symbol['TMA'].outliers_count).toBe(1);
    expect(profile.by_symbol['TMC'].outliers_count).toBe(2);

    // Verify per-symbol breakdown matches independent counter in expected-clean.json
    for (const sym of ['TMA', 'TMB', 'TMC']) {
      const exp = expectedJson.by_symbol[sym];
      const pSym = profile.by_symbol[sym];
      expect(pSym.rows).toBe(exp.raw_rows);
      expect(pSym.unique_dates).toBe(exp.unique_dates);
      expect(pSym.outliers_count).toBe(exp.outliers_count);
      const symMissingOhlc = pSym.missing.open + pSym.missing.high + pSym.missing.low + pSym.missing.close;
      expect(symMissingOhlc).toBe(exp.missing_ohlc);
      expect(pSym.missing.volume).toBe(exp.missing_volume);
    }

    const missingOhlc =
      profile.by_symbol['TMA'].missing.open +
      profile.by_symbol['TMA'].missing.high +
      profile.by_symbol['TMA'].missing.low +
      profile.by_symbol['TMA'].missing.close +
      profile.by_symbol['TMB'].missing.open +
      profile.by_symbol['TMB'].missing.high +
      profile.by_symbol['TMB'].missing.low +
      profile.by_symbol['TMB'].missing.close +
      profile.by_symbol['TMC'].missing.open +
      profile.by_symbol['TMC'].missing.high +
      profile.by_symbol['TMC'].missing.low +
      profile.by_symbol['TMC'].missing.close;

    expect(missingOhlc).toBe(expectedJson.expected_ops.drop_rows_missing_ohlc.affected_rows); // 5

    const missingVol =
      profile.by_symbol['TMA'].missing.volume +
      profile.by_symbol['TMB'].missing.volume +
      profile.by_symbol['TMC'].missing.volume;

    expect(missingVol).toBe(expectedJson.expected_ops.fill_missing_volume_zero.affected_rows); // 4

    // Run pipeline with recommended decisions (Per A3: fill_missing_volume_zero is default OFF)
    const recommendedDecisions = {
      drop_exact_duplicates: true,
      drop_rows_missing_ohlc: true,
      fill_missing_volume_zero: false,
      flag_outliers: true,
      drop_flagged_outliers: false,
    };

    const pipeResult = runCleaningPipeline(ds, recommendedDecisions);
    expect(pipeResult.valid).toBe(true);
    expect(pipeResult.totalAfterRows).toBe(106); // 117 - 6 dups - 5 missing ohlc = 106
    expect(pipeResult.droppedCount).toBe(11); // 6 + 5 = 11
    expect(pipeResult.filledCount).toBe(0); // fill_missing_volume_zero is OFF

    // Verify per-symbol remaining sessions
    for (const sym of ['TMA', 'TMB', 'TMC']) {
      expect(pipeResult.symbolSessions[sym]).toBe(expectedJson.by_symbol[sym].sessions_after_recommended);
    }

    // Verify Section 5.4 constraint violation: if user enables drop_flagged_outliers, TMC drops to 29 (< 30)
    const dropOutliersDecisions = {
      ...recommendedDecisions,
      drop_flagged_outliers: true,
    };
    const pipeViolation = runCleaningPipeline(ds, dropOutliersDecisions);
    expect(pipeViolation.valid).toBe(false);
    expect(pipeViolation.violations.length).toBeGreaterThan(0);
    expect(pipeViolation.violations[0].symbol).toBe(expectedJson.expected_ops.drop_flagged_outliers.violating_symbol);
    expect(pipeViolation.violations[0].sessions_remaining).toBe(expectedJson.expected_ops.drop_flagged_outliers.remaining_sessions); // 29
    expect(pipeViolation.violations[0].symbol).toBe('TMC');
    expect(pipeViolation.violations[0].sessions_remaining).toBe(29);
    expect(pipeViolation.symbolSessions['TMC']).toBe(29);
  });
});

describe('P3 Outliers Mathematical Edge Cases', () => {
  it('handles flat prices where MAD = 0 without dividing by zero or crashing', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) {
      rows.push({
        symbol: 'FLAT',
        date: 100 + i,
        open: 50.0,
        high: 50.0,
        low: 50.0,
        close: 50.0,
        volume: 1000,
      });
    }
    const ds = createMockDataset(rows);
    const res = flagOutliers(ds);
    expect(res.flaggedIndices.length).toBe(0);
    expect(res.outlierFlags.every((f) => f === 0)).toBe(true);
  });

  it('enforces dual condition: returns >= 10% AND z > 6 required to flag', () => {
    // 25 sessions: constant volatility around 5% fluctuations
    const rows = [];
    for (let i = 0; i < 25; i++) {
      const p = 50.0 * (1 + (i % 2 === 0 ? 0.05 : -0.05));
      rows.push({
        symbol: 'DUAL',
        date: 100 + i,
        open: p,
        high: p * 1.01,
        low: p * 0.99,
        close: p,
        volume: 1000,
      });
    }
    // Inject a moderate move (+8%): does not exceed 10% threshold even if z > 6
    rows[24].close = rows[23].close * 1.08;
    const ds = createMockDataset(rows);
    const res = flagOutliers(ds);
    // Index 24 should not be flagged because |ret| = 0.077 < 0.10
    expect(res.outlierFlags[24]).toBe(0);
  });

  it('preserves raw dataset immutability across repeated cleaning runs', () => {
    const rows = [
      { symbol: 'TMA', date: 100, open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { symbol: 'TMA', date: 100, open: 10, high: 11, low: 9, close: 10, volume: 100 }, // Dup
      { symbol: 'TMA', date: 101, open: NaN, high: 11, low: 9, close: 10, volume: 100 }, // Missing OHLC
    ];
    const ds = createMockDataset(rows);
    const origLength = ds.symbol_idx.length;
    const origClose0 = ds.close[0];

    const pipeRes = runCleaningPipeline(ds, { drop_exact_duplicates: true, drop_rows_missing_ohlc: true });
    expect(pipeRes.totalAfterRows).toBe(1);

    // Verify raw dataset was NOT mutated
    expect(ds.symbol_idx.length).toBe(origLength);
    expect(ds.close[0]).toBe(origClose0);
  });
});

describe('P3 Canonical SHA-256 Hashing', () => {
  it('computes identical canonical hash regardless of repeated calls', async () => {
    const ds = createMockDataset([
      { symbol: 'TMA', date: 100, open: 10.1234, high: 12.5, low: 9.8, close: 11.2, volume: 1000 },
      { symbol: 'TMA', date: 101, open: 11.0, high: 13.0, low: 10.5, close: 12.0, volume: 2000 },
    ]);

    const hash1 = await computeCanonicalCleanHash(ds);
    const hash2 = await computeCanonicalCleanHash(ds);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string
  });
});

describe('P3 Architectural Boundary Check', () => {
  it('verifies that src/core/cleaner does not import React, DOM, api, agent, or services', () => {
    const cleanerDir = path.resolve('src/core/cleaner');
    const files = fs.readdirSync(cleanerDir);

    const forbiddenImports = ['react', 'react-dom', 'window', 'document', '../api', '../../api', '../agent', '../../agent', '../services', '../../services'];

    for (const f of files) {
      const fullPath = path.join(cleanerDir, f);
      if (fs.statSync(fullPath).isFile() && f.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const forbidden of forbiddenImports) {
          const regex = new RegExp(`from\\s+['"]${forbidden}['"]`, 'i');
          expect(regex.test(content)).toBe(false);
        }
      }
    }
  });
});
