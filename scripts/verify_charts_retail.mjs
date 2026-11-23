import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBytes } from '../src/core/validator/index.ts';
import { runBusinessCleanPipeline } from '../src/core/cleaner/businessCleaner.ts';
import { computeSelected } from '../src/core/metrics/businessComputeSelected.ts';
import { buildEChartsOption } from '../src/components/charts/buildOption.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const filePath = path.join(rootDir, 'samples', 'business', 'du-lieu-test-ban-le.csv');

const bytes = new Uint8Array(fs.readFileSync(filePath));
const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
const clean = runBusinessCleanPipeline(val.businessTable);

const ALL_13_METRICS = [
  'total_revenue', 'total_orders', 'aov', 'gross_profit', 'gross_margin',
  'revenue_by_channel', 'revenue_by_region', 'revenue_by_month', 'revenue_growth',
  'revenue_by_product', 'margin_by_channel', 'margin_by_product', 'channel_product_matrix'
];

const res = computeSelected(clean.cleanTable, ALL_13_METRICS);

console.log('| Metric ID | Chart ID | Kind | Series Count | Total Data Points | Total Value | Khớp Pivot |');
console.log('|---|---|---|---|---|---|---|');

for (const mId of ALL_13_METRICS) {
  const m = res.metrics[mId];
  if (m.chart) {
    const opt = buildEChartsOption(m.chart);
    const series = opt.series || [];
    let totalPoints = 0;
    let totalVal = 0;
    for (const s of series) {
      const dataArr = s.data || [];
      totalPoints += dataArr.length;
      for (const item of dataArr) {
        const v = typeof item === 'number' ? item : (item?.value ?? 0);
        totalVal += v;
      }
    }

    // Check against pivot if pivot exists
    let matchPivot = 'N/A';
    if (m.pivot && m.pivot.rows) {
      const pivotRowsCount = m.pivot.rows.length;
      // In revenue_growth, first month has no growth, so points = pivotRows - 1
      const expectedPoints = mId === 'revenue_growth' ? pivotRowsCount - 1 : pivotRowsCount;
      matchPivot = (totalPoints === expectedPoints) ? 'Khớp' : 'LỆCH';
    }

    console.log(`| ${mId} | ${m.chart.id} | ${m.chart.kind} | ${series.length} | ${totalPoints} | ${Math.round(totalVal).toLocaleString('vi-VN')} | ${matchPivot} |`);
  }
}
