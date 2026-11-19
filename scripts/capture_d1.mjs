import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function capture() {
  console.log('======================================================');
  console.log('  📸 CHỤP ẢNH MINH CHỨNG GIAO DIỆN (D1a, D1b, D1c)    ');
  console.log('======================================================\n');

  const dirD1a = path.join(ROOT, 'docs', 'screens', 'D1a');
  const dirD1b = path.join(ROOT, 'docs', 'screens', 'D1b');
  const dirD1c = path.join(ROOT, 'docs', 'screens', 'D1c');

  fs.mkdirSync(dirD1a, { recursive: true });
  fs.mkdirSync(dirD1b, { recursive: true });
  fs.mkdirSync(dirD1c, { recursive: true });

  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: 8000,
      host: '127.0.0.1',
    },
  });

  const capturedFiles = [];

  try {
    // 1. D1a Screenshots
    console.log('[1/3] Đang chụp D1a (Sửa nút lặp Topbar & Chữ đè UploadPage)...');
    const d1aTargets = [
      { name: 'd1a_topbar_home_1366.png', path: '/', width: 1366, height: 768 },
      { name: 'd1a_topbar_upload_1366.png', path: '/nap-du-lieu', width: 1366, height: 768 },
      { name: 'd1a_topbar_clean_1366.png', path: '/lam-sach?forceState=cleaning_review&sample=1', width: 1366, height: 768 },
      { name: 'd1a_topbar_report_1366.png', path: '/bao-cao?forceState=report_approved&sample=1', width: 1366, height: 768 },
      { name: 'd1a_upload_sample_button_1280.png', path: '/nap-du-lieu', width: 1280, height: 720 },
      { name: 'd1a_upload_sample_button_1366.png', path: '/nap-du-lieu', width: 1366, height: 768 },
      { name: 'd1a_upload_sample_button_1920.png', path: '/nap-du-lieu', width: 1920, height: 1080 },
    ];

    for (const t of d1aTargets) {
      const outPath = path.join(dirD1a, t.name);
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
        `--window-size=${t.width},${t.height}`,
        '--hide-scrollbars',
        '--virtual-time-budget=2500',
        `--screenshot=${outPath}`,
        `http://127.0.0.1:8000${t.path}`,
      ]);
      const hash = sha256File(outPath);
      capturedFiles.push({ folder: 'D1a', name: t.name, hash, path: outPath });
      console.log(`  ✓ D1a: ${t.name} (SHA-256: ${hash.slice(0, 16)}...)`);
    }

    // 2. D1b Screenshots
    console.log('\n[2/3] Đang chụp D1b (Thương hiệu Datify AI Agent, Light Theme, Slogan 3D, 5 Thẻ)...');
    const d1bTargets = [
      { name: 'd1b_homepage_light_1366.png', path: '/', width: 1366, height: 768 },
      { name: 'd1b_homepage_light_1920.png', path: '/', width: 1920, height: 1080 },
      { name: 'd1b_sidebar_logo_analyst.png', path: '/cau-hinh', width: 1366, height: 768 },
      { name: 'd1b_five_steps_workflow.png', path: '/tien-trinh?forceState=report_approved&sample=1', width: 1920, height: 1080 },
      { name: 'd1b_style_guide_palette.png', path: '/thu-vien-giao-dien', width: 1366, height: 768 },
    ];

    for (const t of d1bTargets) {
      const outPath = path.join(dirD1b, t.name);
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
        `--window-size=${t.width},${t.height}`,
        '--hide-scrollbars',
        '--virtual-time-budget=2500',
        `--screenshot=${outPath}`,
        `http://127.0.0.1:8000${t.path}`,
      ]);
      const hash = sha256File(outPath);
      capturedFiles.push({ folder: 'D1b', name: t.name, hash, path: outPath });
      console.log(`  ✓ D1b: ${t.name} (SHA-256: ${hash.slice(0, 16)}...)`);
    }

    // 3. D1c Screenshots
    console.log('\n[3/3] Đang chụp D1c (Bot Launcher, Speech Bubble, Chat Dock, Z-index)...');
    const d1cTargets = [
      { name: 'd1c_launcher_with_bubble_1366.png', path: '/', width: 1366, height: 768 },
      { name: 'd1c_launcher_with_bubble_1920.png', path: '/', width: 1920, height: 1080 },
      { name: 'd1c_launcher_no_bubble_1366.png', path: '/?noBubble=1', width: 1366, height: 768 },
      { name: 'd1c_chat_dock_open_1366.png', path: '/?chat=open&demoChat=metric', width: 1366, height: 768 },
      { name: 'd1c_chat_dock_open_1920.png', path: '/?chat=open&demoChat=metric', width: 1920, height: 1080 },
      { name: 'd1c_modal_over_launcher.png', path: '/?demoConfirm=1', width: 1366, height: 768 },
      { name: 'd1c_narrow_viewport_800.png', path: '/', width: 800, height: 600 },
    ];

    for (const t of d1cTargets) {
      const outPath = path.join(dirD1c, t.name);
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
        `--window-size=${t.width},${t.height}`,
        '--hide-scrollbars',
        '--virtual-time-budget=2500',
        `--screenshot=${outPath}`,
        `http://127.0.0.1:8000${t.path}`,
      ]);
      const hash = sha256File(outPath);
      capturedFiles.push({ folder: 'D1c', name: t.name, hash, path: outPath });
      console.log(`  ✓ D1c: ${t.name} (SHA-256: ${hash.slice(0, 16)}...)`);
    }

    console.log('\n======================================================');
    console.log('  🔍 KIỂM TRA TÍNH TOÀN VẸN VÀ ĐỘC NHẤT CỦA MÃ BĂM   ');
    console.log('======================================================');
    const hashSet = new Set();
    let duplicates = 0;
    for (const f of capturedFiles) {
      if (hashSet.has(f.hash)) {
        duplicates++;
        console.warn(`  [CẢNH BÁO TRÙNG HASH]: ${f.folder}/${f.name}`);
      } else {
        hashSet.add(f.hash);
      }
      console.log(`  ${f.folder}/${f.name.padEnd(35)} | SHA-256: ${f.hash}`);
    }

    console.log(`\nTổng số ảnh đã chụp: ${capturedFiles.length}`);
    console.log(`Số mã băm độc nhất: ${hashSet.size} / ${capturedFiles.length}`);
    if (duplicates === 0) {
      console.log('✓ 100% CÁC ẢNH CHỤP CÓ MÃ BĂM ĐỘC NHẤT (KHÔNG TRÙNG LẶP)!');
    }
  } finally {
    previewServer.httpServer.close();
  }
}

capture().catch((err) => {
  console.error('Lỗi khi chụp ảnh:', err);
  process.exit(1);
});
