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
const SCREENS_DIR = path.resolve(ROOT, 'docs', 'screens', 'P0.5');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TARGETS = [
  { name: 'home_1366.png', path: '/' },
  { name: 'upload_1366.png', path: '/nap-du-lieu' },
  { name: 'config_1366.png', path: '/cau-hinh' },
  { name: 'history_1366.png', path: '/lich-su' },
  { name: 'agent_1366.png', path: '/tien-trinh' },
  { name: 'ui_library_1366.png', path: '/thu-vien-giao-dien' },
  { name: 'locked_clean_modal_1366.png', path: '/lam-sach' },
];

async function main() {
  if (!fs.existsSync(SCREENS_DIR)) {
    fs.mkdirSync(SCREENS_DIR, { recursive: true });
  }

  console.log('[capture] Starting Vite preview in-process on port 8000...');
  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: 8000,
      host: '127.0.0.1',
    },
  });

  console.log('[capture] Preview server listening. Beginning capture...');

  try {
    for (const target of TARGETS) {
      const outPath = path.join(SCREENS_DIR, target.name);
      const url = `http://127.0.0.1:8000${target.path}`;
      console.log(`[capture] Capturing ${target.name} from ${url}...`);

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
    }
    console.log('[capture] All screenshots captured successfully!');
  } finally {
    console.log('[capture] Closing preview server...');
    previewServer.httpServer.close();
  }
}

main().catch((err) => {
  console.error('[capture] Error:', err);
  process.exit(1);
});
