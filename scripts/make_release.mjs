import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_DIR = path.resolve(__dirname, '..');
const PARENT_DIR = path.resolve(SOURCE_DIR, '..');

const RELEASE_DIR = path.resolve(PARENT_DIR, 'pixel-trading-agent-release');
const ZIP_FILE = path.resolve(PARENT_DIR, 'pixel-trading-agent-release.zip');
const BANG_CHUNG_DIR = path.resolve(PARENT_DIR, 'pixel-trading-agent-bang-chung');

console.log('======================================================');
console.log('  📦 BẮT ĐẦU ĐÓNG GÓI BẢN PHÁT HÀNH (MAKE RELEASE)    ');
console.log('======================================================\n');

// 1. Kiểm tra an toàn trước khi đóng gói
console.log('[1/6] Chạy kiểm tra chất lượng tệp trước khi đóng gói...');
try {
  execSync('npm run predeploy', { cwd: SOURCE_DIR, stdio: 'inherit' });
} catch (err) {
  console.error('✕ Không thể đóng gói do kiểm tra predeploy thất bại!');
  process.exit(1);
}

// 2. Dọn dẹp thư mục đích cũ nếu tồn tại
console.log('\n[2/6] Khởi tạo thư mục phát hành sạch...');
if (fs.existsSync(RELEASE_DIR)) {
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}
if (fs.existsSync(ZIP_FILE)) {
  fs.unlinkSync(ZIP_FILE);
}
if (fs.existsSync(BANG_CHUNG_DIR)) {
  fs.rmSync(BANG_CHUNG_DIR, { recursive: true, force: true });
}

fs.mkdirSync(RELEASE_DIR, { recursive: true });
fs.mkdirSync(BANG_CHUNG_DIR, { recursive: true });

// 3. Quy tắc loại trừ tệp rác và tệp bảo mật
const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.venv',
  '.pytest_cache',
  '.ruff_cache',
  '__pycache__',
]);

const EXCLUDE_EXTENSIONS = new Set([
  '.py',
  '.pyc',
  '.tmp',
  '.log',
]);

const EXCLUDE_FILES = new Set([
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'pytest.ini',
  'run.py',
  '.DS_Store',
  'Thumbs.db',
]);

// Mẫu phát hiện rò rỉ khóa bí mật
const SECRET_REGEX = /AIzaSy[A-Za-z0-9_-]{33}/;

let copiedCount = 0;
let scannedCount = 0;

function copyCleanRecursive(src, dst) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    // Bỏ qua thư mục cấm
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;

      // Xử lý tách docs/screens/ ra thư mục bằng chứng riêng
      if (entry.name === 'screens' && path.basename(src) === 'docs') {
        console.log('  -> Tách riêng thư mục ảnh minh chứng docs/screens/ sang pixel-trading-agent-bang-chung/');
        fs.cpSync(srcPath, path.join(BANG_CHUNG_DIR, 'screens'), { recursive: true });
        continue;
      }

      fs.mkdirSync(dstPath, { recursive: true });
      copyCleanRecursive(srcPath, dstPath);
    } else {
      // Bỏ qua các tệp môi trường bí mật (.env, .env.local, .env.test, ...)
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') {
        console.log(`  -> Bỏ qua tệp cấu hình bí mật: ${entry.name}`);
        continue;
      }

      // Bỏ qua đuôi tệp cấm
      const ext = path.extname(entry.name).toLowerCase();
      if (EXCLUDE_EXTENSIONS.has(ext) || EXCLUDE_FILES.has(entry.name)) {
        continue;
      }

      // Quét kiểm tra khóa bí mật trong tệp văn bản
      scannedCount++;
      const isBinary = /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|xlsx|zip)$/i.test(entry.name);
      if (!isBinary) {
        const content = fs.readFileSync(srcPath, 'utf8');
        if (SECRET_REGEX.test(content)) {
          console.error(`✕ PHÁT HIỆN RÒ RỈ KHÓA BÍ MẬT TẠI: ${srcPath}`);
          process.exit(1);
        }
      }

      fs.copyFileSync(srcPath, dstPath);
      copiedCount++;
    }
  }
}

console.log('\n[3/6] Sao chép mã nguồn sạch và quét bảo mật...');
copyCleanRecursive(SOURCE_DIR, RELEASE_DIR);
console.log(`✓ Đã sao chép ${copiedCount} tệp sạch (quét ${scannedCount} tệp, 0 rò rỉ khóa bí mật).`);

// 4. Sao chép tài liệu đối chứng sang thư mục bằng chứng
console.log('\n[4/6] Tổ chức tài liệu nghiệm thu sang pixel-trading-agent-bang-chung/ ...');
const evidenceFiles = ['BANG_CHUNG.md', 'UI_AUDIT_REPORT.md', 'CONTRACT.md'];
for (const ef of evidenceFiles) {
  const srcF = path.join(SOURCE_DIR, 'docs', ef);
  if (fs.existsSync(srcF)) {
    fs.copyFileSync(srcF, path.join(BANG_CHUNG_DIR, ef));
  }
}
console.log('✓ Thư mục bằng chứng đã được đồng bộ đầy đủ (ảnh chụp, báo cáo đối chiếu, báo cáo UI audit).');

// 5. Nén gói phát hành ZIP thuần túy bằng fflate (Cross-platform in-memory zip)
console.log('\n[5/6] Nén thành tệp lưu trữ pixel-trading-agent-release.zip ...');
try {
  function buildZipObject(dir, base = '') {
    const obj = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        Object.assign(obj, buildZipObject(full, rel));
      } else {
        obj[rel] = new Uint8Array(fs.readFileSync(full));
      }
    }
    return obj;
  }

  const zipEntries = buildZipObject(RELEASE_DIR);
  const zippedBuffer = zipSync(zipEntries, { level: 6 });
  fs.writeFileSync(ZIP_FILE, zippedBuffer);

  const zipStat = fs.statSync(ZIP_FILE);
  console.log(`✓ Đã tạo thành công: ${ZIP_FILE} (${(zipStat.size / (1024 * 1024)).toFixed(2)} MB, ${Object.keys(zipEntries).length} tệp)`);
} catch (err) {
  console.error('✕ Lỗi khi nén tệp zip:', err.message);
  process.exit(1);
}

// 6. Tổng kết
console.log('\n======================================================');
console.log('  🎉 ĐÓNG GÓI BẢN PHÁT HÀNH THÀNH CÔNG RỰC RỠ!         ');
console.log('======================================================');
console.log(`1. Thư mục mã nguồn sạch: ${RELEASE_DIR}`);
console.log(`2. Tệp nén phát hành (.zip): ${ZIP_FILE}`);
console.log(`3. Thư mục bằng chứng hội đồng: ${BANG_CHUNG_DIR}`);
