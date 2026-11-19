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

const P6_DIR = path.resolve(ROOT, 'docs', 'screens', 'P6');
fs.mkdirSync(P6_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const P6_TARGETS = [
  {
    name: '01_tro_ly_chat_goi_y.png',
    path: '/bao-cao?forceState=report_approved&sample=1&chat=open&demoChat=suggest',
  },
  {
    name: '02_tro_ly_giai_thich_chi_so.png',
    path: '/bao-cao?forceState=report_approved&sample=1&chat=open&demoChat=metric',
  },
  {
    name: '03_tro_ly_tu_choi_sua_gia.png',
    path: '/bao-cao?forceState=report_approved&sample=1&chat=open&demoChat=mutation',
  },
  {
    name: '04_tro_ly_giai_thich_loi_file.png',
    path: '/nap-du-lieu?chat=open&demoChat=rejection',
  },
  {
    name: '05_ke_hoach_phan_tich_rieng.png',
    path: '/phan-tich?forceState=clean_approved&sample=1&demoPlan=1',
  },
  {
    name: '06_ket_qua_phan_tich_rieng_bao_cao.png',
    path: '/bao-cao?forceState=report_approved&sample=1&demoCustom=1',
  },
  {
    name: '07_chan_doan_ai_5_tac_vu.png',
    path: '/cau-hinh?demoDiag=1',
  },
];

async function captureBatch(targets, targetDir) {
  for (const target of targets) {
    const outPath = path.join(targetDir, target.name);
    const url = `http://127.0.0.1:8000${target.path}`;
    console.log(`[capture] Capturing ${target.name} from ${url}...`);

    try {
      const result = await execFileAsync(CHROME_PATH, [
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
      if (result.stdout) console.log('stdout:', result.stdout);
      if (result.stderr) console.log('stderr:', result.stderr);

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

  console.log('[capture] Preview server listening. Beginning P6 capture...');

  try {
    console.log('\n--- BẮT ĐẦU CHỤP ẢNH MÀN HÌNH P6 ---');
    await captureBatch(P6_TARGETS, P6_DIR);
    console.log('\n[capture] Toàn bộ ảnh màn hình P6 đã được chụp thành công!');
  } finally {
    console.log('[capture] Closing preview server...');
    previewServer.httpServer.close();
  }
}

main().catch((err) => {
  console.error('[capture] Error in main:', err);
  process.exit(1);
});
