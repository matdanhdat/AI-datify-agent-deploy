import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { validateBytes } from '../src/core/validator/index.ts';
import { runBusinessCleanPipeline } from '../src/core/cleaner/businessCleaner.ts';
import { analyzeBusinessTable } from '../src/core/metrics/businessAnalyzer.ts';
import { computeAnalysisHash } from '../src/core/metrics/canonicalAnalysisHash.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function makeSyntheticBusinessTable(rowCount) {
  const channels = ['Website', 'Sàn TMĐT', 'Cửa hàng'];
  const regions = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
  const products = ['Sơ mi', 'Quần jeans', 'Áo thun', 'Túi tote'];
  const months = ['2026-07', '2026-08', '2026-09', '2026-10'];

  const ids = new Array(rowCount);
  const timeStrings = new Array(rowCount);
  const timeVals = new Int32Array(rowCount);
  const chCodes = new Uint16Array(rowCount);
  const rgCodes = new Uint16Array(rowCount);
  const prCodes = new Uint16Array(rowCount);
  const orders = new Float64Array(rowCount);
  const revenue = new Float64Array(rowCount);
  const cogs = new Float64Array(rowCount);
  const profit = new Float64Array(rowCount);
  const sourceRow = new Int32Array(rowCount);

  for (let i = 0; i < rowCount; i++) {
    ids[i] = `DS-${String(i + 1).padStart(5, '0')}`;
    const m = months[i % months.length];
    timeStrings[i] = m;
    const [yr, mo] = m.split('-').map(Number);
    timeVals[i] = (yr - 1970) * 12 + (mo - 1);
    chCodes[i] = i % channels.length;
    rgCodes[i] = (i * 3) % regions.length;
    prCodes[i] = (i * 7) % products.length;
    const o = 10 + (i % 90);
    const rev = o * (250000 + (i % 5) * 25000);
    const cost = Math.round(rev * 0.54);
    orders[i] = o;
    revenue[i] = rev;
    cogs[i] = cost;
    profit[i] = rev - cost;
    sourceRow[i] = i + 2;
  }

  return {
    kind: 'business',
    n: rowCount,
    source_row: sourceRow,
    columns: [
      { key: 'ma_dong', label: 'Mã dòng', role: 'id', values: ids },
      { key: 'thang', label: 'Tháng', role: 'time', granularity: 'month', values: timeVals, raw_labels: timeStrings },
      { key: 'kenh', label: 'Kênh bán', role: 'dimension', categories: channels, codes: chCodes },
      { key: 'khu_vuc', label: 'Khu vực', role: 'dimension', categories: regions, codes: rgCodes },
      { key: 'san_pham', label: 'Sản phẩm', role: 'dimension', categories: products, codes: prCodes },
      { key: 'so_don', label: 'Số đơn', role: 'measure', values: orders },
      { key: 'doanh_thu', label: 'Doanh thu', role: 'measure', values: revenue, unit: 'VND' },
      { key: 'gia_von', label: 'Giá vốn', role: 'measure', values: cogs, unit: 'VND' },
      { key: 'loi_nhuan', label: 'Lợi nhuận gộp', role: 'measure', values: profit, unit: 'VND' },
    ],
  };
}

async function main() {
  console.log('==============================================================');
  console.log('  ⚡ BENCHMARK PHÂN TÍCH DỮ LIỆU KINH DOANH (M3-A5)           ');
  console.log('==============================================================\n');

  const csvPath = path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv');
  const bytes = new Uint8Array(fs.readFileSync(csvPath));
  const valRes = await validateBytes('du-lieu-test-ban-le.csv', bytes);
  if (!valRes.ok || !valRes.businessTable) {
    throw new Error('Failed to validate du-lieu-test-ban-le.csv');
  }
  const cleanRes = runBusinessCleanPipeline(valRes.businessTable, {
    remove_blank_rows: true,
    trim_whitespace: true,
    drop_exact_duplicates: true,
    fill_blank_dimension_label: true,
    sort_natural: true,
  });

  const cases = [
    { label: '50 dòng (thực tế: 48 dòng sạch)', table: cleanRes.cleanTable, budgetMs: 300 },
    { label: '1.000 dòng (tổng hợp)', table: makeSyntheticBusinessTable(1000), budgetMs: 1000 },
    { label: '50.000 dòng (test cứng)', table: makeSyntheticBusinessTable(50000), budgetMs: 5000 },
  ];

  console.log('| Quy mô | Thời gian tính + dựng biểu đồ | SHA-256 | Tổng (ms) | Ngân sách | Kết quả |');
  console.log('|:---|---:|---:|---:|---:|:---:|');

  let allPassed = true;
  for (const c of cases) {
    const t0 = performance.now();
    const out = analyzeBusinessTable(c.table);
    const t1 = performance.now();
    await computeAnalysisHash(out.metrics);
    const t2 = performance.now();

    const computeMs = t1 - t0;
    const hashMs = t2 - t1;
    const totalMs = t2 - t0;
    const ok = totalMs < c.budgetMs;
    if (!ok) allPassed = false;

    console.log(
      `| ${c.label} | ${computeMs.toFixed(2)} ms | ${hashMs.toFixed(2)} ms | **${totalMs.toFixed(2)} ms** | < ${c.budgetMs} ms | ${ok ? 'ĐẠT' : 'VƯỢT'} |`
    );
  }

  console.log('\n==============================================================');
  if (!allPassed) {
    console.error('✕ Một hoặc nhiều mốc vượt ngân sách hiệu năng!');
    process.exit(1);
  }
  console.log('✓ TOÀN BỘ NGÂN SÁCH HIỆU NĂNG M3-A5 ĐẠT 100%!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
