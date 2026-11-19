import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const P4_DIR = path.resolve(ROOT, 'docs', 'screens', 'P4');
const P5_DIR = path.resolve(ROOT, 'docs', 'screens', 'P5');
fs.mkdirSync(P4_DIR, { recursive: true });
fs.mkdirSync(P5_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const P4_TARGETS = [
  { name: '01_phan_tich_tong_quan.png', path: '/phan-tich?forceState=clean_approved&sample=1' },
  { name: '02_bieu_do_gia_ma.png', path: '/bao-cao?forceState=analyzed&sample=1' },
  { name: '03_the_kpi_chi_tiet.png', path: '/bao-cao?forceState=analyzed&sample=1' },
  { name: '04_bang_17_chi_so.png', path: '/bao-cao?forceState=analyzed&sample=1' },
  { name: '05_tuong_quan_danh_muc.png', path: '/bao-cao?forceState=analyzed&sample=1' },
];

const P5_TARGETS = [
  { name: '01_bao_cao_nhan_dinh_ai.png', path: '/bao-cao?forceState=analyzed&sample=1' },
  { name: '02_cong_duyet_2_da_duyet.png', path: '/bao-cao?forceState=report_approved&sample=1' },
  { name: '03_kiem_chung_doi_chieu.png', path: '/bao-cao?forceState=report_approved&sample=1' },
  { name: '04_xuat_file_san_sang.png', path: '/bao-cao?forceState=report_approved&sample=1' },
  { name: '05_ban_in_pdf_a4.png', path: '/bao-cao?forceState=report_approved&sample=1' },
];

async function captureBatch(targets, targetDir) {
  for (const target of targets) {
    const outPath = path.join(targetDir, target.name);
    const url = `http://127.0.0.1:8000${target.path}`;
    console.log(`[capture] Capturing ${target.name} from ${url}...`);

    try {
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
        '--window-size=1366,768',
        '--hide-scrollbars',
        '--virtual-time-budget=3000',
        `--screenshot=${outPath}`,
        url,
      ]);

      if (fs.existsSync(outPath)) {
        const stats = fs.statSync(outPath);
        console.log(`  -> Saved ${target.name} (${(stats.size / 1024).toFixed(1)} KB)`);
      } else {
        console.error(`  -> Failed to create ${outPath}`);
      }
    } catch (err) {
      console.error(`  -> Error capturing ${target.name}:`, err.message);
    }
  }
}

async function main() {
  console.log('[capture] Starting Vite preview server on port 8000...');
  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: 8000,
      host: '127.0.0.1',
    },
  });

  console.log('[capture] Preview server listening. Beginning P4 and P5 capture...');

  try {
    console.log('\n--- BẮT ĐẦU CHỤP ẢNH MÀN HÌNH P4 ---');
    await captureBatch(P4_TARGETS, P4_DIR);

    console.log('\n--- BẮT ĐẦU CHỤP ẢNH MÀN HÌNH P5 ---');
    await captureBatch(P5_TARGETS, P5_DIR);

    console.log('\n[capture] Toàn bộ ảnh màn hình P4 & P5 đã được chụp thành công!');
  } finally {
    console.log('[capture] Closing preview server...');
    previewServer.httpServer.close();
  }
}

main().catch((err) => {
  console.error('[capture] Error in main:', err);
  process.exit(1);
});

