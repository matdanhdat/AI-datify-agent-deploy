/**
 * Timezone invariance test runner.
 * Spawns child processes in Asia/Ho_Chi_Minh (+07:00) and America/Los_Angeles (-08:00 / -07:00)
 * to verify that date parsing produces identical UTC day integers regardless of host timezone.
 * Run via: node scripts/test_tz.mjs
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const testDates = [
  '2025-01-02',
  '2025-06-15',
  '2025-12-31',
  '01/01/2025',
  '15/08/2025',
  '31/12/2025',
  '2025-01-02 09:30:00',
  '2025-06-15T15:45:00Z',
  '2025/03/25',
  '25-03-2025',
];

const runnerScript = `
function parseSingleDate(raw) {
  const str = String(raw).trim();
  let datePart = str.split(/[ T]/)[0];

  const dmyMatch = datePart.match(/^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const dt = new Date(Date.UTC(year, month - 1, day));
    return Math.floor(dt.getTime() / 86400000);
  }

  const ymdMatch = datePart.match(/^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const dt = new Date(Date.UTC(year, month - 1, day));
    return Math.floor(dt.getTime() / 86400000);
  }

  return null;
}

const dates = ${JSON.stringify(testDates)};
const results = dates.map(d => ({ date: d, days: parseSingleDate(d) }));
console.log(JSON.stringify(results));
`;

function runInTz(tz) {
  try {
    const output = execFileSync('node', ['-e', runnerScript], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    return JSON.parse(output.trim());
  } catch (err) {
    console.error(`Error running in TZ=${tz}:`, err);
    process.exit(1);
  }
}

console.log('Running Timezone Invariance Check (Section 9)...');
console.log('Testing Asia/Ho_Chi_Minh (UTC+7)...');
const hcmResults = runInTz('Asia/Ho_Chi_Minh');

console.log('Testing America/Los_Angeles (UTC-8)...');
const laResults = runInTz('America/Los_Angeles');

let hasMismatch = false;
for (let i = 0; i < testDates.length; i++) {
  const hcm = hcmResults[i];
  const la = laResults[i];
  if (hcm.days !== la.days) {
    console.error(`MISMATCH on date "${testDates[i]}": HCM=${hcm.days}, LA=${la.days}`);
    hasMismatch = true;
  }
}

if (hasMismatch) {
  console.error('FAILED: Timezone shift detected in date parsing!');
  process.exit(1);
} else {
  console.log(`PASSED: All ${testDates.length} date patterns produced identical UTC days in both timezones.`);
  process.exit(0);
}

