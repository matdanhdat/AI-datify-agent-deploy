import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/pixel-trading-agent/docs/screens/FINAL';

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
console.log('| STT | Tên tệp ảnh | SHA-256 (64 ký tự) | Kích thước |');
console.log('|:---:|---|---|---:|');
files.forEach((f, idx) => {
  const p = path.join(DIR, f);
  const size = fs.statSync(p).size;
  console.log(`| ${idx + 1} | \`${f}\` | \`${sha256(p)}\` | ${size.toLocaleString('vi-VN')} B |`);
});
