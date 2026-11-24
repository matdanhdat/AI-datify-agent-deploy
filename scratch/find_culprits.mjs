import fs from 'node:fs';
import path from 'node:path';

const files = ['K1_01_upload.txt', 'K1_02_gate1_profile.txt', 'K1_02_gate1_diff.txt', 'K1_03_analyze.txt', 'K1_04_report.txt'];
for (const f of files) {
  const content = fs.readFileSync(path.join('temp-1U-post', f), 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/chi phí/i.test(lines[i])) {
      console.log(`[chi phí in ${f}:${i + 1}] ${lines[i].trim()}`);
    }
    if (/Nạp dữ liệu giao dịch/i.test(lines[i])) {
      console.log(`[Nạp dữ liệu giao dịch in ${f}:${i + 1}] ${lines[i].trim()}`);
    }
  }
}
