
import fs from 'node:fs';
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

  console.log('margin_by_channel rows:', out.metrics.margin_by_channel?.pivot?.rows);
  console.log('margin_by_product rows:', out.metrics.margin_by_product?.pivot?.rows);
}
main();
