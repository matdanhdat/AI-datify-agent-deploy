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

const HOTFIX_DIR = path.resolve(ROOT, 'docs', 'screens', 'hotfix_ai_ping');
fs.mkdirSync(HOTFIX_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TARGETS = [
  {
    name: '01_cau_hinh_loi_ping_bad_input.png',
    path: '/cau-hinh?demoPingError=1',
  },
  {
    name: '02_cau_hinh_ket_noi_thanh_cong.png',
    path: '/cau-hinh?demoPingSuccess=1',
  },
  {
    name: '03_chan_doan_5_tac_vu.png',
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

  console.log('[capture] Preview server listening. Beginning capture...');

  try {
    console.log('\n--- BẮT ĐẦU CHỤP ẢNH MÀN HÌNH HOTFIX AI PING ---');
    await captureBatch(TARGETS, HOTFIX_DIR);
    console.log('\n✓ ĐÃ HOÀN TẤT CHỤP ẢNH MÀN HÌNH!');
  } finally {
    console.log('[capture] Stopping preview server...');
    await previewServer.httpServer.close();
  }
}

main().catch((err) => {
  console.error('[capture] Uncaught error:', err);
  process.exit(1);
});

