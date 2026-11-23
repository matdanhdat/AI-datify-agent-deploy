import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBytes } from '../src/core/validator/index.ts';
import { runBusinessCleanPipeline } from '../src/core/cleaner/businessCleaner.ts';
import { computeSelected } from '../src/core/metrics/businessComputeSelected.ts';
import { resolveBusinessRoles } from '../src/core/metrics/businessRoles.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const samplesDir = path.join(rootDir, 'samples', 'business');

const ALL_13_METRICS = [
  'total_revenue', 'total_orders', 'aov', 'gross_profit', 'gross_margin',
  'revenue_by_channel', 'revenue_by_region', 'revenue_by_month', 'revenue_growth',
  'revenue_by_product', 'margin_by_channel', 'margin_by_product', 'channel_product_matrix'
];

const files = [
  { name: 'du-lieu-test-ban-le.csv', options: {} },
  { name: 'thieu-gia-von-thieu-san-pham.csv', options: {} },
  { name: 'dien-tu-thieu-loi-nhuan.csv', options: {} },
  { name: 'o-to-thieu-kenh-thieu-gia-von.csv', options: {} },
  { name: 'nha-dat-ty-dong-cham-phay.csv', options: {} },
  { name: 'dien-may-nghin-dong-mo-ho.csv', options: { decimalConvention: 'dot' } },
  { name: 'tong-cong-cuoi-file.csv', options: {} },
  { name: 'cot-la-6-dong.csv', options: { manualRevenueCol: 'Khoản thu KH' } },
  { name: 'ma-dong-lap-trim.csv', options: {} },
];

console.log('| File | Nhãn | Lý do hạ bậc (nguyên văn) | Khớp luật |');
console.log('|---|---|---|---|');

for (const f of files) {
  const filePath = path.join(samplesDir, f.name);
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const val = await validateBytes(f.name, bytes);
  if (f.options.manualRevenueCol) {
    const col = val.businessTable.columns.find((c) => c.key === f.options.manualRevenueCol);
    if (col) col.userChosenRole = 'revenue';
  }
  if (f.options.decimalConvention) {
    for (const col of val.businessTable.columns) {
      if (col.role === 'measure') col.userDecimalConvention = f.options.decimalConvention;
    }
  }
  const cleanRes = runBusinessCleanPipeline(val.businessTable);
  const roles = resolveBusinessRoles(cleanRes.cleanTable);
  if (f.options.manualRevenueCol) roles.revenue.userChosen = true;

  const output = computeSelected(cleanRes.cleanTable, ALL_13_METRICS, {
    profile: {
      kind: 'business',
      total_rows: cleanRes.cleanTable.n,
      total_columns: cleanRes.cleanTable.columns.length,
      skipped_blank_rows: val.summary.skipped_blank_rows || 0,
      trimmed_cells_count: 0,
      exact_duplicates_count: 0,
      blank_dimension_cells_count: 0,
      columns_summary: [],
    },
    customRoles: roles,
  });

  const level = output.confidence.level_vi;
  const reasons = output.confidence.reasons.length > 0 ? output.confidence.reasons.join('; ') : 'Không có (đủ tiêu chuẩn CAO)';
  
  let match = 'Khớp';
  if (f.name === 'du-lieu-test-ban-le.csv' && level !== 'CAO') match = 'LỆCH';
  if (f.name === 'cot-la-6-dong.csv' && level !== 'THẤP') match = 'LỆCH';

  console.log(`| ${f.name} | ${level} | ${reasons} | ${match} |`);
}
