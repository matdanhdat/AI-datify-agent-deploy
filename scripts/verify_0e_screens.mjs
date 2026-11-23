import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { preview } from 'vite';

process.env.GEMINI_API_KEY_1 = ' ';
process.env.GEMINI_API_KEY_2 = ' ';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:/Users/ADMIN/AppData/Local/Programs/Antigravity IDE/resources/app/node_modules/playwright';
const { chromium } = require(playwrightPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();
const samplesDir = path.join(rootDir, 'samples', 'business');
const OUT_DIR = path.resolve(rootDir, '..', '_bao-cao-2B', 'screens_0e');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

fs.mkdirSync(OUT_DIR, { recursive: true });

async function realClick(page, locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(250);
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function uploadFile(page, filePath) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(800);

  const reuploadBtn = page.locator('button:has-text("Đồng ý nạp lại")');
  if (await reuploadBtn.isVisible().catch(() => false)) {
    await realClick(page, reuploadBtn);
    await page.waitForTimeout(1000);
  }
}

async function resetNewSession(page) {
  const newBtn = page.locator('button:has-text("Phiên mới")');
  if (await newBtn.isVisible().catch(() => false)) {
    await realClick(page, newBtn);
    await page.waitForTimeout(300);
    const confirmNewBtn = page.locator('button:has-text("Tạo phiên mới")');
    if (await confirmNewBtn.isVisible().catch(() => false)) {
      await realClick(page, confirmNewBtn);
      await page.waitForTimeout(400);
    }
  }
}

async function run() {
  console.log('Khởi động Vite preview server trên cổng 8089...');
  const server = await preview({
    root: rootDir,
    preview: { port: 8089, host: '127.0.0.1' },
  });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-proxy-server'],
  });

  try {
    // =========================================================================
    // 0e.3: Chụp ảnh Cổng 1 cot-la-6-dong.csv khi CHƯA xác nhận vai trò ở 2 viewport
    // =========================================================================
    console.log('\n--- 0e.3: Chụp ảnh cot-la-6-dong.csv chưa xác nhận vai trò (1280x720 và 1920x1080) ---');
    const viewports = [
      { name: '1280x720', width: 1280, height: 720 },
      { name: '1920x1080', width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto('http://127.0.0.1:8089/nap-du-lieu');
      await resetNewSession(page);
      await page.waitForTimeout(600);

      const filePath = path.join(samplesDir, 'cot-la-6-dong.csv');
      await uploadFile(page, filePath);

      const nextBtn = page.locator('button:has-text("TIẾP TỤC LÀM SẠCH")');
      await realClick(page, nextBtn);
      await page.waitForURL('**/lam-sach**', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // In CleanPage, select "Khoản thu KH" for Doanh thu in select dropdown
      const selectRev = page.locator('select[aria-label*="Doanh thu"]').or(page.locator('select')).first();
      if (await selectRev.isVisible().catch(() => false)) {
        await selectRev.selectOption({ label: 'Khoản thu KH' });
        await page.waitForTimeout(600);
      }

      const shotPath = path.join(OUT_DIR, `0e3_cot_la_6_dong_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      const bytes = fs.readFileSync(shotPath);
      const shotHash = crypto.createHash('sha256').update(bytes).digest('hex');
      console.log(`[Viewport ${vp.name}] Ảnh chụp: ${shotPath} | Kích thước: ${bytes.length} bytes | SHA: ${shotHash}`);

      await page.close();
    }

    // =========================================================================
    // 0e.2: Chụp ảnh biểu đồ bán lẻ & thiếu giá vốn
    // =========================================================================
    console.log('\n--- 0e.2: Chụp ảnh biểu đồ bán lẻ & thiếu giá vốn ---');
    // Retail
    const pageRetail = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await pageRetail.goto('http://127.0.0.1:8089/nap-du-lieu');
    await resetNewSession(pageRetail);
    await pageRetail.waitForTimeout(600);

    const retailPath = path.join(samplesDir, 'du-lieu-test-ban-le.csv');
    await uploadFile(pageRetail, retailPath);

    await realClick(pageRetail, pageRetail.locator('button:has-text("TIẾP TỤC LÀM SẠCH")'));
    await pageRetail.waitForURL('**/lam-sach**', { timeout: 10000 });
    await pageRetail.waitForTimeout(1000);

    // Duyệt Cổng 1
    const approveBtn = pageRetail.locator('button:has-text("Duyệt và tiếp tục")');
    const reviewerInput = pageRetail.locator('input[placeholder*="tên người duyệt"]');
    if (await reviewerInput.isVisible().catch(() => false)) {
      await reviewerInput.fill('Ban Giám Khảo');
    }
    await realClick(pageRetail, approveBtn);
    await pageRetail.waitForURL('**/trao-doi**', { timeout: 10000 });
    await pageRetail.waitForTimeout(800);

    // Bấm phân tích các chỉ số đã chọn
    await realClick(pageRetail, pageRetail.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await pageRetail.waitForURL('**/phan-tich**', { timeout: 15000 });
    await pageRetail.waitForTimeout(2500);

    const shotRetailCharts = path.join(OUT_DIR, '0e2_retail_charts.png');
    await pageRetail.screenshot({ path: shotRetailCharts, fullPage: true });
    const bytesRetail = fs.readFileSync(shotRetailCharts);
    const shotRetailHash = crypto.createHash('sha256').update(bytesRetail).digest('hex');
    console.log(`Ảnh biểu đồ bán lẻ: ${shotRetailCharts} | Kích thước: ${bytesRetail.length} bytes | SHA: ${shotRetailHash}`);
    await pageRetail.close();

    // Thieu gia von
    const pageThieu = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await pageThieu.goto('http://127.0.0.1:8089/nap-du-lieu');
    await resetNewSession(pageThieu);
    await pageThieu.waitForTimeout(600);

    const thieuPath = path.join(samplesDir, 'thieu-gia-von-thieu-san-pham.csv');
    await uploadFile(pageThieu, thieuPath);

    await realClick(pageThieu, pageThieu.locator('button:has-text("TIẾP TỤC LÀM SẠCH")'));
    await pageThieu.waitForURL('**/lam-sach**', { timeout: 10000 });
    await pageThieu.waitForTimeout(1000);

    const approveBtnThieu = pageThieu.locator('button:has-text("Duyệt và tiếp tục")');
    const revInputThieu = pageThieu.locator('input[placeholder*="tên người duyệt"]');
    if (await revInputThieu.isVisible().catch(() => false)) {
      await revInputThieu.fill('Ban Giám Khảo');
    }
    await realClick(pageThieu, approveBtnThieu);
    await pageThieu.waitForURL('**/trao-doi**', { timeout: 10000 });
    await pageThieu.waitForTimeout(800);

    await realClick(pageThieu, pageThieu.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await pageThieu.waitForURL('**/phan-tich**', { timeout: 15000 });
    await pageThieu.waitForTimeout(2500);

    const shotThieuCharts = path.join(OUT_DIR, '0e2_thieu_gia_von_charts.png');
    await pageThieu.screenshot({ path: shotThieuCharts, fullPage: true });
    const bytesThieu = fs.readFileSync(shotThieuCharts);
    const shotThieuHash = crypto.createHash('sha256').update(bytesThieu).digest('hex');
    console.log(`Ảnh biểu đồ thiếu giá vốn: ${shotThieuCharts} | Kích thước: ${bytesThieu.length} bytes | SHA: ${shotThieuHash}`);
    await pageThieu.close();

    const diffBytes = Math.abs(bytesRetail.length - bytesThieu.length);
    console.log(`Chênh lệch kích thước 2 ảnh biểu đồ: ${diffBytes} bytes (${(diffBytes / 1024).toFixed(1)} KB) - ĐẠT YÊU CẦU > 5KB: ${diffBytes > 5120}`);

    // =========================================================================
    // 0e.6: Đo lại số lượt bấm từ Upload đến Report trên dien-tu-thieu-loi-nhuan.csv
    // =========================================================================
    console.log('\n--- 0e.6: Đo lại số lượt bấm (Upload -> Report) ---');
    const pageClick = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await pageClick.goto('http://127.0.0.1:8089/nap-du-lieu');
    await resetNewSession(pageClick);
    await pageClick.waitForTimeout(600);

    const dienTuPath = path.join(samplesDir, 'dien-tu-thieu-loi-nhuan.csv');
    await uploadFile(pageClick, dienTuPath);

    let clickCount = 0;

    // Bấm 1: Tiếp tục làm sạch
    const btn1 = pageClick.locator('button:has-text("TIẾP TỤC LÀM SẠCH")');
    await realClick(pageClick, btn1);
    clickCount++;
    await pageClick.waitForURL('**/lam-sach**', { timeout: 10000 });
    console.log(`Bấm 1: 'TIẾP TỤC LÀM SẠCH' -> Đã vào Cổng 1 (${pageClick.url()})`);
    await pageClick.waitForTimeout(1000);

    // Bấm 2: Duyệt và tiếp tục
    const btn2 = pageClick.locator('button:has-text("Duyệt và tiếp tục")');
    const revInput = pageClick.locator('input[placeholder*="tên người duyệt"]');
    if (await revInput.isVisible().catch(() => false)) {
      await revInput.fill('Ban Giám Khảo');
    }
    await realClick(pageClick, btn2);
    clickCount++;
    await pageClick.waitForURL('**/trao-doi**', { timeout: 10000 });
    console.log(`Bấm 2: 'Duyệt và tiếp tục' -> Đã vào Bước Trao đổi (${pageClick.url()})`);
    await pageClick.waitForTimeout(800);

    // Bấm 3: Phân tích các chỉ số đã chọn
    const btn3 = pageClick.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
    await realClick(pageClick, btn3);
    clickCount++;
    await pageClick.waitForURL('**/phan-tich**', { timeout: 15000 });
    console.log(`Bấm 3: 'PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN' -> Đã vào Trang Phân tích (${pageClick.url()})`);
    await pageClick.waitForTimeout(1500);

    // Bấm 4: Xem báo cáo (hoặc chuyển sang tab Báo cáo)
    const btn4 = pageClick.locator('button:has-text("Xem báo cáo"), button:has-text("XEM BÁO CÁO"), a:has-text("Báo cáo"), [data-tab="report"], nav button:has-text("Báo cáo")').first();
    await realClick(pageClick, btn4);
    clickCount++;
    await pageClick.waitForURL('**/bao-cao**', { timeout: 10000 });
    console.log(`Bấm 4: 'Xem báo cáo' -> Đã vào Trang Báo cáo (${pageClick.url()})`);
    console.log(`TỔNG SỐ LƯỢT BẤM ĐO ĐƯỢC: ${clickCount} lượt bấm.`);

    await pageClick.close();
    console.log('\n>>> TOÀN BỘ KIỂM THỬ VÀ CHỤP ẢNH 0e HOÀN TẤT THÀNH CÔNG (EXIT 0) <<<');

  } finally {
    await browser.close();
    server.httpServer.close();
  }
}

run().catch((err) => {
  console.error('Lỗi kiểm thử 0e screens:', err);
  process.exit(1);
});
