import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from './src/core/validator/index.ts';
import { runBusinessCleanPipeline, calculateBusinessProfile, generateBusinessProposals } from './src/core/cleaner/businessCleaner.ts';

async function traceFile(filePath, label) {
  console.log(`\n======================================================`);
  console.log(`TRACE: ${label} (${filePath})`);
  console.log(`======================================================`);

  const bytes = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const valRes = await validateBytes(filename, bytes);

  console.log(`1. validateBytes result:`);
  console.log(`   - ok: ${valRes.ok}`);
  console.log(`   - kind: ${valRes.kind}`);
  console.log(`   - summary.rows: ${valRes.summary?.rows}`);
  console.log(`   - summary.skipped_blank_rows: ${valRes.summary?.skipped_blank_rows}`);
  console.log(`   - meta.skipped_blank_rows: ${valRes.meta?.skipped_blank_rows}`);
  console.log(`   - businessTable.n: ${valRes.businessTable?.n}`);
  console.log(`   - businessTable.skipped_blank_rows: ${valRes.businessTable?.skipped_blank_rows}`);
  console.log(`   - businessTable.source_row[0]: ${valRes.businessTable?.source_row[0]}`);
  console.log(`   - businessTable.source_row[last]: ${valRes.businessTable?.source_row[valRes.businessTable.n - 1]}`);

  if (!valRes.businessTable) return;

  const bTable = valRes.businessTable;
  const profile = calculateBusinessProfile(bTable);
  console.log(`\n2. calculateBusinessProfile result:`);
  console.log(`   - total_rows: ${profile.total_rows}`);
  console.log(`   - skipped_blank_rows: ${profile.skipped_blank_rows}`);
  console.log(`   - trimmed_cells_count: ${profile.trimmed_cells_count}`);
  console.log(`   - exact_duplicates_count: ${profile.exact_duplicates_count}`);
  console.log(`   - blank_dimension_cells_count: ${profile.blank_dimension_cells_count}`);
  console.log(`   - columns_summary (non_null_count):`);
  for (const c of profile.columns_summary) {
    console.log(`     * ${c.label} (${c.key}): non_null=${c.non_null_count}, missing=${c.missing_count}`);
  }

  const proposals = generateBusinessProposals(bTable, profile);
  console.log(`\n3. generateBusinessProposals:`);
  for (const p of proposals) {
    console.log(`   - [${p.id}] ${p.title_vi}: rows_affected=${p.rows_affected}`);
  }

  const pipelineRes = runBusinessCleanPipeline(bTable, {});
  console.log(`\n4. runBusinessCleanPipeline (default decisions - all enabled):`);
  console.log(`   - valid: ${pipelineRes.valid}`);
  console.log(`   - cleanTable.n: ${pipelineRes.cleanTable.n}`);
  console.log(`   - totalBeforeRows: ${pipelineRes.totalBeforeRows}`);
  console.log(`   - totalAfterRows: ${pipelineRes.totalAfterRows}`);
  console.log(`   - droppedCount: ${pipelineRes.droppedCount}`);
  console.log(`   - diffRows count: ${pipelineRes.diffRows?.length}`);
  for (const d of pipelineRes.diffRows || []) {
    console.log(`     * [${d.status}] row_id=${d.row_id}, orig_row=${d.original_row}: ${d.details_vi}`);
  }
}

async function main() {
  await traceFile('samples/business/thieu-gia-von-thieu-san-pham.csv', 'thieu-gia-von-thieu-san-pham.csv');
  await traceFile('samples/business/du-lieu-test-ban-le.csv', 'du-lieu-test-ban-le.csv');
}

main().catch(console.error);
