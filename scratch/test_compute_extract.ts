
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from './src/core/validator';
import { runBusinessCleanPipeline } from './src/core/cleaner/businessCleaner';
import { computeSelected } from './src/core/metrics/businessComputeSelected';
import { BUSINESS_METRIC_CATALOG } from './src/core/metrics/businessCatalog';

async function main() {
  const banLePath = 'samples/business/du-lieu-test-ban-le.csv';
  const bytes = new Uint8Array(fs.readFileSync(banLePath));
  const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
  const pipe = runBusinessCleanPipeline(val.businessTable!, {});
  const allIds = BUSINESS_METRIC_CATALOG.map((m) => m.id);
  const out = computeSelected(pipe.cleanTable, allIds);

  console.log('rowCount:', out.rowCount);
  console.log('totalRevenue:', out.totalRevenue);
  console.log('totalCogs:', out.totalCogs);
  console.log('channels:', out.metrics.revenue_by_channel?.pivot?.rows?.map((r) => ({ name: r.label, rev: r.revenue, prof: r.profit })));
  console.log('products:', out.metrics.revenue_by_product?.pivot?.rows?.map((r) => ({ name: r.label, rev: r.revenue, prof: r.profit })));
  console.log('regions:', out.metrics.revenue_by_region?.pivot?.rows?.map((r) => ({ name: r.label, rev: r.revenue })));
  console.log('months:', out.metrics.revenue_by_month?.pivot?.rows?.map((r) => ({ label: r.label, rev: r.revenue })));
  console.log('matrix cells count:', (out.metrics.channel_product_matrix?.pivot as any)?.cells?.length);
  (out.metrics.channel_product_matrix?.pivot as any)?.cells?.slice(0, 5).forEach((c: any) => console.log(' cell:', c.channel, c.product, c.revenue, c.profit, c.margin_pct));
}
main();
