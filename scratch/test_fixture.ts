import { runInsightRules, type InsightInput } from './src/core/narrative/insightEngine';

const input: InsightInput = {
  rowCount: 48,
  totalRevenue: 1135530000,
  totalProfit: 531850000,
  selectedMetricIds: [
    'total_revenue', 'total_orders', 'aov', 'gross_profit', 'gross_margin', 'revenue_by_channel',
    'revenue_by_region', 'revenue_by_month', 'revenue_growth', 'revenue_by_product',
    'margin_by_channel', 'margin_by_product', 'channel_product_matrix'
  ],
  channels: [
    { name: 'Website', revenue: 454165000, profit: 216547000 },
    { name: 'Sàn thương mại điện tử', revenue: 367740000, profit: 165300000 },
    { name: 'Cửa hàng', revenue: 313625000, profit: 150003000 }
  ],
  products: [
    { name: 'Sơ mi', revenue: 373257000, profit: 172791000 },
    { name: 'Quần jeans', revenue: 363893000, profit: 158147000 },
    { name: 'Áo thun', revenue: 258092000, profit: 129810000 },
    { name: 'Túi tote', revenue: 94768000, profit: 51022000 },
    { name: 'Không xác định', revenue: 45520000, profit: 20080000 }
  ],
  regions: [
    { name: 'Miền Trung', revenue: 380718000 },
    { name: 'Miền Bắc', revenue: 372836000 },
    { name: 'Miền Nam', revenue: 355558000 },
    { name: 'Không xác định', revenue: 26418000 }
  ],
  months: [
    { label: '2026-07', revenue: 261246000 },
    { label: '2026-08', revenue: 296557000 },
    { label: '2026-09', revenue: 243511000 },
    { label: '2026-10', revenue: 334216000 }
  ],
  matrix: [
    { channel: 'Website', product: 'Áo thun', revenue: 99960000, profit: 51408000 },
    { channel: 'Website', product: 'Sơ mi', revenue: 148326000, profit: 69738000 },
    { channel: 'Website', product: 'Quần jeans', revenue: 120059000, profit: 52961000 },
    { channel: 'Website', product: 'Túi tote', revenue: 40300000, profit: 22360000 },
    { channel: 'Website', product: 'Không xác định', revenue: 45520000, profit: 20080000 },
    { channel: 'Cửa hàng', product: 'Áo thun', revenue: 77420000, profit: 39816000 },
    { channel: 'Cửa hàng', product: 'Sơ mi', revenue: 104331000, profit: 49053000 },
    { channel: 'Cửa hàng', product: 'Quần jeans', revenue: 105834000, profit: 46686000 },
    { channel: 'Cửa hàng', product: 'Túi tote', revenue: 26040000, profit: 14448000 },
    { channel: 'Sàn thương mại điện tử', product: 'Áo thun', revenue: 80712000, profit: 38586000 },
    { channel: 'Sàn thương mại điện tử', product: 'Sơ mi', revenue: 120600000, profit: 54000000 },
    { channel: 'Sàn thương mại điện tử', product: 'Quần jeans', revenue: 138000000, profit: 58500000 },
    { channel: 'Sàn thương mại điện tử', product: 'Túi tote', revenue: 28428000, profit: 14214000 }
  ]
};

const res = runInsightRules(input);
console.log('Findings count:', res.findings.length);
res.findings.forEach((f, i) => {
  console.log((i + 1) + '. [' + f.ruleId + '] (prio: ' + f.priority + ', kind: ' + f.kind + ', dim: ' + (f.dimension || 'none') + ') -> ' + f.title);
  console.log('   headline:', f.headline);
});
console.log('Priority actions count:', res.priorityActions.length);
res.priorityActions.forEach(a => console.log('  action:', a.ruleId, a.kpiMetricId, a.checkAfter));
