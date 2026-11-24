import fs from 'node:fs';
import { validateBytes } from './src/core/validator';
import { runBusinessCleanPipeline } from './src/core/cleaner/businessCleaner';
import { computeSelected } from './src/core/metrics/businessComputeSelected';
import { BUSINESS_METRIC_CATALOG } from './src/core/metrics/businessCatalog';
import { runInsightRules, type InsightInput } from './src/core/narrative/insightEngine';

async function main() {
  const banLePath = 'samples/business/du-lieu-test-ban-le.csv';
  const bytes = new Uint8Array(fs.readFileSync(banLePath));
  const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
  const pipe = runBusinessCleanPipeline(val.businessTable!, {});
  const allIds = BUSINESS_METRIC_CATALOG.map((m) => m.id);
  const out = computeSelected(pipe.cleanTable, allIds);

  const metrics = out.metrics;
  const channelMap = new Map<string, { revenue: number; profit?: number | null }>();
  (metrics.revenue_by_channel?.pivot as any)?.rows?.forEach((r: any) => {
    if (r.label) channelMap.set(r.label, { revenue: r.revenue ?? 0, profit: r.profit ?? null });
  });
  (metrics.margin_by_channel?.pivot as any)?.rows?.forEach((r: any) => {
    const existing = channelMap.get(r.label);
    if (existing) {
      if (r.profit !== undefined && r.profit !== null) existing.profit = r.profit;
    } else if (r.label) {
      channelMap.set(r.label, { revenue: r.revenue ?? 0, profit: r.profit ?? null });
    }
  });

  const prodMap = new Map<string, { revenue: number; profit?: number | null }>();
  (metrics.revenue_by_product?.pivot as any)?.rows?.forEach((r: any) => {
    if (r.label) prodMap.set(r.label, { revenue: r.revenue ?? 0, profit: r.profit ?? null });
  });
  (metrics.margin_by_product?.pivot as any)?.rows?.forEach((r: any) => {
    const existing = prodMap.get(r.label);
    if (existing) {
      if (r.profit !== undefined && r.profit !== null) existing.profit = r.profit;
    } else if (r.label) {
      prodMap.set(r.label, { revenue: r.revenue ?? 0, profit: r.profit ?? null });
    }
  });

  const totalProfit = (out.totalRevenue !== undefined && out.totalCogs !== undefined && out.totalCogs !== null)
    ? out.totalRevenue - out.totalCogs
    : null;

  const input: InsightInput = {
    rowCount: out.rowCount,
    totalRevenue: out.totalRevenue ?? 0,
    totalProfit,
    selectedMetricIds: allIds,
    channels: Array.from(channelMap.entries()).map(([name, s]) => ({ name, revenue: s.revenue, profit: s.profit })),
    products: Array.from(prodMap.entries()).map(([name, s]) => ({ name, revenue: s.revenue, profit: s.profit })),
    regions: (metrics.revenue_by_region?.pivot as any)?.rows?.map((r: any) => ({ name: r.label, revenue: r.revenue ?? 0 })),
    months: (metrics.revenue_by_month?.pivot as any)?.rows?.map((r: any) => ({ label: r.label, revenue: r.revenue ?? 0 })),
    matrix: (metrics.channel_product_matrix?.pivot as any)?.cells?.map((c: any) => ({
      channel: c.channel,
      product: c.product,
      revenue: c.revenue,
      profit: c.profit,
    }))
  };

  const res = runInsightRules(input);
  console.log('Result findings count:', res.findings.length);
  res.findings.forEach((f, i) => {
    console.log((i + 1) + '. [' + f.ruleId + '] ' + f.title);
    console.log('   headline:', f.headline);
  });
}
main();
