import { describe, it } from 'vitest';
import { calculateProfile } from '../src/core/cleaner/profile';
import { generateProposals } from '../src/core/cleaner/proposals';
import { runCleaningPipeline } from '../src/core/cleaner/pipeline';
import { computeCanonicalCleanHash } from '../src/core/cleaner/canonicalHash';
import type { RawDataset } from '../src/core/dataset';

function generateRawDataset(n: number): RawDataset {
  const symbols = ['TMA', 'TMB', 'TMC'];
  const symbol_idx = new Uint16Array(n);
  const date_days = new Int32Array(n);
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const volume = new Float64Array(n);
  const source_row = new Int32Array(n);

  const baseDate = Math.floor(new Date('2020-01-01T00:00:00Z').getTime() / 86400000);

  for (let i = 0; i < n; i++) {
    symbol_idx[i] = i % 3;
    date_days[i] = baseDate + Math.floor(i / 3);
    const p = 50.0 + (i % 25);
    open[i] = p;
    high[i] = p + 2.0;
    low[i] = p - 1.5;
    close[i] = p + 0.5;
    volume[i] = 100000 + ((i * 100) % 500000);
    source_row[i] = i + 2;

    // Inject realistic dirty data
    if (i % 200 === 0) {
      volume[i] = NaN; // Missing volume
    }
    if (i % 500 === 0) {
      close[i] = p * 2.5; // Outlier spike
      high[i] = p * 2.6;
    }
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

describe('P3 Cleaning Performance Benchmark', () => {
  it('benchmarks profiling, proposals, diff pipeline, and canonical hashing', async () => {
    const testCounts = [10000, 25000, 50000];
    const results: any[] = [];

    for (const count of testCounts) {
      const dataset = generateRawDataset(count);
      const memBefore = process.memoryUsage().heapUsed;

      // 1. Profile
      const t0Profile = performance.now();
      const profile = calculateProfile(dataset);
      const t1Profile = performance.now();
      const timeProfile = t1Profile - t0Profile;

      // 2. Proposals
      const t0Props = performance.now();
      const proposals = generateProposals(dataset, profile);
      const t1Props = performance.now();
      const timeProps = t1Props - t0Props;

      // 3. Pipeline Diff
      const decisions = {
        drop_exact_duplicates: true,
        drop_rows_missing_ohlc: true,
        fill_missing_volume_zero: true,
        flag_outliers: true,
        drop_flagged_outliers: false,
      };
      const t0Pipe = performance.now();
      const diff = runCleaningPipeline(dataset, decisions);
      const t1Pipe = performance.now();
      const timePipe = t1Pipe - t0Pipe;

      // 4. Canonical Hash
      const t0Hash = performance.now();
      const hash = await computeCanonicalCleanHash(diff.cleanDataset);
      const t1Hash = performance.now();
      const timeHash = t1Hash - t0Hash;

      const memAfter = process.memoryUsage().heapUsed;
      const totalTime = timeProfile + timeProps + timePipe + timeHash;
      const ramDiffMb = Math.max(0, (memAfter - memBefore) / (1024 * 1024)).toFixed(1);

      results.push({
        rows: count,
        profileMs: timeProfile.toFixed(1),
        proposalsMs: timeProps.toFixed(1),
        pipeMs: timePipe.toFixed(1),
        hashMs: timeHash.toFixed(1),
        totalMs: totalTime.toFixed(1),
        ramMb: ramDiffMb,
        hashPrefix: hash.slice(0, 12),
      });
    }

    console.log('\n### KẾT QUẢ BENCHMARK LÀM SẠCH (NODE.JS / TYPED ARRAYS):\n');
    console.log(
      '| Số dòng | Hồ sơ (ms) | Đề xuất (ms) | Diff Pipeline (ms) | Băm SHA-256 (ms) | Tổng (ms) | RAM tăng (MB) | Chuẩn (< 2000ms) |'
    );
    console.log('|:---|:---|:---|:---|:---|:---|:---|:---|');
    for (const r of results) {
      const pass = parseFloat(r.totalMs) <= 2000 ? 'ĐẠT (<= 2s)' : 'VƯỢT';
      console.log(
        `| ${r.rows.toLocaleString('vi-VN')} | ${r.profileMs} ms | ${r.proposalsMs} ms | ${r.pipeMs} ms | ${r.hashMs} ms | ${r.totalMs} ms | +${r.ramMb} MB | ${pass} |`
      );
    }
  }, 25000);
});

