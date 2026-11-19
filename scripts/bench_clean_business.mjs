/**
 * Performance benchmark for Standardized Business Cleaning Engine (Prompt E1).
 * Budgets:
 * - 50 rows in Node < 300ms
 * - 5,000 rows in Node < 1,000ms
 * - 50,000 rows in Node < 5,000ms
 * - Gate 1 commit (including Canonical SHA-256) < 1,000ms
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runBusinessCleanPipeline,
  computeBusinessCanonicalHash,
} from '../src/core/cleaner/businessCleaner.ts';
import { validateBytes } from '../src/core/validator/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBenchmark() {
  console.log('======================================================');
  console.log('  ⚡ BENCHMARK LÀM SẠCH BẢNG KINH DOANH (PROMPT E1)   ');
  console.log('======================================================\n');

  const csvPath = path.resolve(__dirname, '../samples/business/du-lieu-test-ban-le.csv');
  const csvBytes = new Uint8Array(fs.readFileSync(csvPath));

  // 1. Benchmark 50 rows (du-lieu-test-ban-le.csv)
  console.log('[1/4] Kiểm tra tệp bán lẻ mẫu (50 dòng dữ liệu)...');
  const valRes = await validateBytes('du-lieu-test-ban-le.csv', csvBytes);
  if (!valRes.ok || !valRes.businessTable) {
    throw new Error('Không thể nạp tệp bán lẻ mẫu');
  }
  const table50 = valRes.businessTable;

  const t0 = performance.now();
  const res50 = runBusinessCleanPipeline(table50);
  const hash50 = await computeBusinessCanonicalHash(res50.cleanTable);
  const elapsed50 = performance.now() - t0;

  console.log(`  ✓ 50 dòng: ${elapsed50.toFixed(2)} ms (Ngân sách < 300 ms) | Hash: ${hash50.slice(0, 16)}...`);
  if (elapsed50 > 300) {
    console.error(`✕ Vượt ngân sách 300ms: ${elapsed50.toFixed(2)}ms`);
    process.exit(1);
  }

  // 2. Synthesize 5,000 rows by repeating table50 100 times
  console.log('\n[2/4] Kiểm tra 5.000 dòng dữ liệu kinh doanh...');
  const table5k = synthesizeTable(table50, 100);

  const t1 = performance.now();
  const res5k = runBusinessCleanPipeline(table5k);
  const hash5k = await computeBusinessCanonicalHash(res5k.cleanTable);
  const elapsed5k = performance.now() - t1;

  console.log(`  ✓ 5.000 dòng: ${elapsed5k.toFixed(2)} ms (Ngân sách < 1.000 ms) | Hash: ${hash5k.slice(0, 16)}...`);
  if (elapsed5k > 1000) {
    console.error(`✕ Vượt ngân sách 1.000ms: ${elapsed5k.toFixed(2)}ms`);
    process.exit(1);
  }

  // 3. Synthesize 50,000 rows by repeating table50 1000 times
  console.log('\n[3/4] Kiểm tra 50.000 dòng dữ liệu kinh doanh...');
  const table50k = synthesizeTable(table50, 1000);

  const t2 = performance.now();
  const res50k = runBusinessCleanPipeline(table50k);
  const hash50k = await computeBusinessCanonicalHash(res50k.cleanTable);
  const elapsed50k = performance.now() - t2;

  console.log(`  ✓ 50.000 dòng: ${elapsed50k.toFixed(2)} ms (Ngân sách < 5.000 ms) | Hash: ${hash50k.slice(0, 16)}...`);
  if (elapsed50k > 5000) {
    console.error(`✕ Vượt ngân sách 5.000ms: ${elapsed50k.toFixed(2)}ms`);
    process.exit(1);
  }

  // 4. Gate 1 Commit Benchmark (Pipeline + Canonical Hash on 50 rows)
  console.log('\n[4/4] Kiểm tra thời gian phê duyệt Cổng 1 (Pipeline + Hash)...');
  const tCommit0 = performance.now();
  const commitRes = runBusinessCleanPipeline(table50);
  await computeBusinessCanonicalHash(commitRes.cleanTable);
  const elapsedCommit = performance.now() - tCommit0;

  console.log(`  ✓ Phê duyệt Cổng 1: ${elapsedCommit.toFixed(2)} ms (Ngân sách < 1.000 ms)`);
  if (elapsedCommit > 1000) {
    console.error(`✕ Phê duyệt Cổng 1 vượt 1.000ms: ${elapsedCommit.toFixed(2)}ms`);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('  🎉 TẤT CẢ CÁC MỤC TIÊU HIỆU NĂNG ĐỀU ĐẠT CHUẨN!     ');
  console.log('======================================================');
}

function synthesizeTable(baseTable, multiplier) {
  const n = baseTable.n * multiplier;
  const source_row = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    source_row[k] = k + 1;
  }

  const columns = baseTable.columns.map((col) => {
    switch (col.role) {
      case 'id': {
        const values = [];
        for (let m = 0; m < multiplier; m++) {
          for (let i = 0; i < baseTable.n; i++) {
            values.push(`${col.values[i]}_${m}`);
          }
        }
        return { ...col, values };
      }
      case 'time': {
        const vals = new Int32Array(n);
        const raw_labels = col.raw_labels ? [] : undefined;
        let p = 0;
        for (let m = 0; m < multiplier; m++) {
          for (let i = 0; i < baseTable.n; i++) {
            vals[p] = col.values[i];
            if (raw_labels) raw_labels.push(col.raw_labels[i]);
            p++;
          }
        }
        return { ...col, values: vals, raw_labels };
      }
      case 'dimension': {
        const codes = new Uint16Array(n);
        const raw_labels = col.raw_labels ? [] : undefined;
        let p = 0;
        for (let m = 0; m < multiplier; m++) {
          for (let i = 0; i < baseTable.n; i++) {
            codes[p] = col.codes[i];
            if (raw_labels) raw_labels.push(col.raw_labels[i]);
            p++;
          }
        }
        return { ...col, codes, raw_labels, categories: [...col.categories] };
      }
      case 'measure': {
        const vals = new Float64Array(n);
        let p = 0;
        for (let m = 0; m < multiplier; m++) {
          for (let i = 0; i < baseTable.n; i++) {
            vals[p] = col.values[i];
            p++;
          }
        }
        return { ...col, values: vals };
      }
    }
  });

  return {
    kind: 'business',
    n,
    source_row,
    columns,
  };
}

runBenchmark().catch((err) => {
  console.error('Lỗi khi chạy benchmark:', err);
  process.exit(1);
});
