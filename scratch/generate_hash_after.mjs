import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/pixel-trading-agent';
const HASH_BEFORE_FILE = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/hash-before-1U.txt';
const HASH_AFTER_FILE = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/hash-after-1U.txt';

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

const targetDirs = ['api', 'public', 'samples', 'scripts', 'src'];
const allFiles = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'deploy-package', '.git', 'scratch'].includes(entry.name)) {
        continue;
      }
      walk(fullPath);
    } else {
      if (entry.name.startsWith('.env')) continue;
      allFiles.push(fullPath);
    }
  }
}

for (const d of targetDirs) {
  walk(path.join(ROOT, d));
}

allFiles.sort((a, b) => a.localeCompare(b));

const lines = [];
for (const f of allFiles) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const h = sha256File(f);
  lines.push(`${h}  ${rel}`);
}

fs.writeFileSync(HASH_AFTER_FILE, lines.join('\n') + '\n', 'utf-8');
console.log(`Generated ${HASH_AFTER_FILE} with ${lines.length} files.`);

// Compare with hash-before-1U.txt
const beforeLines = fs.readFileSync(HASH_BEFORE_FILE, 'utf-8').trim().split('\n');
const beforeMap = new Map();
for (const l of beforeLines) {
  const [h, ...rest] = l.trim().split(/\s+/);
  const file = rest.join(' ');
  beforeMap.set(file, h);
}

const afterMap = new Map();
for (const l of lines) {
  const [h, ...rest] = l.trim().split(/\s+/);
  const file = rest.join(' ');
  afterMap.set(file, h);
}

console.log('\n=== CHANGED / ADDED / REMOVED FILES ===');
for (const [file, hAfter] of afterMap.entries()) {
  if (!beforeMap.has(file)) {
    console.log(`[ADDED] ${file} (SHA256: ${hAfter})`);
  } else if (beforeMap.get(file) !== hAfter) {
    console.log(`[MODIFIED] ${file}`);
    console.log(`   Before: ${beforeMap.get(file)}`);
    console.log(`   After:  ${hAfter}`);
  }
}

for (const [file, hBefore] of beforeMap.entries()) {
  if (!afterMap.has(file)) {
    console.log(`[REMOVED] ${file} (was SHA256: ${hBefore})`);
  }
}
