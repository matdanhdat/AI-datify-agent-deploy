import { validateBytes, DEFAULT_LIMITS } from './src/core/validator';
import fs from 'node:fs';

async function main() {
  const cotLaBytes = fs.readFileSync('samples/business/cot-la.csv');
  const res1 = await validateBytes('cot-la.csv', cotLaBytes);
  console.log('cot-la ok:', res1.ok, 'issues:', JSON.stringify(res1.issues, null, 2));

  const nhieuSheetBytes = fs.readFileSync('samples/business/nhieu-sheet.xlsx');
  const res2 = await validateBytes('nhieu-sheet.xlsx', nhieuSheetBytes, DEFAULT_LIMITS, {}, { sheetName: 'NhanSu' });
  console.log('NhanSu ok:', res2.ok, 'issues:', JSON.stringify(res2.issues, null, 2));
}

main().catch(console.error);
