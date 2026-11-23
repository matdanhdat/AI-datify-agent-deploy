import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright';
const { chromium } = require(playwrightPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const vitePath = pathToFileURL(path.resolve(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href;
const { preview } = await import(vitePath);

async function debug() {
  const targetPort = 8093;
  const server = await preview({
    root: ROOT,
    preview: { port: targetPort, host: '127.0.0.1' },
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(ROOT, 'public', 'samples', 'file-mau-chuan.csv'));
    await page.waitForTimeout(1500);

    console.log('--- BUTTONS ON /nap-du-lieu ---');
    const buttons = await page.locator('button').allInnerTexts();
    console.log(buttons);

    console.log('--- ALL TEXT ON /nap-du-lieu ---');
    const bodyText = await page.locator('body').innerText();
    console.log(bodyText.slice(0, 1500));

    const shotPath = path.join(ROOT, '..', '_bao-cao-2A1', 'debug_case9_screen.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log('Screenshot saved to:', shotPath);
  } finally {
    await browser.close();
    await server.close();
  }
}

debug().catch(console.error);
