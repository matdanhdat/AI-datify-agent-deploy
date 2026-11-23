import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

process.env.GEMINI_API_KEY_1 = ' ';
process.env.GEMINI_API_KEY_2 = ' ';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright';
const { chromium } = require(playwrightPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const samplesBusiness = path.join(rootDir, 'samples', 'business');
const reportDir = path.join(rootDir, '..', '_bao-cao-2B');

const vitePath = pathToFileURL(path.resolve(rootDir, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href;
const { preview } = await import(vitePath);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function realClick(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(200);
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function auditPageInteractiveElements(page, pageName, pageUrl) {
  console.log(`\nAuditing interactive elements on ${pageName} (${pageUrl})...`);
  const elements = await page.evaluate(() => {
    const selector = 'button, a, select, input[type="checkbox"], input[type="radio"], [role="button"], [role="tab"]';
    const items = Array.from(document.querySelectorAll(selector));
    return items.map((el, index) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('value') || '').trim().replace(/\s+/g, ' ');
      const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');
      const role = el.getAttribute('role') || tag;
      const type = el.getAttribute('type') || '';
      const className = el.className || '';
      const id = el.id || '';
      const href = el.getAttribute('href') || '';
      const isVisible = el.offsetParent !== null && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';

      return {
        index,
        tag,
        text: text.slice(0, 50),
        role,
        type,
        className: className.slice(0, 60),
        id,
        href,
        disabled,
        isVisible,
      };
    });
  });

  const visibleElements = elements.filter((e) => e.isVisible);
  console.log(`Found ${elements.length} total elements, ${visibleElements.length} visible elements on ${pageName}`);
  return {
    pageName,
    pageUrl,
    total: elements.length,
    visible: visibleElements.length,
    elements: visibleElements,
  };
}

async function main() {
  console.log('=== STARTING DEAD BUTTONS AUDIT (PHẦN 2) ===');
  const previewServer = await preview({
    root: rootDir,
    preview: { port: 8093, host: '127.0.0.1' },
  });

  const baseUrl = 'http://127.0.0.1:8093';
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const auditResults = {
    pages: [],
    deadButtonsFound: 0,
    deadButtons: [],
  };

  try {
    // 1. /nap-du-lieu
    await page.goto(`${baseUrl}/nap-du-lieu`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const p1 = await auditPageInteractiveElements(page, 'Trang Nạp dữ liệu', '/nap-du-lieu');
    auditResults.pages.push(p1);

    // Upload sample file to proceed through business workflow
    const retailCsv = path.join(samplesBusiness, 'du-lieu-test-ban-le.csv');
    await page.locator('input[type="file"]').setInputFiles(retailCsv);
    await page.waitForTimeout(800);

    // 2. /lam-sach
    const toClean = page.locator('button:has-text("Tiếp tục làm sạch")').first();
    await realClick(page, toClean);
    await page.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await page.waitForTimeout(1000);
    const p2 = await auditPageInteractiveElements(page, 'Trang Làm sạch (Cổng 1)', '/lam-sach');
    auditResults.pages.push(p2);

    // 3. /trao-doi
    const toExchange = page.locator('button:has-text("Duyệt và tiếp tục")').first();
    await realClick(page, toExchange);
    await page.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await page.waitForTimeout(1000);
    const p3 = await auditPageInteractiveElements(page, 'Trang Trao đổi (Chọn chỉ số)', '/trao-doi');
    auditResults.pages.push(p3);

    // 4. /phan-tich
    const toAnalyze = page.locator('button:has-text("Phân tích các chỉ số đã chọn")').first();
    await realClick(page, toAnalyze);
    await page.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await page.waitForTimeout(1500);
    const p4 = await auditPageInteractiveElements(page, 'Trang Phân tích', '/phan-tich');
    auditResults.pages.push(p4);

    // 5. /bao-cao
    const toReport = page.locator('button:has-text("Xem báo cáo")').first();
    await realClick(page, toReport);
    await page.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await page.waitForTimeout(1500);
    const p5 = await auditPageInteractiveElements(page, 'Trang Báo cáo', '/bao-cao');
    auditResults.pages.push(p5);

    // Save results
    const outJson = path.join(reportDir, 'dead_buttons_report.json');
    fs.writeFileSync(outJson, JSON.stringify(auditResults, null, 2), 'utf-8');
    console.log(`\nAudit saved to: ${outJson}`);

    // Summary
    const totalVisible = auditResults.pages.reduce((acc, p) => acc + p.visible, 0);
    console.log(`\nTotal interactive controls inspected across 5 pages: ${totalVisible}`);
    console.log(`Dead buttons found: ${auditResults.deadButtonsFound}`);

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await browser.close();
    await previewServer.close();
  }
}

main().catch(console.error);
