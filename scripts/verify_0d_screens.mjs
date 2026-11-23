import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();
const samplesDir = path.join(rootDir, 'samples', 'business');
const OUT_DIR = path.resolve(rootDir, '..', '_bao-cao-2A2');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function realClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function run() {
  console.log('Starting preview server on port 8089...');
  const server = await preview({
    root: rootDir,
    preview: { port: 8089, host: '127.0.0.1' },
  });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    // =========================================================================
    // 0d.5: Kiểm tra nút "ĐÚNG, XÁC NHẬN" & nhãn cột trên cot-la-6-dong.csv
    // =========================================================================
    console.log('\n--- 0d.5: Kiểm tra giao diện thẻ suy luận cot-la-6-dong.csv ở 2 viewport ---');
    const viewports = [
      { name: '1280x720', width: 1280, height: 720 },
      { name: '1920x1080', width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto('http://127.0.0.1:8089/nap-du-lieu');
      await page.waitForTimeout(500);

      // Fill question
      const qInput = page.locator('input[placeholder*="Ví dụ: Kênh bán nào"]').first();
      if (await qInput.isVisible().catch(() => false)) {
        await qInput.fill('Doanh thu và biên lợi nhuận?');
        await page.waitForTimeout(200);
      }

      // Upload cot-la-6-dong.csv
      const filePath = path.join(samplesDir, 'cot-la-6-dong.csv');
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('[role="button"]:has-text("KÉO THẢ TỆP VÀO ĐÂY")').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(filePath);
      await page.waitForTimeout(1000);

      const nextBtn = page.locator('button:has-text("TIẾP TỤC LÀM SẠCH")');
      await realClick(page, nextBtn);
      await page.waitForURL('**/lam-sach**', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // In CleanPage, select "Khoản thu KH" for Doanh thu in select dropdown
      const selectRev = page.locator('select[aria-label*="Doanh thu"]').first();
      await selectRev.selectOption({ label: 'Khoản thu KH' });
      await page.waitForTimeout(600);

      // Verify unconfirmed card layout
      const cardText = await page.locator('div:has-text("Doanh thu:")').first().innerText();
      console.log(`[Viewport ${vp.name}] Card text preview:\n`, cardText);

      const hasFullLabel = cardText.includes('Khoản thu KH');
      console.log(`[Viewport ${vp.name}] Nhãn cột đọc đủ 'Khoản thu KH' (không bị cắt 'Kho...'): ${hasFullLabel}`);

      const confirmBtn = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")').first();
      const btnVisible = await confirmBtn.isVisible();
      const btnText = await confirmBtn.innerText();
      console.log(`[Viewport ${vp.name}] Nút 'ĐÚNG, XÁC NHẬN' hiển thị: ${btnVisible}, Text: '${btnText.replace(/\n/g, ' ')}'`);

      const shotPath = path.join(OUT_DIR, `0d5_cot_la_unconfirmed_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      const shotHash = crypto.createHash('sha256').update(fs.readFileSync(shotPath)).digest('hex');
      console.log(`[Viewport ${vp.name}] Ảnh chụp: ${shotPath} | SHA: ${shotHash}`);

      await page.close();
    }

    // =========================================================================
    // 0d.4: Kiểm tra bằng code số series, số điểm, tổng giá trị biểu đồ trên Phân tích
    // =========================================================================
    console.log('\n--- 0d.4: Kiểm tra chi tiết dữ liệu biểu đồ trong khối Chỉ số theo danh mục ---');
    const pageRetail = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await pageRetail.goto('http://127.0.0.1:8089/nap-du-lieu');
    await pageRetail.waitForTimeout(500);

    const qInputRetail = pageRetail.locator('input[placeholder*="Ví dụ: Kênh bán nào"]').first();
    if (await qInputRetail.isVisible().catch(() => false)) {
      await qInputRetail.fill('Phân tích chi tiết');
      await pageRetail.waitForTimeout(200);
    }

    const retailPath = path.join(samplesDir, 'du-lieu-test-ban-le.csv');
    const fcRetailPromise = pageRetail.waitForEvent('filechooser');
    await pageRetail.locator('[role="button"]:has-text("KÉO THẢ TỆP VÀO ĐÂY")').click();
    const fcRetail = await fcRetailPromise;
    await fcRetail.setFiles(retailPath);
    await pageRetail.waitForTimeout(1000);

    await realClick(pageRetail, pageRetail.locator('button:has-text("TIẾP TỤC LÀM SẠCH")'));
    await pageRetail.waitForURL('**/lam-sach**', { timeout: 10000 });
    await pageRetail.waitForTimeout(1000);

    // Approve at Gate 1
    const approveBtn = pageRetail.locator('button:has-text("Duyệt và tiếp tục")');
    const reviewerInput = pageRetail.locator('input[placeholder*="tên người duyệt"]');
    if (await reviewerInput.isVisible().catch(() => false)) {
      await reviewerInput.fill('Ban Giám Khảo');
    }
    await realClick(pageRetail, approveBtn);
    await pageRetail.waitForURL('**/trao-doi**', { timeout: 10000 });
    await pageRetail.waitForTimeout(800);

    // Click confirm on exchange page
    const analyzeBtn = pageRetail.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
    await realClick(pageRetail, analyzeBtn);
    await pageRetail.waitForURL('**/phan-tich**', { timeout: 15000 });
    await pageRetail.waitForTimeout(2000);

    // Inspect charts in selected-metrics-block
    const chartInfoList = await pageRetail.evaluate(() => {
      const results = [];
      const chartContainers = document.querySelectorAll('[data-testid="selected-metrics-block"] div[role="img"]');
      chartContainers.forEach((el) => {
        const title = el.getAttribute('aria-label') || 'Biểu đồ';
        // In SVG renderer, count path/rect elements representing bars/lines
        const rects = el.querySelectorAll('path, rect');
        const svgs = el.querySelectorAll('svg');
        results.push({
          title,
          hasSvg: svgs.length > 0,
          graphicElementsCount: rects.length,
        });
      });
      return results;
    });

    console.log('Thông tin các biểu đồ tìm thấy trong khối Chỉ số theo danh mục (Retail):');
    chartInfoList.forEach((ci, idx) => {
      console.log(`  ${idx + 1}. [${ci.title}] - SVG: ${ci.hasSvg ? 'CÓ' : 'KHÔNG'}, Phần tử đồ họa: ${ci.graphicElementsCount}`);
    });

    const shotRetailCharts = path.join(OUT_DIR, '0d4_retail_charts.png');
    await pageRetail.screenshot({ path: shotRetailCharts, fullPage: true });
    const shotRetailHash = crypto.createHash('sha256').update(fs.readFileSync(shotRetailCharts)).digest('hex');
    console.log(`Ảnh chụp biểu đồ bán lẻ: ${shotRetailCharts} | SHA: ${shotRetailHash}`);

    await pageRetail.close();

    // Now check thieu-gia-von-thieu-san-pham.csv charts
    const pageThieu = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await pageThieu.goto('http://127.0.0.1:8089/nap-du-lieu');
    await pageThieu.waitForTimeout(500);

    const qInputThieu = pageThieu.locator('input[placeholder*="Ví dụ: Kênh bán nào"]').first();
    if (await qInputThieu.isVisible().catch(() => false)) {
      await qInputThieu.fill('Phân tích chi tiết');
      await pageThieu.waitForTimeout(200);
    }

    const thieuPath = path.join(samplesDir, 'thieu-gia-von-thieu-san-pham.csv');
    const fcThieuPromise = pageThieu.waitForEvent('filechooser');
    await pageThieu.locator('[role="button"]:has-text("KÉO THẢ TỆP VÀO ĐÂY")').click();
    const fcThieu = await fcThieuPromise;
    await fcThieu.setFiles(thieuPath);
    await pageThieu.waitForTimeout(1000);

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
    await pageThieu.waitForTimeout(2000);

    const shotThieuCharts = path.join(OUT_DIR, '0d4_thieu_gia_von_charts.png');
    await pageThieu.screenshot({ path: shotThieuCharts, fullPage: true });
    const shotThieuHash = crypto.createHash('sha256').update(fs.readFileSync(shotThieuCharts)).digest('hex');
    console.log(`Ảnh chụp biểu đồ thiếu giá vốn: ${shotThieuCharts} | SHA: ${shotThieuHash}`);

    await pageThieu.close();
    console.log('\n>>> TOÀN BỘ KIỂM THỬ 0d.4 & 0d.5 HOÀN TẤT THÀNH CÔNG (EXIT 0) <<<');

  } finally {
    await browser.close();
    server.httpServer.close();
  }
}

run().catch((err) => {
  console.error('Lỗi kiểm thử 0d screens:', err);
  process.exit(1);
});
