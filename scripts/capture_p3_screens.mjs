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

const P3_DIR = path.resolve(ROOT, 'docs', 'screens', 'P3');
fs.mkdirSync(P3_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const P3_TARGETS = [
  { name: '01_clean_profiling.png', path: '/lam-sach?forceState=cleaning_review&sample=1' },
  { name: '02_clean_proposals.png', path: '/lam-sach?forceState=cleaning_review&sample=1' },
  { name: '03_affected_rows_modal.png', path: '/lam-sach?forceState=cleaning_review&sample=1&showModal=true' },
  { name: '04_before_after_diff.png', path: '/lam-sach?forceState=cleaning_review&sample=1&tab=diff' },
  { name: '05_constraint_violation.png', path: '/lam-sach?forceState=cleaning_review&sample=1&dropOutliers=true' },
  { name: '06_confirm_approval_dialog.png', path: '/lam-sach?forceState=cleaning_review&sample=1&showConfirm=true' },
  { name: '07_clean_approved_readonly.png', path: '/lam-sach?forceState=clean_approved&sample=1&approved=true' },
];

async function captureBatch(targets, targetDir) {
  for (const target of targets) {
    const outPath = path.join(targetDir, target.name);
    const url = `http://127.0.0.1:8000${target.path}`;
    console.log(`[capture] Capturing ${target.name} from ${url}...`);

    try {
      const res = await execFileAsync(CHROME_PATH, [
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

      if (res.stdout) console.log('stdout:', res.stdout);
      if (res.stderr) console.log('stderr:', res.stderr);

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

  console.log('[capture] Preview server listening. Beginning P3 capture...');

  try {
    await captureBatch(P3_TARGETS, P3_DIR);
    console.log('\n[capture] All P3 screenshots captured successfully!');
  } finally {
    console.log('[capture] Closing preview server...');
    previewServer.httpServer.close();
  }
}

main().catch((err) => {
  console.error('[capture] Error in main:', err);
  process.exit(1);
});
