import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/pixel-trading-agent';
const DOCS_BEFORE = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/docs-before-1U.txt';

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

const docsDir = path.join(ROOT, 'docs');
const allDocs = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'screens') continue;
      walk(fullPath);
    } else {
      allDocs.push(fullPath);
    }
  }
}

walk(docsDir);
allDocs.sort();

const afterLines = [];
const afterMap = new Map();
for (const f of allDocs) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const h = sha256File(f);
  afterLines.push(`${h}  ${rel}`);
  afterMap.set(rel, h);
}

fs.writeFileSync('C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/docs-after-1U.txt', afterLines.join('\n') + '\n', 'utf-8');

const beforeLines = fs.readFileSync(DOCS_BEFORE, 'utf-8').trim().split('\n');
const beforeMap = new Map();
for (const l of beforeLines) {
  const [h, ...rest] = l.trim().split(/\s+/);
  const file = rest.join(' ');
  beforeMap.set(file, h);
}

console.log('=== CHANGED DOCS FILES ===');
for (const [file, hAfter] of afterMap.entries()) {
  if (!beforeMap.has(file)) {
    console.log(`[ADDED] ${file} (${hAfter})`);
  } else if (beforeMap.get(file) !== hAfter) {
    console.log(`[MODIFIED] ${file}`);
    console.log(`   Before: ${beforeMap.get(file)}`);
    console.log(`   After:  ${hAfter}`);
  }
}
