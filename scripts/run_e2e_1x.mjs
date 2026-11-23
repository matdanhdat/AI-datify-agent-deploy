import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright';
const { chromium } = require(playwrightPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(ROOT, '..', '1X-out');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:8089';

const TEST_FILES = [
  {
    key: 'ban-le',
    csvFile: path.resolve(ROOT, 'samples/business/du-lieu-test-ban-le.csv'),
    question: 'Doanh thu theo kênh bán thay đổi thế nào?',
  },
  {
    key: 'thieu-gia-von',
    csvFile: path.resolve(ROOT, 'samples/business/thieu-gia-von-thieu-san-pham.csv'),
    question: 'Doanh thu theo khu vực ra sao?',
  },
  {
    key: 'dien-tu',
    csvFile: path.resolve(ROOT, 'samples/business/dien-tu-thieu-loi-nhuan.csv'),
    question: 'Biên lợi nhuận theo kênh và sản phẩm ra sao?',
  },
  {
    key: 'o-to',
    csvFile: path.resolve(ROOT, 'samples/business/o-to-thieu-kenh-thieu-gia-von.csv'),
    question: 'Doanh thu theo khu vực và theo tháng ra sao?',
  },
];

async function run() {
  console.log('Launching Chrome via Playwright...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  });

  for (const item of TEST_FILES) {
    console.log(`\n======================================================================`);
    console.log(`BẮT ĐẦU LUỒNG KIỂM THỬ: ${item.key} (${path.basename(item.csvFile)})`);
    console.log(`======================================================================`);

    const page = await context.newPage();

    // Step 0: Fresh session
    await page.goto(`${BASE_URL}/nap-du-lieu`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Click "Phiên mới" if available
    const newSessionBtn = page.locator('button:has-text("Phiên mới")');
    if (await newSessionBtn.isVisible()) {
      await newSessionBtn.click();
      await page.waitForTimeout(800);
    }

    // Step 1: Input question into Frame 1 textarea
    console.log(`[1] Nhập câu hỏi phân tích: "${item.question}"`);
    const textareas = page.locator('textarea');
    const taCount = await textareas.count();
    let qBox = page.locator('textarea[placeholder*="Mỗi dòng một câu hỏi"]');
    if (!(await qBox.isVisible()) && taCount >= 2) {
      qBox = textareas.nth(1);
    } else if (!(await qBox.isVisible()) && taCount === 1) {
      qBox = textareas.nth(0);
    }

    await qBox.fill(item.question);
    await page.locator('body').click();
    await page.waitForTimeout(500);

    // Step 2: Upload CSV
    console.log(`[2] Nạp file CSV: ${item.csvFile}`);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(item.csvFile);

    // Wait for check results
    console.log(`  -> Chờ kết quả kiểm tra...`);
    await page.waitForSelector('text=HỒ SƠ DỮ LIỆU', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Capture Upload Page
    const txtUpload = path.join(OUT_DIR, `${item.key}-01-upload.txt`);
    const pngUpload = path.join(OUT_DIR, `${item.key}-01-upload.png`);
    const innerUpload = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(txtUpload, innerUpload, 'utf-8');
    await page.screenshot({ path: pngUpload, fullPage: false });
    console.log(`✓ Đã lưu ${path.basename(pngUpload)} (${fs.statSync(pngUpload).size} bytes)`);

    // Step 3: Go to Clean Page
    console.log(`[3] Tiếp tục làm sạch...`);
    const toCleanBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
    await toCleanBtn.click();
    await page.waitForURL('**/lam-sach**', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // Mở modal từng thẻ làm sạch để ghi nhận chi tiết trước/sau
    const viewButtons = page.locator('button:has-text("Xem các dòng ảnh hưởng")');
    const btnCount = await viewButtons.count();
    console.log(`  -> Tìm thấy ${btnCount} thẻ có thể xem dòng ảnh hưởng`);
    let modalTextLogs = [];
    for (let b = 0; b < btnCount; b++) {
      const btn = viewButtons.nth(b);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(600);
        const modal = page.locator('div[role="dialog"]');
        if (await modal.isVisible()) {
          const mTxt = await modal.innerText();
          modalTextLogs.push(`=== MODAL THẺ ${b + 1} ===\n${mTxt}\n`);
          const closeBtn = modal.locator('button').filter({ hasText: /^(Đóng|✕)$/ });
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(400);
        }
      }
    }
    fs.writeFileSync(path.join(OUT_DIR, `${item.key}-02-modal.txt`), modalTextLogs.join('\n'), 'utf-8');

    // Capture Clean Page (Tab 1: Đề xuất làm sạch)
    const txtClean = path.join(OUT_DIR, `${item.key}-02-clean.txt`);
    const pngClean = path.join(OUT_DIR, `${item.key}-02-clean.png`);
    const innerClean = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(txtClean, innerClean, 'utf-8');
    await page.screenshot({ path: pngClean, fullPage: false });
    console.log(`✓ Đã lưu ${path.basename(pngClean)} (${fs.statSync(pngClean).size} bytes)`);

    // Capture Clean Page (Tab 2: Bảng đối chiếu Trước/Sau)
    console.log(`[3b] Chuyển tab Bảng đối chiếu (Trước / Sau)...`);
    const diffTabBtn = page.locator('button:has-text("Bảng đối chiếu")');
    if (await diffTabBtn.isVisible()) {
      await diffTabBtn.click();
      await page.waitForTimeout(1000);
    }
    const txtDiff = path.join(OUT_DIR, `${item.key}-02b-clean-diff.txt`);
    const pngDiff = path.join(OUT_DIR, `${item.key}-02b-clean-diff.png`);
    const innerDiff = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(txtDiff, innerDiff, 'utf-8');
    await page.screenshot({ path: pngDiff, fullPage: false });
    console.log(`✓ Đã lưu ${path.basename(pngDiff)} (${fs.statSync(pngDiff).size} bytes)`);

    // Step 4: Approve Clean Gate
    console.log(`[4] Phê duyệt Cổng 1...`);
    const approveBtn = page.locator('button:has-text("Duyệt và tiếp tục")');
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await page.waitForTimeout(500);

      const reviewerInput = page.locator('input[placeholder*="tên"], input[name="reviewer"]');
      if (await reviewerInput.isVisible()) {
        const currVal = await reviewerInput.inputValue();
        if (!currVal.trim()) {
          await reviewerInput.fill('Ban Giám Khảo');
        }
      }

      const confirmBtn = page.locator('button:has-text("Xác nhận"), button:has-text("Đồng ý")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Step 5: Go to Analyze Page
    console.log(`[5] Chuyển sang bước Phân tích...`);
    const toAnalyzeBtn = page.locator('button:has-text("Đến bước Phân tích"), button:has-text("Tiếp tục đến Phân tích")');
    if (await toAnalyzeBtn.isVisible()) {
      await toAnalyzeBtn.click();
    } else {
      await page.goto(`${BASE_URL}/phan-tich`, { waitUntil: 'networkidle' });
    }
    await page.waitForURL('**/phan-tich**', { timeout: 10000 });
    await page.waitForTimeout(1500);

    console.log(`  -> Bấm 'Chạy phân tích dữ liệu kinh doanh'...`);
    const runBizBtn = page.locator('button:has-text("Chạy phân tích dữ liệu kinh doanh"), button:has-text("Chạy phân tích")');
    if (await runBizBtn.isVisible()) {
      await runBizBtn.click();
      await page.waitForTimeout(2500);
    }

    await page.waitForSelector('button:has-text("Xem báo cáo")', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const txtAnalyze = path.join(OUT_DIR, `${item.key}-03-analyze.txt`);
    const pngAnalyze = path.join(OUT_DIR, `${item.key}-03-analyze.png`);
    const innerAnalyze = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(txtAnalyze, innerAnalyze, 'utf-8');
    await page.screenshot({ path: pngAnalyze, fullPage: false });
    console.log(`✓ Đã lưu ${path.basename(pngAnalyze)} (${fs.statSync(pngAnalyze).size} bytes)`);

    // Step 6: Go to Report Page
    console.log(`[6] Chuyển sang Báo cáo...`);
    const toReportBtn = page.locator('button:has-text("Xem báo cáo")');
    if (await toReportBtn.isVisible()) {
      await toReportBtn.click();
    } else {
      await page.goto(`${BASE_URL}/bao-cao`, { waitUntil: 'networkidle' });
    }
    await page.waitForURL('**/bao-cao**', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const txtReport = path.join(OUT_DIR, `${item.key}-04-report.txt`);
    const pngReport = path.join(OUT_DIR, `${item.key}-04-report.png`);
    const innerReport = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(txtReport, innerReport, 'utf-8');
    await page.screenshot({ path: pngReport, fullPage: false });
    console.log(`✓ Đã lưu ${path.basename(pngReport)} (${fs.statSync(pngReport).size} bytes)`);

    await page.close();
  }

  await browser.close();
  console.log(`\n======================================================================`);
  console.log(`TẤT CẢ 4 FILE ĐÃ HOÀN THÀNH 100% LUỒNG KIỂM THỬ TRÊN CHROME!`);
  console.log(`======================================================================`);
}

run().catch((err) => {
  console.error('Playwright verification error:', err);
  process.exit(1);
});
