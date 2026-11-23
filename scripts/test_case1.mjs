import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright';
const { chromium } = require(playwrightPath);

import { pathToFileURL } from 'node:url';

const ROOT = 'C:/Users/ADMIN/Downloads/Antigravity_IDE - Copy/pixel-trading-agent';

async function test() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  // start vite preview server on port 8089
  const viteUrl = pathToFileURL(path.join(ROOT, 'node_modules/vite/dist/node/index.js')).href;
  const { preview } = await import(viteUrl);
  const server = await preview({
    root: ROOT,
    preview: { port: 8089, host: '127.0.0.1' },
  });

  try {
    await page.goto('http://127.0.0.1:8089/nap-du-lieu', { waitUntil: 'networkidle' });
    
    const ta = page.locator('textarea').first();
    await ta.fill('Phân tích bán lẻ');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(ROOT, 'samples/business/du-lieu-test-ban-le.csv'));
    await page.waitForTimeout(600);
    
    await page.locator('button:has-text("Tiếp tục làm sạch")').click();
    await page.waitForURL('**/lam-sach', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    await page.locator('input[placeholder*="tên người duyệt"]').fill('Ban Giám Khảo');
    await page.locator('button:has-text("Duyệt và tiếp tục")').click();
    await page.waitForURL('**/trao-doi', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    console.log('Current URL:', page.url());
    const badges = await page.locator('.pixel-badge').allInnerTexts();
    console.log('All badges in page:', badges);
    
    const textCount = await page.locator('text=TÍNH ĐƯỢC').count();
    console.log('text=TÍNH ĐƯỢC count:', textCount);

    const exactCount = await page.getByText('TÍNH ĐƯỢC', { exact: true }).count();
    console.log('exact TÍNH ĐƯỢC count:', exactCount);

    const checkedBoxes = await page.locator('input[type="checkbox"]:checked').count();
    console.log('Checked boxes count:', checkedBoxes);
  } finally {
    await browser.close();
    await server.close();
  }
}

test().catch(e => console.error(e));
