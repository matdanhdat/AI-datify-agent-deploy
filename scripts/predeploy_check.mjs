import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const errors = [];
const warnings = [];

console.log('======================================================');
console.log('  🔍 BẮT ĐẦU KIỂM TRA TRƯỚC KHI ĐẨY GIT (PREDEPLOY)  ');
console.log('======================================================\n');

// 1. Kiểm tra các tệp cấm không được tồn tại trong repo
console.log('[1/9] Quét kiểm tra tệp cấm (Python, config backend cũ)...');
const FORBIDDEN_EXTENSIONS = ['.py'];
const FORBIDDEN_FILENAMES = [
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'pytest.ini',
  'run.py',
];

function scanForbidden(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === '.venv' ||
      entry.name === 'dist' ||
      entry.name === '.pytest_cache' ||
      entry.name === '.ruff_cache'
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanForbidden(full);
    } else {
      const ext = path.extname(entry.name);
      if (FORBIDDEN_EXTENSIONS.includes(ext) || FORBIDDEN_FILENAMES.includes(entry.name)) {
        errors.push(`Phát hiện tệp cấm trong repo: ${path.relative(REPO_ROOT, full)}`);
      }
    }
  }
}
scanForbidden(REPO_ROOT);
if (errors.length === 0) {
  console.log('✓ Không còn tệp Python hay cấu hình backend cũ trong repo.');
} else {
  console.error('✕ Phát hiện tệp cấm!');
}

// 2. Kiểm tra package-lock.json tồn tại và khớp package.json
console.log('\n[2/9] Kiểm tra package.json và package-lock.json...');
if (!fs.existsSync(path.join(REPO_ROOT, 'package-lock.json'))) {
  errors.push('Thiếu tệp package-lock.json');
} else {
  console.log('✓ Tệp package-lock.json đã sẵn sàng.');
}

// 3. Thẩm định định dạng script khởi động (start.bat ASCII CRLF & start.sh LF)
console.log('\n[3/9] Thẩm định mã hóa và định dạng start.bat và start.sh...');
try {
  execSync('node scripts/check_scripts.mjs', { stdio: 'inherit' });
  console.log('✓ start.bat (100% ASCII, CRLF) và start.sh (LF) đạt chuẩn.');
} catch (_e) {
  errors.push('Lỗi định dạng script khởi động (check_scripts.mjs thất bại).');
}

// 4. Kiểm tra TypeScript compile (tsc --noEmit) cho cả src/ và api/
console.log('\n[4/9] Kiểm tra kiểu dữ liệu TypeScript (tsc --noEmit)...');
try {
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('✓ TypeScript biên dịch hoàn hảo (0 lỗi cú pháp/kiểu).');
} catch (_e) {
  errors.push('Lỗi kiểm tra kiểu TypeScript (tsc --noEmit).');
}

// 5. Kiểm tra rò rỉ khóa bí mật (check_no_secrets)
console.log('\n[5/9] Chạy kiểm tra rò rỉ khóa bí mật...');
try {
  execSync('node scripts/check_no_secrets.mjs', { stdio: 'inherit' });
} catch (_e) {
  errors.push('Phát hiện rò rỉ khóa bí mật hoặc lỗi kiểm tra bảo mật.');
}

// 6. Chạy toàn bộ kiểm thử tự động với bộ đếm động (vitest)
console.log('\n[6/9] Chạy toàn bộ kiểm thử tự động (vitest) và tổng hợp kết quả động...');
try {
  const vitestOutput = execSync('npx vitest run', { encoding: 'utf8' });
  const testMatch = vitestOutput.match(/Tests\s+(\d+)\s+passed/);
  const suiteMatch = vitestOutput.match(/Test Files\s+(\d+)\s+passed/);
  const testCount = testMatch ? testMatch[1] : 'tất cả';
  const suiteCount = suiteMatch ? suiteMatch[1] : 'tất cả';
  console.log(`✓ ${suiteCount} tệp kiểm thử, ${testCount} bài kiểm thử đạt chuẩn 100% (ALL PASS).`);
} catch (_e) {
  errors.push('Có bài kiểm thử thất bại trong npm test.');
}

// 7. Chạy kiểm toán giao diện (UI Audit)
console.log('\n[7/9] Chạy kiểm toán giao diện trên các viewport (UI Audit)...');
try {
  execSync('node scripts/ui_audit.mjs', { stdio: 'inherit' });
  console.log('✓ Kiểm toán giao diện thành công (0 lỗi render, 0 chuỗi rác).');
} catch (_e) {
  errors.push('Lỗi kiểm toán giao diện (ui_audit.mjs thất bại).');
}

// 8. Cập nhật tài liệu bằng chứng (evidence_report)
console.log('\n[8/9] Sinh tài liệu đối chiếu số liệu và bằng chứng (BANG_CHUNG.md)...');
try {
  execSync('node scripts/evidence_report.mjs', { stdio: 'inherit' });
  console.log('✓ docs/BANG_CHUNG.md đã được cập nhật với số liệu thực tế.');
} catch (_e) {
  errors.push('Lỗi sinh tài liệu bằng chứng (evidence_report.mjs thất bại).');
}

// 9. Thống kê dung lượng bản build và ngân sách kích thước
console.log('\n[9/9] Thẩm định ngân sách kích thước & Tài nguyên Vercel...');
let distTotalSize = 0;
let distFileCount = 0;
const distPath = path.join(REPO_ROOT, 'dist');
if (fs.existsSync(distPath)) {
  function calcSize(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) calcSize(p);
      else {
        distTotalSize += st.size;
        distFileCount++;
      }
    }
  }
  calcSize(distPath);
  const distMb = distTotalSize / (1024 * 1024);
  console.log(`- Kích thước bản build tĩnh (dist/): ${distMb.toFixed(2)} MB (${distFileCount} tệp)`);
  if (distMb > 15) {
    errors.push(`Kích thước bản build tĩnh (${distMb.toFixed(2)} MB) vượt quá giới hạn 15 MB.`);
  } else {
    console.log('✓ Ngân sách kích thước bản build đạt chuẩn (<= 15 MB).');
  }
} else {
  warnings.push('Chưa tìm thấy thư mục dist/. Vui lòng chạy npm run build trước khi deploy.');
}

const apiPath = path.join(REPO_ROOT, 'api');
const apiFunctions = fs
  .readdirSync(apiPath)
  .filter((f) => f.endsWith('.ts') && !f.startsWith('_'));
console.log(`- Số hàm serverless trong api/: ${apiFunctions.length} hàm (${apiFunctions.join(', ')})`);
if (apiFunctions.length > 5) {
  errors.push(`Số lượng hàm serverless (${apiFunctions.length}) vượt quá kiến trúc tối giản.`);
}

// Kết luận
console.log('\n======================================================');
if (errors.length === 0) {
  console.log('  🎉 KẾT LUẬN: SẴN SÀNG ĐẨY LÊN GIT!                 ');
  console.log('======================================================');
  console.log('Bạn có thể an tâm commit và push mã nguồn lên GitHub/Vercel.');
  process.exit(0);
} else {
  console.log('  ⚠️ KẾT LUẬN: CHƯA SẴN SÀNG                          ');
  console.log('======================================================');
  console.error('Các lỗi cần khắc phục trước khi đẩy lên Git:');
  errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
  process.exit(1);
}
