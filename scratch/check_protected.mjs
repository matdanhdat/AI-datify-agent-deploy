import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/pixel-trading-agent';
const HASH_BEFORE_FILE = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/hash-before-1U.txt';

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

const protectedFiles = [
  'src/core/metrics/businessRoles.ts',
  'src/core/metrics/businessFeasibility.ts',
  'src/core/metrics/businessCatalog.ts',
  'src/core/narrative/factsBuilder.ts',
  'api/_lib/tasks.ts',
  'api/_lib/gemini.ts',
  'src/core/metrics/calculator.ts',
  'src/core/metrics/charts.ts',
  'src/core/cleaner/pipeline.ts',
  'src/services/exportExcel.ts',
  'docs/baseline_business.json',
];

const beforeLines = fs.readFileSync(HASH_BEFORE_FILE, 'utf-8').trim().split('\n');
const beforeMap = new Map();
for (const l of beforeLines) {
  const [h, ...rest] = l.trim().split(/\s+/);
  const file = rest.join(' ');
  beforeMap.set(file, h);
}

// Also read docs-before-1U.txt for docs/baseline_business.json
const docsBeforeLines = fs.readFileSync('C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/docs-before-1U.txt', 'utf-8').trim().split('\n');
for (const l of docsBeforeLines) {
  const [h, ...rest] = l.trim().split(/\s+/);
  const file = rest.join(' ');
  beforeMap.set(file, h);
}

console.log('| File | SHA-256 Trước 1U | SHA-256 Sau 1U | Trạng thái |');
console.log('|---|---|---|:---:|');
for (const f of protectedFiles) {
  const fullPath = path.join(ROOT, f);
  const hAfter = sha256File(fullPath);
  const hBefore = beforeMap.get(f) || 'N/A';
  const match = hBefore === hAfter;
  console.log(`| \`${f}\` | \`${hBefore}\` | \`${hAfter}\` | ${match ? 'KHÔNG ĐỔI (ĐẠT)' : 'ĐÃ ĐỔI (LỖI)'} |`);
}
