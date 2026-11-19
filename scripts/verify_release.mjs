import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_DIR = path.resolve(__dirname, '..');
const PARENT_DIR = path.resolve(SOURCE_DIR, '..');
const RELEASE_DIR = path.resolve(PARENT_DIR, 'pixel-trading-agent-release');

// Đường dẫn tạm thời có dấu cách để kiểm thử tính chịu lỗi đường dẫn của Windows
const VERIFY_TEMP_DIR = path.join(os.tmpdir(), 'pixel agent release test verification');

console.log('======================================================');
console.log('  🧪 BẮT ĐẦU THẨM ĐỊNH BẢN PHÁT HÀNH SẠCH (VERIFY)     ');
console.log('======================================================\n');

if (!fs.existsSync(RELEASE_DIR)) {
  console.error(`✕ Chưa tìm thấy thư mục phát hành: ${RELEASE_DIR}`);
  console.log('Vui lòng chạy "npm run release" trước.');
  process.exit(1);
}

// 1. Khởi tạo thư mục tạm và sao chép bản phát hành
console.log(`[1/5] Sao chép bản phát hành sang thư mục tạm có dấu cách:\n      ${VERIFY_TEMP_DIR} ...`);
if (fs.existsSync(VERIFY_TEMP_DIR)) {
  fs.rmSync(VERIFY_TEMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(VERIFY_TEMP_DIR, { recursive: true });
fs.cpSync(RELEASE_DIR, VERIFY_TEMP_DIR, { recursive: true });
console.log('✓ Sao chép hoàn tất.');

// 2. Cài đặt phụ thuộc sạch (npm install)
console.log('\n[2/5] Cài đặt phụ thuộc sạch trong môi trường tách biệt...');
try {
  execSync('npm install --prefer-offline --no-audit', { cwd: VERIFY_TEMP_DIR, stdio: 'inherit' });
  console.log('✓ Cài đặt dependencies thành công.');
} catch (err) {
  console.error('✕ Lỗi khi cài đặt phụ thuộc trong bản phát hành!');
  process.exit(1);
}

// 3. Biên dịch bản phân phối (npm run build)
console.log('\n[3/5] Biên dịch bản build tĩnh (npm run build)...');
try {
  execSync('npm run build', { cwd: VERIFY_TEMP_DIR, stdio: 'inherit' });
  console.log('✓ Build thành công.');
} catch (err) {
  console.error('✕ Lỗi khi biên dịch bản build tĩnh!');
  process.exit(1);
}

// 4. Chạy toàn bộ kiểm thử tự động (npm test)
console.log('\n[4/5] Chạy toàn bộ kiểm thử tự động (npm test)...');
try {
  execSync('npm test', { cwd: VERIFY_TEMP_DIR, stdio: 'inherit' });
  console.log('✓ 100% kiểm thử đạt chuẩn trong bản phát hành.');
} catch (err) {
  console.error('✕ Có kiểm thử thất bại trong bản phát hành!');
  process.exit(1);
}

// 5. Khởi động preview và kiểm tra endpoint máy chủ
console.log('\n[5/5] Kiểm tra khởi động máy chủ và định tuyến (Port 8010)...');

function testHttpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function verifyServer() {
  const previewServer = await preview({
    root: VERIFY_TEMP_DIR,
    preview: {
      port: 8010,
      host: '127.0.0.1',
    },
  });

  try {
    // 5.1 Kiểm tra tải tệp mẫu
    const sampleRes = await testHttpGet('http://127.0.0.1:8010/samples/file-mau-chuan.xlsx');
    if (sampleRes.statusCode === 200) {
      console.log('✓ Tải tệp mẫu /samples/file-mau-chuan.xlsx thành công (HTTP 200).');
    } else {
      throw new Error(`Tải tệp mẫu thất bại: HTTP ${sampleRes.statusCode}`);
    }

    // 5.2 Kiểm tra SPA rewrite định tuyến trang con
    const spaRes = await testHttpGet('http://127.0.0.1:8010/nap-du-lieu');
    if (spaRes.statusCode === 200 && spaRes.body.includes('<div id="root">')) {
      console.log('✓ SPA rewrite định tuyến trang con /nap-du-lieu hoạt động hoàn hảo.');
    } else {
      throw new Error(`SPA rewrite thất bại: HTTP ${spaRes.statusCode}`);
    }
  } finally {
    previewServer.httpServer.close();
  }
}

verifyServer()
  .then(() => {
    // Dọn dẹp thư mục tạm
    try {
      fs.rmSync(VERIFY_TEMP_DIR, { recursive: true, force: true });
    } catch (_e) {}

    console.log('\n======================================================');
    console.log('  🎉 BẢN PHÁT HÀNH ĐẠT TIÊU CHUẨN XUẤT XẮC 100%!       ');
    console.log('======================================================');
    console.log('Bản đóng gói phát hành độc lập hoàn toàn, không phụ thuộc môi trường cũ.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('✕ Thất bại trong kiểm tra máy chủ:', err.message);
    process.exit(1);
  });

