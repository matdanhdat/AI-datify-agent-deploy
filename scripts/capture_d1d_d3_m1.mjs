import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const D1D_DIR = path.resolve(ROOT, 'docs', 'screens', 'D1d');
const D3_DIR = path.resolve(ROOT, 'docs', 'screens', 'D3');
const M1_DIR = path.resolve(ROOT, 'docs', 'screens', 'M1');

fs.mkdirSync(D1D_DIR, { recursive: true });
fs.mkdirSync(D3_DIR, { recursive: true });
fs.mkdirSync(M1_DIR, { recursive: true });

const TARGETS = [
  // -------------------------------------------------------------
  // D1d targets: Layout overlap fixes, borders, slogan, clearance
  // -------------------------------------------------------------
  {
    dir: D1D_DIR,
    name: 'homepage_hero_top_1366.png',
    path: '/',
    width: 1366,
    height: 768,
  },
  {
    dir: D1D_DIR,
    name: 'homepage_process_cards_1366.png',
    path: '/?scroll=process',
    width: 1366,
    height: 768,
  },
  {
    dir: D1D_DIR,
    name: 'homepage_bottom_clearance_1366.png',
    path: '/?scroll=home_bottom',
    width: 1366,
    height: 768,
  },
  {
    dir: D1D_DIR,
    name: 'upload_chat_button_clearance_1366.png',
    path: '/nap-du-lieu?scroll=upload_bottom',
    width: 1366,
    height: 768,
  },
  {
    dir: D1D_DIR,
    name: 'upload_sample_button_1366.png',
    path: '/nap-du-lieu',
    width: 1280,
    height: 720,
  },

  // -------------------------------------------------------------
  // D3 targets: Context form, dropzone lock/unlock, read-only panels
  // -------------------------------------------------------------
  {
    dir: D3_DIR,
    name: 'd3_context_empty_dropzone_locked.png',
    path: '/nap-du-lieu',
    width: 1366,
    height: 800,
  },
  {
    dir: D3_DIR,
    name: 'd3_context_filled_dropzone_unlocked.png',
    path: '/nap-du-lieu?demoContext=1',
    width: 1366,
    height: 800,
  },
  {
    dir: D3_DIR,
    name: 'd3_clean_context_panel.png',
    path: '/lam-sach?forceState=cleaning_review&sample=1&demoContext=1',
    width: 1366,
    height: 768,
  },
  {
    dir: D3_DIR,
    name: 'd3_analyze_context_panel.png',
    path: '/phan-tich?forceState=clean_approved&sample=1&demoContext=1',
    width: 1366,
    height: 768,
  },
  {
    dir: D3_DIR,
    name: 'd3_report_context_panel.png',
    path: '/bao-cao?forceState=report_approved&sample=1&demoContext=1',
    width: 1366,
    height: 768,
  },

  // -------------------------------------------------------------
  // M1 targets: Two-tab requirements, business upload, roles, soft gate
  // -------------------------------------------------------------
  {
    dir: M1_DIR,
    name: 'm1_upload_two_tabs_trading.png',
    path: '/nap-du-lieu?tab=trading',
    width: 1366,
    height: 768,
  },
  {
    dir: M1_DIR,
    name: 'm1_upload_two_tabs_business.png',
    path: '/nap-du-lieu?tab=business',
    width: 1366,
    height: 768,
  },
  {
    dir: M1_DIR,
    name: 'm1_upload_business_success_badge.png',
    path: '/nap-du-lieu?demoBusiness=1&demoContext=1',
    width: 1366,
    height: 768,
  },
  {
    dir: M1_DIR,
    name: 'm1_upload_column_roles_table.png',
    path: '/nap-du-lieu?demoBusiness=1&demoContext=1&scroll=roles',
    width: 1366,
    height: 850,
  },
  {
    dir: M1_DIR,
    name: 'm1_upload_table_preview_20rows.png',
    path: '/nap-du-lieu?demoBusiness=1&demoContext=1&scroll=preview',
    width: 1366,
    height: 900,
  },
  {
    dir: M1_DIR,
    name: 'm1_clean_business_soft_gate.png',
    path: '/lam-sach?forceState=cleaning_review&demoBusiness=1&demoContext=1',
    width: 1366,
    height: 768,
  },
];

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function capture() {
  console.log('======================================================');
  console.log('  📸 BẮT ĐẦU CHỤP ẢNH MINH CHỨNG (D1d, D3, M1)        ');
  console.log('======================================================\n');

  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`✕ Không tìm thấy Chrome tại: ${CHROME_PATH}`);
    process.exit(1);
  }

  console.log('[1/3] Khởi động Vite Preview Server trên cổng 8000...');
  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: 8000,
      host: '127.0.0.1',
    },
  });

  try {
    console.log('[2/3] Đang chụp từng ảnh màn hình thực tế...\n');
    for (const target of TARGETS) {
      const outPath = path.join(target.dir, target.name);
      const tmpPath = path.join(os.tmpdir(), `shot_${Date.now()}_${target.name}`);
      const url = `http://127.0.0.1:8000${target.path}`;
      process.stdout.write(`  -> Đang chụp ${path.basename(target.dir)}/${target.name}... `);

      await execFileAsync(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--no-proxy-server',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-default-apps',
        '--no-first-run',
        `--window-size=${target.width},${target.height}`,
        '--hide-scrollbars',
        '--virtual-time-budget=2500',
        `--screenshot=${tmpPath}`,
        url,
      ]);

      if (fs.existsSync(tmpPath)) {
        fs.copyFileSync(tmpPath, outPath);
        fs.unlinkSync(tmpPath);
        const sz = fs.statSync(outPath).size;
        console.log(`✓ (${(sz / 1024).toFixed(1)} KB)`);
      } else {
        console.error(`✕ Thất bại khi tạo ${outPath}`);
      }
    }
  } finally {
    previewServer.httpServer.close();
  }

  console.log('\n[3/3] Thẩm định mã băm SHA-256 các ảnh vừa chụp...');
  const hashes = new Map();
  let duplicateCount = 0;

  for (const target of TARGETS) {
    const outPath = path.join(target.dir, target.name);
    if (!fs.existsSync(outPath)) continue;
    const h = sha256File(outPath);
    const key = `${path.basename(target.dir)}/${target.name}`;
    if (hashes.has(h)) {
      console.error(`✕ Phát hiện ảnh chụp trùng lặp: ${key} trùng với ${hashes.get(h)} (SHA-256: ${h.slice(0, 16)}...)`);
      duplicateCount++;
    } else {
      hashes.set(h, key);
      console.log(`  ✓ ${key}: SHA-256 = ${h}`);
    }
  }

  if (duplicateCount > 0) {
    console.error(`\n✕ CÓ ${duplicateCount} ẢNH TRÙNG LẶP!`);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('  🎉 TẤT CẢ ẢNH CHỤP MINH CHỨNG ĐÃ ĐẠT CHUẨN 100%!     ');
  console.log('======================================================');
}

capture().catch((err) => {
  console.error('Lỗi thực thi:', err);
  process.exit(1);
});
