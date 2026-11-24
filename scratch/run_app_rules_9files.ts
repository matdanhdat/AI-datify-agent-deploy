import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../src/core/validator/index';
import { runBusinessCleanPipeline } from '../src/core/cleaner/businessCleaner';
import { resolveBusinessRoles } from '../src/core/metrics/businessRoles';
import { buildBusinessFactsFromSelected } from '../src/core/narrative/factsBuilder';
import { evaluateInsightRules } from '../src/core/narrative/insightRules';

const samplesDir = path.resolve(__dirname, '../samples/business');
const evidenceDir = path.resolve(__dirname, '../../_bao-cao-5BFIX');

const ALL_13_METRICS = [
  'total_revenue',
  'total_orders',
  'aov',
  'gross_profit',
  'gross_margin',
  'revenue_by_channel',
  'revenue_by_region',
  'revenue_by_month',
  'revenue_growth',
  'revenue_by_product',
  'margin_by_channel',
  'margin_by_product',
  'channel_product_matrix',
];

const FILES_CONFIG = [
  { file: 'du-lieu-test-ban-le.csv', options: {} },
  { file: 'thieu-gia-von-thieu-san-pham.csv', options: {} },
  { file: 'dien-tu-thieu-loi-nhuan.csv', options: {} },
  { file: 'o-to-thieu-kenh-thieu-gia-von.csv', options: {} },
  { file: 'nha-dat-ty-dong-cham-phay.csv', options: { decimalConvention: 'comma' } },
  { file: 'dien-may-nghin-dong-mo-ho.csv', options: {} },
  { file: 'tong-cong-cuoi-file.csv', options: {} },
  { file: 'cot-la-6-dong.csv', options: {} },
  { file: 'ma-dong-lap-trim.csv', options: {} },
];

async function run() {
  const results: Record<string, any> = {};

  for (const cfg of FILES_CONFIG) {
    const filePath = path.join(samplesDir, cfg.file);
    const bytes = fs.readFileSync(filePath);
    const val = await validateBytes(cfg.file, new Uint8Array(bytes), cfg.options as any);
    if (!val.ok || !val.businessTable) {
      console.error(`Failed to validate ${cfg.file}:`, val.errors);
      continue;
    }

    const cleanRes = runBusinessCleanPipeline(val.businessTable);
    const cleanTable = cleanRes.cleanTable;
    const roles = resolveBusinessRoles(cleanTable);

    const factsTable = buildBusinessFactsFromSelected(cleanTable, ALL_13_METRICS, {
      customRoles: roles,
    });

    const engineOutput = evaluateInsightRules(factsTable);
    const ruleIds = engineOutput.findings.map((f) => f.rule_id);
    results[cfg.file] = {
      ruleIds,
      findings: engineOutput.findings.map((f) => ({
        rule_id: f.rule_id,
        title: f.title,
        evidence: f.evidence,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
        hypothesis: f.hypothesis,
      })),
      emptyMessage: engineOutput.emptyMessage,
      priority_actions: engineOutput.priority_actions,
    };
  }

  const outPath = path.join(evidenceDir, 'app_rules_9files_5bfix.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Saved app rules to ${outPath}`);
  for (const [f, d] of Object.entries(results)) {
    console.log(`${f}: ${d.ruleIds.join(', ')}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
