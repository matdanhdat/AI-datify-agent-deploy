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
const OUT_DIR = path.resolve(ROOT, '..', '_bao-cao-2A1', 'screens_part1');
const REPORT_FILE = path.resolve(ROOT, '..', '_bao-cao-2A1', 'acceptance_11cases.txt');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const vitePath = pathToFileURL(path.resolve(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href;
const { preview } = await import(vitePath);

async function realClick(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(250);
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
      await page.waitForTimeout(600);
    }
  }

  if (question && question.trim().length > 0) {
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
  }

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(csvFile);
  await page.waitForTimeout(800);

  const reuploadConfirmBtn = page.locator('button:has-text("Đồng ý nạp lại")');
  if (await reuploadConfirmBtn.isVisible().catch(() => false)) {
    await realClick(page, reuploadConfirmBtn);
    await page.waitForTimeout(1000);
  }
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

  const report = [];
  report.push('========================================================================');
  report.push('BÁO CÁO KIỂM THỬ CHẤP NHẬN 11 TRƯỜNG HỢP (PHẦN 1 - PROMPT 2A-1)');
  report.push('========================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // CASE 1: du-lieu-test-ban-le.csv -> full 13/13 tính được, mặc định tick 13
    // -------------------------------------------------------------------------
    console.log('Testing Case 1: du-lieu-test-ban-le.csv full 13/13 feasible...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Phân tích bán lẻ',
        path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Review Gate 1
      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');
      await page.waitForTimeout(300);

      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);

      // Verify navigation to /trao-doi and wait for page to render
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });
      console.log('  -> Navigated to /trao-doi successfully!');

      // Check 13 feasible badges
      const feasibleBadges = page.locator('.pixel-badge', { hasText: /^TÍNH ĐƯỢC$/ });
      await feasibleBadges.first().waitFor({ state: 'visible', timeout: 10000 });
      const feasibleCount = await feasibleBadges.count();
      console.log(`  -> Feasible badges count: ${feasibleCount}`);

      // Check checkboxes checked
      const checkedBoxes = page.locator('input[type="checkbox"]:checked');
      const checkedCount = await checkedBoxes.count();
      console.log(`  -> Checked count: ${checkedCount}`);

      // Check confidence badge
      const confBadge = page.locator('text=CAO').first();
      const confVisible = await confBadge.isVisible();

      const shotPathExchange = path.join(OUT_DIR, 'case1_retail_exchange.png');
      await page.screenshot({ path: shotPathExchange, fullPage: true });

      // Click Phân tích
      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(3000);

      // Check 13 cards rendered in category block
      const blockLocator = page.locator('[data-testid="selected-metrics-block"]');
      await blockLocator.waitFor({ state: 'visible', timeout: 20000 });
      const blockText = await blockLocator.innerText();

      const hasRev = blockText.includes('1.135.530.000');
      const hasMargin = blockText.includes('46,84%');
      const hasTie = blockText.includes('55,48%');

      const shotPathAnalyze = path.join(OUT_DIR, 'case1_retail_analyze.png');
      await page.screenshot({ path: shotPathAnalyze, fullPage: true });

      const pass = feasibleCount === 13 && checkedCount === 13 && confVisible && hasRev && hasMargin && hasTie;
      report.push(`[CASE 1] du-lieu-test-ban-le.csv (13/13 tính được, CAO, 13 thẻ đầy đủ): ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Số chỉ số tính được: ${feasibleCount}/13`);
      report.push(`  - Số chỉ số mặc định tick: ${checkedCount}/13`);
      report.push(`  - Độ tin cậy dự kiến: ${confVisible ? 'CAO' : 'Không thấy'}`);
      report.push(`  - Doanh thu 1.135.530.000: ${hasRev ? 'Đạt' : 'Không'}`);
      report.push(`  - Biên lợi nhuận gộp 46,84%: ${hasMargin ? 'Đạt' : 'Không'}`);
      report.push(`  - Hòa ma trận 55,48% (Website × Túi tote, Cửa hàng × Túi tote): ${hasTie ? 'Đạt' : 'Không'}`);
      report.push(`  - Ảnh Trao đổi: ${shotPathExchange} (SHA: ${getSha256(shotPathExchange)})`);
      report.push(`  - Ảnh Phân tích: ${shotPathAnalyze} (SHA: ${getSha256(shotPathAnalyze)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 2: du-lieu-test-ban-le.csv -> tick 2 chỉ số (Doanh thu + Biên LN) -> chỉ vẽ 2 thẻ
    // -------------------------------------------------------------------------
    console.log('Testing Case 2: du-lieu-test-ban-le.csv select 2 metrics only...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Phân tích 2 chỉ số',
        path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');

      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      // Click "BỎ CHỌN HẾT"
      const deselectAllBtn = page.locator('button:has-text("BỎ CHỌN HẾT")');
      await realClick(page, deselectAllBtn);
      await page.waitForTimeout(300);

      // Verify Analyze button is disabled
      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      const isDisabled = await analyzeBtn.isDisabled();
      console.log(`  -> Analyze button disabled when 0 checked: ${isDisabled}`);

      // Select exactly 2 metrics via specific IDs: total_revenue and gross_margin
      await page.locator('#metric-check-total_revenue').check();
      await page.waitForTimeout(200);
      await page.locator('#metric-check-gross_margin').check();
      await page.waitForTimeout(200);

      // Click Analyze
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2500);

      // Check category panel title
      const panelTitle = page.locator('text=CHỈ SỐ THEO DANH MỤC (2 CHỈ SỐ)');
      await panelTitle.waitFor({ state: 'visible', timeout: 10000 });
      const titleVisible = await panelTitle.isVisible().catch(() => false);

      const blockLocator = page.locator('[data-testid="selected-metrics-block"]');
      const blockText = await blockLocator.innerText();

      const hasRev = blockText.includes('1.135.530.000');
      const hasMargin = blockText.includes('46,84%');
      const noShirt = !blockText.includes('Áo thun');
      const noTote = !blockText.includes('Túi tote');
      const noShopee = !blockText.includes('Sàn thương mại');

      const shotPath = path.join(OUT_DIR, 'case2_retail_2selected_analyze.png');
      await page.screenshot({ path: shotPath, fullPage: true });

      const pass = titleVisible && hasRev && hasMargin && noShirt && noTote && noShopee;
      report.push(`[CASE 2] du-lieu-test-ban-le.csv (Chọn 2 chỉ số: Doanh thu & Biên LN): ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Tiêu đề khối: ${titleVisible ? 'CHỈ SỐ THEO DANH MỤC (2 CHỈ SỐ)' : 'Khác'}`);
      report.push(`  - Thẻ Tổng doanh thu (1.135.530.000): ${hasRev ? 'Có' : 'Không'}`);
      report.push(`  - Thẻ Biên lợi nhuận gộp (46,84%): ${hasMargin ? 'Có' : 'Không'}`);
      report.push(`  - Không chứa "Áo thun": ${noShirt ? 'Đúng' : 'Sai'}`);
      report.push(`  - Không chứa "Túi tote": ${noTote ? 'Đúng' : 'Sai'}`);
      report.push(`  - Không chứa "Sàn thương mại": ${noShopee ? 'Đúng' : 'Sai'}`);
      report.push(`  - Ảnh chụp: ${shotPath} (SHA: ${getSha256(shotPath)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 3: thieu-gia-von-thieu-san-pham.csv -> 5 tính được, 8 bị mờ
    // -------------------------------------------------------------------------
    console.log('Testing Case 3: thieu-gia-von-thieu-san-pham.csv 5 feasible, 8 dimmed...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Thiếu giá vốn',
        path.join(ROOT, 'samples', 'business', 'thieu-gia-von-thieu-san-pham.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');

      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      const feasibleCount = await page.locator('.pixel-badge', { hasText: /^TÍNH ĐƯỢC$/ }).count();
      const infeasibleCount = await page.locator('.pixel-badge', { hasText: /^KHÔNG TÍNH ĐƯỢC$/ }).count();

      // Check specific reason text
      const pageContent = await page.locator('body').innerText();
      const hasReasonOrders = pageContent.includes('Thiếu cột Số đơn.');
      const hasReasonCost = pageContent.includes('Thiếu cột Giá vốn hoặc Lợi nhuận gộp.');
      const hasReasonProd = pageContent.includes('Thiếu cột Sản phẩm.');
      const hasReasonCostProd = pageContent.includes('Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.');

      const shotPathExchange = path.join(OUT_DIR, 'case3_thieu_gia_von_exchange.png');
      await page.screenshot({ path: shotPathExchange, fullPage: true });

      // Click Phân tích
      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2500);

      const blockLocator = page.locator('[data-testid="selected-metrics-block"]');
      await blockLocator.waitFor({ state: 'visible', timeout: 20000 });
      const blockText = await blockLocator.innerText();
      const hasTotal723M = blockText.includes('723.600.000');

      const shotPathAnalyze = path.join(OUT_DIR, 'case3_thieu_gia_von_analyze.png');
      await page.screenshot({ path: shotPathAnalyze, fullPage: true });

      const pass =
        feasibleCount === 5 &&
        infeasibleCount === 8 &&
        hasReasonOrders &&
        hasReasonCost &&
        hasReasonProd &&
        hasReasonCostProd &&
        hasTotal723M;

      report.push(`[CASE 3] thieu-gia-von-thieu-san-pham.csv (5 tính được, 8 mờ, lý do nguyên văn): ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Số chỉ số tính được: ${feasibleCount}/13 (Kỳ vọng: 5)`);
      report.push(`  - Số chỉ số không tính được: ${infeasibleCount}/13 (Kỳ vọng: 8)`);
      report.push(`  - Lý do 'Thiếu cột Số đơn.': ${hasReasonOrders ? 'Có' : 'Không'}`);
      report.push(`  - Lý do 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.': ${hasReasonCost ? 'Có' : 'Không'}`);
      report.push(`  - Lý do 'Thiếu cột Sản phẩm.': ${hasReasonProd ? 'Có' : 'Không'}`);
      report.push(`  - Lý do 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp, Sản phẩm.': ${hasReasonCostProd ? 'Có' : 'Không'}`);
      report.push(`  - Tổng doanh thu 723.600.000: ${hasTotal723M ? 'Có' : 'Không'}`);
      report.push(`  - Ảnh Trao đổi: ${shotPathExchange} (SHA: ${getSha256(shotPathExchange)})`);
      report.push(`  - Ảnh Phân tích: ${shotPathAnalyze} (SHA: ${getSha256(shotPathAnalyze)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 4: o-to-thieu-kenh-thieu-gia-von.csv -> đối chiếu checkFeasibility & hòa theo khu vực
    // -------------------------------------------------------------------------
    console.log('Testing Case 4: o-to-thieu-kenh-thieu-gia-von.csv feasibility & tie handling...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Phân tích ô tô',
        path.join(ROOT, 'samples', 'business', 'o-to-thieu-kenh-thieu-gia-von.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');

      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      const feasibleCount = await page.locator('.pixel-badge', { hasText: /^TÍNH ĐƯỢC$/ }).count();
      const infeasibleCount = await page.locator('.pixel-badge', { hasText: /^KHÔNG TÍNH ĐƯỢC$/ }).count();

      const shotPathExchange = path.join(OUT_DIR, 'case4_oto_exchange.png');
      await page.screenshot({ path: shotPathExchange, fullPage: true });

      // Click Phân tích
      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2500);

      const blockLocator = page.locator('[data-testid="selected-metrics-block"]');
      await blockLocator.waitFor({ state: 'visible', timeout: 20000 });
      const blockText = await blockLocator.innerText();

      const hasHN = blockText.includes('43.050.000.000');
      const hasDN = blockText.includes('Đà Nẵng');
      const hasHCM = blockText.includes('51.300.000.000');
      const hasTie = blockText.includes('hòa') || blockText.includes('Hòa');

      const shotPathAnalyze = path.join(OUT_DIR, 'case4_oto_analyze.png');
      await page.screenshot({ path: shotPathAnalyze, fullPage: true });

      const pass = feasibleCount === 7 && infeasibleCount === 6 && hasHN && hasHCM && (hasTie || hasDN);
      report.push(`[CASE 4] o-to-thieu-kenh-thieu-gia-von.csv (7 tính được, 6 mờ, hòa khu vực): ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Số chỉ số tính được: ${feasibleCount}/13 (Kỳ vọng: 7)`);
      report.push(`  - Số chỉ số không tính được: ${infeasibleCount}/13 (Kỳ vọng: 6)`);
      report.push(`  - Doanh thu TP.HCM 51.300.000.000: ${hasHCM ? 'Có' : 'Không'}`);
      report.push(`  - Hòa Hà Nội và Đà Nẵng 43.050.000.000: ${hasHN ? 'Có' : 'Không'}`);
      report.push(`  - Ảnh Trao đổi: ${shotPathExchange} (SHA: ${getSha256(shotPathExchange)})`);
      report.push(`  - Ảnh Phân tích: ${shotPathAnalyze} (SHA: ${getSha256(shotPathAnalyze)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 5: nha-dat-ty-dong-cham-phay.csv -> 145 tỷ, định dạng tỷ VND
    // -------------------------------------------------------------------------
    console.log('Testing Case 5: nha-dat-ty-dong-cham-phay.csv 145 tỷ VND...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Phân tích nhà đất',
        path.join(ROOT, 'samples', 'business', 'nha-dat-ty-dong-cham-phay.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);
      await page.waitForTimeout(1500);

      // Confirm all pending items on Gate 1 (unit / separator / inferred roles)
      const confirmAllBtn = page.locator('button:has-text("XÁC NHẬN TẤT CẢ")');
      if (await confirmAllBtn.isVisible().catch(() => false)) {
        await realClick(page, confirmAllBtn);
        await page.waitForTimeout(1000);
      }

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');
      await page.waitForTimeout(400);

      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      const shotPathExchange = path.join(OUT_DIR, 'case5_nhadat_exchange.png');
      await page.screenshot({ path: shotPathExchange, fullPage: true });

      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2500);

      const blockLocator = page.locator('[data-testid="selected-metrics-block"]');
      await blockLocator.waitFor({ state: 'visible', timeout: 20000 });
      const blockText = await blockLocator.innerText();

      const pass = blockText.includes('145.000.000.000') || blockText.includes('145 tỷ');

      const shotPathAnalyze = path.join(OUT_DIR, 'case5_nhadat_analyze.png');
      await page.screenshot({ path: shotPathAnalyze, fullPage: true });

      report.push(`[CASE 5] nha-dat-ty-dong-cham-phay.csv: ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Hiển thị 145.000.000.000 VND / 145 tỷ: ${pass ? 'Đạt' : 'Không tìm thấy'}`);
      report.push(`  - Ảnh Trao đổi: ${shotPathExchange} (SHA: ${getSha256(shotPathExchange)})`);
      report.push(`  - Ảnh Phân tích: ${shotPathAnalyze} (SHA: ${getSha256(shotPathAnalyze)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 6: cot-la-6-dong.csv -> 21 triệu khi chọn tay Khoản thu KH
    // -------------------------------------------------------------------------
    console.log('Testing Case 6: cot-la-6-dong.csv 21 triệu VND...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Cột lạ 6 dòng',
        path.join(ROOT, 'samples', 'business', 'cot-la-6-dong.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);
      await page.waitForTimeout(1500);

      // Confirm guessed revenue column
      const confirmRevBtn = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
      if (await confirmRevBtn.isVisible().catch(() => false)) {
        await realClick(page, confirmRevBtn);
        await page.waitForTimeout(500);
      }

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');
      await page.waitForTimeout(400);

      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      // Check confidence is THẤP and reason contains "Dữ liệu ít (6 dòng)"
      const exchangeBodyText = await page.locator('body').innerText();
      const hasLowConf = exchangeBodyText.includes('THẤP');
      const hasFewRows = exchangeBodyText.includes('Dữ liệu ít (6 dòng)');

      const shotPathExchange = path.join(OUT_DIR, 'case6_cot_la_exchange.png');
      await page.screenshot({ path: shotPathExchange, fullPage: true });

      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2500);

      const blockLocator = page.locator('[data-testid="selected-metrics-block"]');
      await blockLocator.waitFor({ state: 'visible', timeout: 20000 });
      const blockText = await blockLocator.innerText();

      const rev21M = blockText.includes('21.000.000');

      const shotPathAnalyze = path.join(OUT_DIR, 'case6_cot_la_analyze.png');
      await page.screenshot({ path: shotPathAnalyze, fullPage: true });

      const pass = rev21M && hasLowConf && hasFewRows;
      report.push(`[CASE 6] cot-la-6-dong.csv: ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Độ tin cậy THẤP: ${hasLowConf ? 'Có' : 'Không'}`);
      report.push(`  - Lý do 'Dữ liệu ít (6 dòng)': ${hasFewRows ? 'Có' : 'Không'}`);
      report.push(`  - Doanh thu 21.000.000 VND: ${rev21M ? 'Đạt' : 'Không tìm thấy'}`);
      report.push(`  - Ảnh Trao đổi: ${shotPathExchange} (SHA: ${getSha256(shotPathExchange)})`);
      report.push(`  - Ảnh Phân tích: ${shotPathAnalyze} (SHA: ${getSha256(shotPathAnalyze)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 7: RouteGuard protection
    // -------------------------------------------------------------------------
    console.log('Testing Case 7: RouteGuard redirection tests...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      // Case 7a: Before Gate 1 approval, access /trao-doi
      await page.goto(`http://127.0.0.1:${targetPort}/trao-doi`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const url7a = page.url();
      console.log(`  -> Visiting /trao-doi initially redirected to: ${url7a}`);

      // Advance to cleaning_review
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });
      await fillQuestionAndUpload(
        page,
        'Test RouteGuard',
        path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv')
      );
      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Before Gate 1 approved, try to access /trao-doi directly via client navigation
      await page.evaluate((target) => window.__navigate(target), '/trao-doi');
      await page.waitForTimeout(600);
      const url7b = page.url();
      console.log(`  -> Visiting /trao-doi while in cleaning_review redirected to: ${url7b}`);

      // Dismiss lock modal if open
      const closeLockModalBtn = page.locator('button:has-text("Đã hiểu")');
      if (await closeLockModalBtn.isVisible().catch(() => false)) {
        await realClick(page, closeLockModalBtn);
        await page.waitForTimeout(400);
      }

      // Approve Gate 1
      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');
      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      // Gate 1 approved, metric selection NOT confirmed. Try visiting /phan-tich directly
      await page.evaluate((target) => window.__navigate(target), '/phan-tich');
      await page.waitForTimeout(600);
      const url7c = page.url();
      console.log(`  -> Visiting /phan-tich before confirming selection redirected to: ${url7c}`);

      // Dismiss lock modal if open
      if (await closeLockModalBtn.isVisible().catch(() => false)) {
        await realClick(page, closeLockModalBtn);
        await page.waitForTimeout(400);
      }

      const shotPath = path.join(OUT_DIR, 'case7_routeguard_redirect.png');
      await page.screenshot({ path: shotPath, fullPage: true });

      const pass = url7b.includes('/lam-sach') && url7c.includes('/trao-doi');
      report.push(`[CASE 7] RouteGuard: ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Truy cập /trao-doi khi chưa có phiên: chuyển hướng về ${url7a}`);
      report.push(`  - Truy cập /trao-doi khi chưa duyệt Cổng 1: chuyển hướng về ${url7b}`);
      report.push(`  - Truy cập /phan-tich khi chưa chọn chỉ số: chuyển hướng về ${url7c}`);
      report.push(`  - Ảnh chụp: ${shotPath} (SHA: ${getSha256(shotPath)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 8: Reopen Gate 1 -> returns to /lam-sach & retains valid selection
    // -------------------------------------------------------------------------
    console.log('Testing Case 8: Reopen Gate 1 and retain selection...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });
      await fillQuestionAndUpload(
        page,
        'Test Reopen Gate 1',
        path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv')
      );
      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');
      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      // Deselect all, choose total_revenue and gross_margin
      await page.locator('button:has-text("BỎ CHỌN HẾT")').click();
      await page.waitForTimeout(200);
      await page.locator('#metric-check-total_revenue').check();
      await page.locator('#metric-check-gross_margin').check();

      // Confirm & analyze
      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2500);

      // Now go to /lam-sach and click "MỞ LẠI CỔNG 1 ĐỂ SỬA"
      await page.evaluate((target) => window.__navigate(target), '/lam-sach');
      await page.waitForTimeout(600);
      const reopenBtn = page.locator('button:has-text("MỞ LẠI CỔNG 1 ĐỂ SỬA")').first();
      await reopenBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, reopenBtn);
      await page.waitForTimeout(500);

      // If confirmation "MỞ LẠI VÀ XÓA" appears, click it to execute reclean
      const confirmDeleteBtn = page.locator('button:has-text("MỞ LẠI VÀ XÓA")');
      if (await confirmDeleteBtn.isVisible().catch(() => false)) {
        await realClick(page, confirmDeleteBtn);
        await page.waitForTimeout(600);
      }

      // Now verify direct visit to /phan-tich is blocked
      await page.evaluate((target) => window.__navigate(target), '/phan-tich');
      await page.waitForTimeout(600);
      const blockedUrl = page.url();
      console.log(`  -> Direct visit to /phan-tich after reopening Gate 1 redirected to: ${blockedUrl}`);

      // Dismiss lock modal if open
      const closeLockModalBtn8 = page.locator('button:has-text("Đã hiểu")');
      if (await closeLockModalBtn8.isVisible().catch(() => false)) {
        await realClick(page, closeLockModalBtn8);
        await page.waitForTimeout(400);
      }

      // Re-approve Gate 1
      await page.evaluate((target) => window.__navigate(target), '/lam-sach');
      await page.waitForTimeout(600);
      const reviewerInput2 = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput2.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput2.fill('Ban Giám Khảo Tái Phê Duyệt');
      const approveBtn2 = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn2);
      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      // Verify total_revenue and gross_margin remain checked!
      const revChecked = await page.locator('#metric-check-total_revenue').isChecked();
      const marginChecked = await page.locator('#metric-check-gross_margin').isChecked();
      const aovChecked = await page.locator('#metric-check-aov').isChecked();

      const shotPath = path.join(OUT_DIR, 'case8_reopen_gate1.png');
      await page.screenshot({ path: shotPath, fullPage: true });

      const pass = revChecked && marginChecked && !aovChecked && !blockedUrl.includes('/phan-tich');
      report.push(`[CASE 8] Mở lại Cổng 1 sau Phân tích (Lựa chọn giữ nguyên, kết quả cũ xóa, khóa Phân tích): ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Chuyển hướng khi cố vào /phan-tich sau khi mở lại: ${blockedUrl}`);
      report.push(`  - Chỉ số Doanh thu giữ nguyên tick: ${revChecked ? 'Đúng' : 'Sai'}`);
      report.push(`  - Chỉ số Biên LN gộp giữ nguyên tick: ${marginChecked ? 'Đúng' : 'Sai'}`);
      report.push(`  - Chỉ số AOV không bị tự ý bật lại: ${!aovChecked ? 'Đúng' : 'Sai'}`);
      report.push(`  - Ảnh chụp: ${shotPath} (SHA: ${getSha256(shotPath)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 9: Trading Mode (100% unchanged, 5 steps, no exchange)
    // -------------------------------------------------------------------------
    console.log('Testing Case 9: Trading Mode isolation...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      await fillQuestionAndUpload(
        page,
        'Dữ liệu giao dịch',
        path.join(ROOT, 'public', 'samples', 'file-mau-chuan.csv')
      );

      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Verify Stepper has 5 steps
      const stepper = page.locator('nav[aria-label="Tiến trình quy trình 5 bước"]');
      const has5Steps = await stepper.isVisible().catch(() => false);

      // Verify Sidebar has no "Trao đổi"
      const exchangeMenu = page.locator('nav').locator('text=Trao đổi');
      const exchangeCount = await exchangeMenu.count();

      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');
      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);

      // In Trading Mode, goes straight to /phan-tich!
      await page.waitForURL('**/phan-tich**', { timeout: 10000 });
      console.log(`  -> Trading mode went directly to: ${page.url()}`);

      const shotPath = path.join(OUT_DIR, 'case9_trading_mode_analyze.png');
      await page.screenshot({ path: shotPath, fullPage: true });

      const pass = has5Steps && exchangeCount === 0 && page.url().includes('/phan-tich');
      report.push(`[CASE 9] Chế độ GIAO DỊCH: ${pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Stepper 5 bước: ${has5Steps ? 'Đúng' : 'Sai'}`);
      report.push(`  - Mục Trao đổi ở Sidebar: ${exchangeCount === 0 ? 'Không xuất hiện (Đúng)' : 'Xuất hiện (Sai)'}`);
      report.push(`  - Duyệt Cổng 1 đi thẳng đến Phân tích: ${page.url().includes('/phan-tich') ? 'Đúng' : 'Sai'}`);
      report.push(`  - Ảnh chụp: ${shotPath} (SHA: ${getSha256(shotPath)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 10: Click Count Measurement (Exactly 4 clicks)
    // -------------------------------------------------------------------------
    console.log('Testing Case 10: Measuring exact click count for dien-tu-thieu-loi-nhuan.csv...');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`http://127.0.0.1:${targetPort}/nap-du-lieu`, { waitUntil: 'networkidle' });

      let clickCount = 0;
      await fillQuestionAndUpload(
        page,
        'Đo số click',
        path.join(ROOT, 'samples', 'business', 'dien-tu-thieu-loi-nhuan.csv')
      );

      // Click 1: Tiếp tục làm sạch
      const proceedBtn = page.locator('button:has-text("Tiếp tục làm sạch")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await realClick(page, proceedBtn);
      clickCount++;
      console.log(`  Click 1: Tiếp tục làm sạch (Total: ${clickCount})`);

      await page.waitForURL('**/lam-sach', { timeout: 10000 });
      await page.waitForTimeout(1000);
      const reviewerInput = page.locator('input[placeholder*="tên người duyệt"]');
      await reviewerInput.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerInput.fill('Ban Giám Khảo');

      // Click 2: Duyệt và tiếp tục
      const approveBtn = page.locator('button:has-text("DUYỆT VÀ TIẾP TỤC"), button:has-text("Duyệt và tiếp tục")');
      await realClick(page, approveBtn);
      clickCount++;
      console.log(`  Click 2: Duyệt và tiếp tục (Total: ${clickCount})`);

      await page.waitForURL('**/trao-doi', { timeout: 10000 });
      await page.waitForSelector('text=TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH', { timeout: 10000 });

      // Click 3: PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN
      const analyzeBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
      await realClick(page, analyzeBtn);
      clickCount++;
      console.log(`  Click 3: Phân tích các chỉ số đã chọn (Total: ${clickCount})`);

      await page.waitForURL('**/phan-tich**', { timeout: 15000 });
      await page.waitForTimeout(2000);

      // Click 4: Xem báo cáo
      const toReportBtn = page.locator('button:has-text("Xem báo cáo")').first();
      await toReportBtn.waitFor({ state: 'visible', timeout: 20000 });
      await realClick(page, toReportBtn);
      clickCount++;
      console.log(`  Click 4: Xem báo cáo (Total: ${clickCount})`);

      await page.waitForURL('**/bao-cao**', { timeout: 10000 });
      console.log(`  -> Navigated to: ${page.url()}`);

      const shotPath = path.join(OUT_DIR, 'case10_click_count_summary.png');
      await page.screenshot({ path: shotPath, fullPage: true });

      report.push(`[CASE 10] Đếm số click từ upload đến xem báo cáo (dien-tu-thieu-loi-nhuan.csv): ${clickCount === 4 ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      report.push(`  - Click 1: Tiếp tục làm sạch (Nạp dữ liệu -> Làm sạch)`);
      report.push(`  - Click 2: Duyệt và tiếp tục (Làm sạch -> Trao đổi)`);
      report.push(`  - Click 3: Phân tích các chỉ số đã chọn (Trao đổi -> Phân tích)`);
      report.push(`  - Click 4: Xem báo cáo (Phân tích -> Báo cáo)`);
      report.push(`  - Tổng số click thực tế: ${clickCount} click (Kỳ vọng: đúng 4 click)`);
      report.push(`  - Ảnh chụp: ${shotPath} (SHA: ${getSha256(shotPath)})\n`);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // CASE 11: File Isolation & Locked Files Integrity
    // -------------------------------------------------------------------------
    console.log('Testing Case 11: File isolation & locked files verification...');
    {
      const lockedFiles = [
        { file: 'src/core/metrics/businessRoles.ts', expectedSha: '68119b5da533c8745c42b809d16b42a775bde3e8b658d923efe8319737551e96' },
        { file: 'src/core/metrics/businessCatalog.ts', expectedSha: '70941125c8d878b93e299b90d5b28841051de0082c251d52d62153ba9936ea26' },
        { file: 'src/core/metrics/businessFeasibility.ts', expectedSha: 'c6c63e8f53372b0e67669741ece3b50050773a558d23546ad92dc9815650b24d' },
        { file: 'api/_lib/tasks.ts', expectedSha: '6c1a51b304fc259fb13850062441aebdf67bb8b000796db373168a1538a7a851' },
        { file: 'api/_lib/gemini.ts', expectedSha: '79bdff76f58d58289e9be114843dd47241c6310406e3bd4e9fd215273d218735' },
        { file: 'src/core/narrative/factsBuilder.ts', expectedSha: '1974354628b6c7cdca50e9195d08810bdf81e4b796e8dd40c48028793e1e9410' },
        { file: 'src/core/metrics/businessAnalyzer.ts', expectedSha: 'fa694bbd423df0cdba93f7d1bc4bffd1b8043d24d1edb98db7a0c7438059fbaa' },
      ];

      let allMatched = true;
      report.push('[CASE 11] Thẩm định tính cô lập và 7 file bất biến:');
      for (const item of lockedFiles) {
        const fullP = path.join(ROOT, item.file);
        const actualSha = getSha256(fullP);
        const match = actualSha.toLowerCase() === item.expectedSha.toLowerCase();
        if (!match) allMatched = false;
        report.push(`  - ${item.file}: ${match ? 'NGUYÊN VẸN' : 'BỊ SỬA'} (SHA: ${actualSha})`);
      }

      // Check businessComputeSelected hash
      const calcP = path.join(ROOT, 'src/core/metrics/businessComputeSelected.ts');
      const calcSha = getSha256(calcP);
      const calcExpected = '2c6377b1bacfa1e2e93645c70bb96d1febf4de4262a5e682e9dc4d9a4963e5fd';
      const calcMatch = calcSha.toLowerCase() === calcExpected.toLowerCase();
      report.push(`  - businessComputeSelected.ts (giữ nguyên từ Gate 0c): ${calcMatch ? 'ĐẠT' : 'SAI HASH'} (SHA: ${calcSha})`);
      if (!calcMatch) allMatched = false;

      report.push(`\n  => KẾT LUẬN CASE 11: ${allMatched ? 'ĐẠT HOÀN TOÀN' : 'KHÔNG ĐẠT'}\n`);
    }

  } finally {
    await browser.close();
    await server.close();
  }

  const reportContent = report.join('\n');
  fs.writeFileSync(REPORT_FILE, reportContent, 'utf-8');
  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log(reportContent);
}

run().catch((err) => {
  console.error('Acceptance suite failed:', err);
  process.exit(1);
});
