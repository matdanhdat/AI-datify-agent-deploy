import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

process.env.GEMINI_API_KEY_1 = ' ';
process.env.GEMINI_API_KEY_2 = ' ';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright';
const { chromium } = require(playwrightPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR_0C2 = path.resolve(ROOT, '..', '_bao-cao-2A1', 'screens_0c2');
const OUT_DIR_0C3 = path.resolve(ROOT, '..', '_bao-cao-2A1', 'screens_0c3');

if (!fs.existsSync(OUT_DIR_0C2)) fs.mkdirSync(OUT_DIR_0C2, { recursive: true });
if (!fs.existsSync(OUT_DIR_0C3)) fs.mkdirSync(OUT_DIR_0C3, { recursive: true });

const vitePath = pathToFileURL(path.resolve(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href;
const { preview } = await import(vitePath);

async function realClick(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(200);
  const box = await locator.boundingBox();
  if (!box) throw new Error('Cannot find boundingBox for click');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function fillQuestionAndUpload(page, question, csvFile) {
  const newBtn = page.locator('button:has-text("Phiên mới")');
  if (await newBtn.isVisible().catch(() => false)) {
    await realClick(page, newBtn);
    await page.waitForTimeout(400);

    const confirmNewBtn = page.locator('button:has-text("Tạo phiên mới")');
    if (await confirmNewBtn.isVisible().catch(() => false)) {
      await realClick(page, confirmNewBtn);
      await page.waitForTimeout(400);
    }
  }

  const textareas = page.locator('textarea');
  const taCount = await textareas.count();
  let qBox = page.locator('textarea[placeholder*="Mỗi dòng một câu hỏi"]');
  if (!(await qBox.isVisible().catch(() => false)) && taCount >= 2) qBox = textareas.nth(1);
  else if (!(await qBox.isVisible().catch(() => false)) && taCount === 1) qBox = textareas.nth(0);
  if (await qBox.isVisible().catch(() => false)) {
    await qBox.fill(question);
    await page.locator('body').click();
    await page.waitForTimeout(300);
  }

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(csvFile);
  await page.waitForTimeout(800);
}

function getSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function run() {
  const targetPort = 8089;
  const server = await preview({
    root: ROOT,
    preview: { port: targetPort, host: '127.0.0.1' },
  });
  console.log(`Preview server listening on http://127.0.0.1:${targetPort}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-proxy-server'],
  });

  // ==========================================
  // PART 1: 0c.3 - cot-la-6-dong at Gate 1
  // ==========================================
  console.log('\n--- CAPTURING 0c.3: cot-la-6-dong at Gate 1 (1280x720 & 1366x768) ---');
  const viewports = [
    { width: 1280, height: 720, name: '1280x720' },
    { width: 1366, height: 768, name: '1366x768' },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

    await fillQuestionAndUpload(page, 'Phân tích cot-la-6-dong', path.join(ROOT, 'samples', 'business', 'cot-la-6-dong.csv'));

    const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
    await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);
    await realClick(page, proceedBtn);
    await page.waitForURL('**/lam-sach**', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Capture Gate 1 unconfirmed panel
    const outPathFull = path.join(OUT_DIR_0C3, `cot_la_gate1_${vp.name}.png`);
    await page.screenshot({ path: outPathFull });
    console.log(`Saved ${outPathFull}: SHA256 = ${getSha256(outPathFull)}`);

    // Capture specific card for Doanh thu / Khoan thu KH
    const revCard = page.locator('text=Doanh thu:').locator('xpath=ancestor::div[contains(@style, "border: 1px solid")][1]').first();
    if (await revCard.isVisible()) {
      const outPathCard = path.join(OUT_DIR_0C3, `cot_la_rev_card_${vp.name}.png`);
      await revCard.screenshot({ path: outPathCard });
      console.log(`Saved ${outPathCard}: SHA256 = ${getSha256(outPathCard)}`);
    }

    await page.close();
  }

  // ==========================================
  // PART 2: 0c.2 & 0c.1 - retail at Phân tích
  // ==========================================
  console.log('\n--- CAPTURING 0c.2: retail charts and 0c.1 confidence badge ---');
  const pageRetail = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await pageRetail.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

  await fillQuestionAndUpload(pageRetail, 'Phân tích bán lẻ', path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv'));

  const proceedBtnRetail = pageRetail.locator('button:has-text("Tiếp tục làm sạch")');
  await proceedBtnRetail.waitFor({ state: 'visible', timeout: 10000 });
  await pageRetail.waitForTimeout(500);
  await realClick(pageRetail, proceedBtnRetail);
  await pageRetail.waitForURL('**/lam-sach**', { timeout: 10000 });
  await pageRetail.waitForTimeout(1000);

  // Approve Gate 1
  const approveBtn = pageRetail.locator('button:has-text("Duyệt và tiếp tục")');
  await approveBtn.waitFor({ state: 'visible', timeout: 10000 });
  await realClick(pageRetail, approveBtn);
  await pageRetail.waitForURL('**/phan-tich**', { timeout: 15000 });

  // Wait for analysis result and category metric block
  await pageRetail.waitForSelector('#chart_biz_channel_revenue', { timeout: 15000 });
  // Wait for animations to completely settle
  await pageRetail.waitForTimeout(2000);

  // 1. Capture Confidence Badge & Header of Category Block
  const badgeLocator = pageRetail.locator('text=ĐỘ TIN CẬY: CAO').first();
  if (await badgeLocator.isVisible()) {
    const outBadge = path.join(OUT_DIR_0C2, 'retail_confidence_badge_cao.png');
    await badgeLocator.screenshot({ path: outBadge });
    console.log(`Saved ${outBadge}: SHA256 = ${getSha256(outBadge)}`);
  }

  // 2. Capture each chart card
  const chartIds = [
    { id: 'chart_biz_channel_revenue', name: 'retail_chart_channel_revenue' },
    { id: 'chart_biz_region_revenue', name: 'retail_chart_region_revenue' },
    { id: 'chart_biz_month_trend', name: 'retail_chart_month_trend' },
    { id: 'chart_biz_revenue_growth', name: 'retail_chart_revenue_growth' },
    { id: 'chart_biz_product_revenue', name: 'retail_chart_product_revenue' },
    { id: 'chart_biz_channel_margin', name: 'retail_chart_channel_margin' },
    { id: 'chart_biz_product_margin', name: 'retail_chart_product_margin' },
  ];

  for (const c of chartIds) {
    const el = pageRetail.locator(`#${c.id}`).last();
    if (await el.isVisible()) {
      await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await pageRetail.waitForTimeout(300);
      const outChart = path.join(OUT_DIR_0C2, `${c.name}.png`);
      await el.screenshot({ path: outChart });
      console.log(`Saved ${outChart}: SHA256 = ${getSha256(outChart)}`);
    } else {
      console.error(`Chart #${c.id} not visible!`);
    }
  }

  // Also capture channel product matrix card
  const matrixCard = pageRetail.locator('text=MA TRẬN KÊNH × SẢN PHẨM').locator('xpath=ancestor::div[contains(@style, "border: 1px solid")][1]').first();
  if (await matrixCard.isVisible()) {
    const outMatrix = path.join(OUT_DIR_0C2, 'retail_card_matrix.png');
    await matrixCard.screenshot({ path: outMatrix });
    console.log(`Saved ${outMatrix}: SHA256 = ${getSha256(outMatrix)}`);
  }

  await pageRetail.close();
  await browser.close();
  await server.close();
  console.log('\nAll 0c screens captured successfully!');
}

run().catch((err) => {
  console.error('Error capturing screens:', err);
  process.exit(1);
});
