import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DIST_DIR = path.resolve('dist');

console.log('--- KIỂM TRA BẢO MẬT KHÓA API (CHECK NO SECRETS) ---');

const FAKE_KEY_1 = 'TEST_SECRET_KEY_ONE_123';
const FAKE_KEY_2 = 'TEST_SECRET_KEY_TWO_456';

// 1. Scan dist directory for secret strings and variable names
if (!fs.existsSync(DIST_DIR)) {
  console.error('✕ Thư mục dist/ chưa được build. Vui lòng chạy npm run build trước.');
  process.exit(1);
}

const distFiles = [];
function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) scan(full);
    else distFiles.push(full);
  }
}
scan(DIST_DIR);

const forbiddenStrings = [
  FAKE_KEY_1,
  FAKE_KEY_2,
  'GEMINI_API_KEY',
  'TEST_SECRET_KEY',
];

let leakedInDist = false;
for (const file of distFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  for (const forbidden of forbiddenStrings) {
    if (content.includes(forbidden)) {
      console.error(`✕ PHÁT HIỆN RÒ RỈ: Chuỗi cấm '${forbidden}' xuất hiện trong ${path.relative(process.cwd(), file)}!`);
      leakedInDist = true;
    }
  }
}

if (leakedInDist) {
  console.error('✕ KIỂM TRA THẤT BẠI: Khóa bí mật đã bị đóng gói vào bản build frontend!');
  process.exit(1);
}
console.log(`✓ Thư mục dist/ sạch (${distFiles.length} tệp): Không chứa biến hay chuỗi khóa bí mật.`);

// 2. Run vitest test verifying API response and error sanitization
console.log('Đang kiểm tra bảo mật phản hồi của /api/health và /api/ai qua vitest...');
try {
  execSync('npx vitest run api/_lib/handler.test.ts', { stdio: 'pipe' });
  console.log('✓ /api/health và /api/ai an toàn: Phản hồi không chứa dấu vết của khóa API.');
} catch (err) {
  console.error('✕ LỖI BẢO MẬT: Kiểm tra API gateway thất bại!', err);
  process.exit(1);
}

console.log('✓ TOÀN BỘ KIỂM TRA BẢO MẬT ĐẠT CHUẨN 100%!\n');
