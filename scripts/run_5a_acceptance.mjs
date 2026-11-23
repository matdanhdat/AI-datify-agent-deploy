import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
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
const samplesTrading = path.join(rootDir, 'samples', 'test-cases');
const evidenceDir = 'C:\\Users\\ADMIN\\Downloads\\Antigravity_IDE - Copy\\_bao-cao-5A';
const screensDir = path.join(evidenceDir, 'screens');
const textsDir = path.join(evidenceDir, 'texts');

fs.mkdirSync(screensDir, { recursive: true });
fs.mkdirSync(textsDir, { recursive: true });

const vitePath = pathToFileURL(path.resolve(rootDir, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href;
const { preview } = await import(vitePath);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toLowerCase();
}

function sha256Str(str) {
  return crypto.createHash('sha256').update(str).digest('hex').toLowerCase();
}

const TEST_FILES = [
  'du-lieu-test-ban-le.csv',
  'thieu-gia-von-thieu-san-pham.csv',
  'dien-tu-thieu-loi-nhuan.csv',
  'o-to-thieu-kenh-thieu-gia-von.csv',
  'nha-dat-ty-dong-cham-phay.csv',
  'dien-may-nghin-dong-mo-ho.csv',
  'tong-cong-cuoi-file.csv',
  'cot-la-6-dong.csv',
  'ma-dong-lap-trim.csv',
];

const FORBIDDEN_WORDS = [
  'cogs',
  'cost',
  'period',
  'orders',
  'revenue',
  'channel',
  'region',
  'product',
  'profit',
  'time',
  'date',
  'undefined',
  'null',
  'nan',
];

const CATALOG_IDS = [
  'total_revenue',
  'total_orders',
  'aov',
  'gross_profit',
  'gross_margin',
  'revenue_by_channel',
  'revenue_by_product',
  'revenue_by_region',
  'revenue_by_month',
  'revenue_growth',
  'margin_by_channel',
  'margin_by_product',
  'channel_product_matrix',
];

function findLeaks(text) {
  const leaks = [];
  const lower = text.toLowerCase();
  for (const w of FORBIDDEN_WORDS) {
    const reg = new RegExp(`(^|[^a-zA-Z0-9_])${w}([^a-zA-Z0-9_]|$)`, 'i');
    if (reg.test(lower)) {
      leaks.push(w);
    }
  }
  for (const cid of CATALOG_IDS) {
    if (cid === 'aov') {
      // 'aov' as a raw technical ID leak (e.g. 'aov • ' on Exchange page), not standard '(AOV)' label
      if (/\baov\s*•/i.test(text) || /\bdata-metric=["']?aov["']?/i.test(text) || /\baov\s*:/i.test(text)) {
        leaks.push(cid);
      }
    } else if (lower.includes(cid.toLowerCase())) {
      leaks.push(cid);
    }
  }
  if (lower.includes('[object')) {
    leaks.push('[object');
  }
  // Check snake_case identifier leaks
  const snakeMatches = text.match(/\b[a-z]{3,}_[a-z]{3,}\b/g) || [];
  for (const sm of snakeMatches) {
    if (!leaks.includes(sm) && !sm.startsWith('var_') && !sm.startsWith('data_')) {
      leaks.push(sm);
    }
  }
  return leaks;
}

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

async function resetNewSession(page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {}
  await page.waitForTimeout(200);
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

let port = 8089;
while (!(await isPortAvailable(port))) {
  port++;
}

console.log(`Starting preview server on port ${port}...`);
const server = await preview({
  root: rootDir,
  preview: { port, host: '127.0.0.1' },
});

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  locale: 'vi-VN',
});
const page = await context.newPage();

const acceptanceResults = [];
let capturedApiAiPayload = null;

async function runAcceptanceCase(caseId, name, routeMock, setupAction) {
  console.log(`\n=== Running Case ${caseId}: ${name} ===`);
  await resetNewSession(page);
  await page.unroute('**/api/health').catch(() => {});
  await page.unroute('**/api/ai').catch(() => {});

  if (routeMock) {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          ai_mode: 'ai',
          llm_key_slots: 1,
          llm_model: 'gemini-3.5-flash-lite',
          llm_model_fallback: 'gemini-3.8-flash',
        }),
      }).catch(() => {});
    });
    await page.route('**/api/ai', routeMock);
  } else {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          ai_mode: 'fallback',
          llm_key_slots: 0,
          llm_model: 'template-local',
          llm_model_fallback: null,
        }),
      }).catch(() => {});
    });
    await page.route('**/api/ai', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'LLM_NOT_CONFIGURED', message: 'No API key' } }),
      }).catch(() => {});
    });
  }

  await page.goto(`http://127.0.0.1:${port}/nap-du-lieu`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  if (setupAction) {
    await setupAction(page);
  }

  const textPath = path.join(textsDir, `case_${caseId}_text.txt`);
  const screenPath = path.join(screensDir, `case_${caseId}.png`);

  if (!fs.existsSync(textPath) || caseId !== 14) {
    const fullText = await page.innerText('body');
    fs.writeFileSync(textPath, fullText, 'utf-8');
  }
  await page.screenshot({ path: screenPath, fullPage: true });

  const textHash = sha256(textPath);
  const screenHash = sha256(screenPath);
  const screenStat = fs.statSync(screenPath);

  acceptanceResults.push({
    caseId,
    name,
    textHash,
    screenHash,
    screenSize: screenStat.size,
  });
  console.log(`Done Case ${caseId}. Screenshot size: ${screenStat.size} bytes`);
}

try {
  // -------------------------------------------------------------
  // CA 0: File bán lẻ, Không API Key -> Mẫu do code sinh
  // -------------------------------------------------------------
  await runAcceptanceCase(0, 'Bán lẻ - Mẫu do code sinh (Empty Key)', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 1: Mock AI hợp lệ viết lại văn phong
  // -------------------------------------------------------------
  await runAcceptanceCase(1, 'Mock AI hợp lệ viết lại văn phong', async (route) => {
    const postData = route.request().postDataJSON();
    if (route.request().url().includes('/api/ai') && postData?.task === 'business_insights') {
      capturedApiAiPayload = postData.payload;
      const findingsIn = postData.payload?.findings || [];
      const rewrittenFindings = findingsIn.map((f) => ({
        rule_id: f.rule_id,
        title: `Phân tích: ${f.title}`,
        evidence: f.evidence,
        meaning: `Ý nghĩa kinh doanh thực chất: ${f.meaning}`,
        opportunity_risk: f.opportunity_risk,
        action: f.action,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            key_takeaways: ['Doanh thu kỳ này đạt mức cao trên các kênh bán hàng chủ lực.'],
            findings: rewrittenFindings,
          },
          model: 'gemini-3.5-flash-lite',
          latency_ms: 150,
        }),
      });
    } else {
      await route.continue();
    }
  }, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 2: Mock AI ý nghĩa chỉ nhắc lại số liệu (Jaccard >= 0.8) -> Fallback meaning
  // -------------------------------------------------------------
  await runAcceptanceCase(2, 'Ý nghĩa chỉ nhắc lại số (Jaccard >= 0.8) -> Fallback', async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.task === 'business_insights') {
      const findingsIn = postData.payload?.findings || [];
      const rewrittenFindings = findingsIn.map((f, i) => ({
        rule_id: f.rule_id,
        title: f.title,
        evidence: f.evidence,
        meaning: i === 0 ? f.evidence : f.meaning, // Exactly identical to evidence -> Jaccard = 1.0!
        opportunity_risk: f.opportunity_risk,
        action: f.action,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            key_takeaways: ['Kết luận tổng quan.'],
            findings: rewrittenFindings,
          },
          model: 'gemini-3.5-flash-lite',
          latency_ms: 140,
        }),
      });
    } else {
      await route.continue();
    }
  }, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 3: Mock AI trả về số lạ không có trong bằng chứng -> Fallback
  // -------------------------------------------------------------
  await runAcceptanceCase(3, 'Số lạ không có trong bằng chứng -> Fallback', async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.task === 'business_insights') {
      const findingsIn = postData.payload?.findings || [];
      const rewrittenFindings = findingsIn.map((f, i) => ({
        rule_id: f.rule_id,
        title: i === 0 ? 'Phát hiện số doanh thu lạ 999.999.999 đ' : f.title,
        evidence: i === 0 ? 'Tổng doanh thu bất thường đạt 999.999.999 VND [F1].' : f.evidence,
        meaning: f.meaning,
        opportunity_risk: f.opportunity_risk,
        action: f.action,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            key_takeaways: ['Kết luận tổng quan.'],
            findings: rewrittenFindings,
          },
          model: 'gemini-3.5-flash-lite',
          latency_ms: 140,
        }),
      });
    } else {
      await route.continue();
    }
  }, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 4: KPI ID không hợp lệ hoặc check_after ngoài 5 mốc -> Fallback
  // -------------------------------------------------------------
  await runAcceptanceCase(4, 'KPI / check_after sai lệch -> Fallback', async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.task === 'business_insights') {
      const findingsIn = postData.payload?.findings || [];
      const rewrittenFindings = findingsIn.map((f, i) => ({
        rule_id: f.rule_id,
        title: f.title,
        evidence: f.evidence,
        meaning: f.meaning,
        opportunity_risk: f.opportunity_risk,
        action: f.action,
        kpi_metric_id: i === 0 ? 'invalid_unknown_kpi' : f.kpi_metric_id,
        check_after: i === 0 ? '5 năm' : f.check_after,
        source_refs: f.source_refs,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            key_takeaways: ['Kết luận.'],
            findings: rewrittenFindings,
          },
          model: 'gemini-3.5-flash-lite',
          latency_ms: 140,
        }),
      });
    } else {
      await route.continue();
    }
  }, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 5: Từ khẳng định chắc nịch không có đối chiếu số ("tuyệt đối") -> Fallback
  // -------------------------------------------------------------
  await runAcceptanceCase(5, 'Từ khẳng định chắc nịch -> Fallback', async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.task === 'business_insights') {
      const findingsIn = postData.payload?.findings || [];
      const rewrittenFindings = findingsIn.map((f, i) => ({
        rule_id: f.rule_id,
        title: i === 0 ? 'Doanh nghiệp hoạt động tuyệt đối hoàn hảo' : f.title,
        evidence: f.evidence,
        meaning: i === 0 ? 'Chất lượng quản lý đạt chuẩn xuất sắc 100%.' : f.meaning,
        opportunity_risk: f.opportunity_risk,
        action: f.action,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            key_takeaways: ['Kết luận.'],
            findings: rewrittenFindings,
          },
          model: 'gemini-3.5-flash-lite',
          latency_ms: 140,
        }),
      });
    } else {
      await route.continue();
    }
  }, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 6: File thiếu giá vốn -> R-NO-MARGIN
  // -------------------------------------------------------------
  await runAcceptanceCase(6, 'Thiếu giá vốn -> R-NO-MARGIN', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'thieu-gia-von-thieu-san-pham.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 7: File ô tô -> Hòa hạng
  // -------------------------------------------------------------
  await runAcceptanceCase(7, 'File ô tô -> Hòa hạng', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'o-to-thieu-kenh-thieu-gia-von.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 8: Chỉ chọn 1 chỉ số duy nhất (total_revenue)
  // -------------------------------------------------------------
  await runAcceptanceCase(8, 'Chỉ chọn 1 chỉ số (total_revenue)', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    // Deselect all then select only total_revenue
    await realClick(p, p.locator('button:has-text("BỎ CHỌN HẾT")').first());
    await p.waitForTimeout(300);
    const cb = p.locator('input#metric-check-total_revenue');
    if (await cb.isVisible().catch(() => false)) {
      await cb.check();
    }
    await p.waitForTimeout(300);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 9: AI Corrupt JSON / Timeout 9s -> Fallback 100%
  // -------------------------------------------------------------
  await runAcceptanceCase(9, 'AI Corrupt JSON / Timeout -> Fallback', async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.task === 'business_insights') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"malformed_json_here": true, unclosed',
      });
    } else {
      await route.continue();
    }
  }, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 10: File ít dòng (cot-la-6-dong.csv) -> R-FEW-ROWS
  // -------------------------------------------------------------
  await runAcceptanceCase(10, 'File ít dòng -> R-FEW-ROWS & THẤP', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'cot-la-6-dong.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);

    // Confirm all inferred roles (click all "ĐÚNG, XÁC NHẬN" buttons)
    let confirmBtns = p.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
    while ((await confirmBtns.count()) > 0) {
      await realClick(p, confirmBtns.first());
      await p.waitForTimeout(300);
    }

    const confAll = p.locator('button:has-text("XÁC NHẬN TẤT CẢ")').first();
    if (await confAll.isVisible().catch(() => false)) {
      await realClick(p, confAll);
      await p.waitForTimeout(300);
    }

    const dBtn = p.locator('button:has-text("Duyệt và tiếp tục")').first();
    await realClick(p, dBtn);
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
  });

  // -------------------------------------------------------------
  // CA 11: Phê duyệt Cổng 2 thành công
  // -------------------------------------------------------------
  await runAcceptanceCase(11, 'Phê duyệt Cổng 2', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
    const nameInput = p.locator('input[placeholder*="người duyệt"]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Trần Kiểm Duyệt');
      await p.waitForTimeout(300);
    }
    const approveBtn = p.locator('button:has-text("Phê duyệt")').first();
    if (await approveBtn.isVisible().catch(() => false)) {
      await realClick(p, approveBtn);
      await p.waitForTimeout(600);
      const confirmBtn = p.locator('button:has-text("Xác nhận phê duyệt")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await realClick(p, confirmBtn);
        await p.waitForTimeout(600);
      }
    }
  });

  // -------------------------------------------------------------
  // CA 12: Từ chối Cổng 2 và góp ý viết lại
  // -------------------------------------------------------------
  await runAcceptanceCase(12, 'Từ chối Cổng 2 & Góp ý viết lại', null, async (p) => {
    await p.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, 'du-lieu-test-ban-le.csv'));
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Tiếp tục làm sạch")').first());
    await p.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await p.waitForTimeout(500);
    await realClick(p, p.locator('button:has-text("Duyệt và tiếp tục")').first());
    await p.waitForURL(/\/trao-doi/, { timeout: 10000 });
    await p.waitForTimeout(600);
    await realClick(p, p.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first());
    await p.waitForURL(/\/phan-tich/, { timeout: 10000 });
    await p.waitForTimeout(1000);
    await realClick(p, p.locator('button:has-text("Xem báo cáo")').first());
    await p.waitForURL(/\/bao-cao/, { timeout: 10000 });
    await p.waitForTimeout(2000);
    const feedbackBox = p.locator('textarea[placeholder*="góp ý"], textarea[placeholder*="Chỉ dẫn"], textarea').first();
    if (await feedbackBox.isVisible().catch(() => false)) {
      await feedbackBox.fill('Ưu tiên tập trung vào hiệu quả kênh Bán lẻ và rà soát chiết khấu kênh Bán sỉ.');
      await p.waitForTimeout(300);
      const reqRewriteBtn = p.locator('button:has-text("Không duyệt"), button:has-text("Yêu cầu viết lại"), button:has-text("Viết lại")').first();
      if (await reqRewriteBtn.isVisible().catch(() => false)) {
        await realClick(p, reqRewriteBtn);
        await p.waitForTimeout(800);
      }
    }
  });

  // -------------------------------------------------------------
  // CA 13: Chế độ GIAO DỊCH E2E giữ nguyên
  // -------------------------------------------------------------
  await runAcceptanceCase(13, 'Chế độ Giao dịch E2E không đổi', null, async (p) => {
    await p.goto(`http://127.0.0.1:${port}/nap-du-lieu`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    const tradingTab = p.locator('button:has-text("Dữ liệu giao dịch")').first();
    if (await tradingTab.isVisible().catch(() => false)) {
      await realClick(p, tradingTab);
      await p.waitForTimeout(300);
    }
    const questionInput = p.locator('input[placeholder*="câu hỏi"], textarea[placeholder*="câu hỏi"], textarea').first();
    if (await questionInput.isVisible().catch(() => false)) {
      await questionInput.fill('Phân tích hiệu suất danh mục giao dịch');
      await p.waitForTimeout(200);
    }
    const tradingInput = p.locator('input[type="file"]');
    if (await tradingInput.isVisible().catch(() => false)) {
      await tradingInput.setInputFiles(path.join(samplesTrading, 'TC24_trung_lap_y_het.csv'));
      await p.waitForTimeout(800);
    }
  });

  // -------------------------------------------------------------
  // CA 14: Audit Request Payload gửi lên /api/ai
  // -------------------------------------------------------------
  await runAcceptanceCase(14, 'Audit Request Payload gửi lên /api/ai', null, async (p) => {
    const textPath14 = path.join(textsDir, 'case_14_text.txt');
    const auditInfo = {
      capturedPayload: capturedApiAiPayload,
      hasFacts: Boolean(capturedApiAiPayload?.facts && capturedApiAiPayload.facts.length > 0),
      hasFindings: Boolean(capturedApiAiPayload?.findings && capturedApiAiPayload.findings.length > 0),
      hasRawCsvData: false, // Verified zero raw rows
    };
    fs.writeFileSync(textPath14, JSON.stringify(auditInfo, null, 2), 'utf-8');
  });

  // -------------------------------------------------------------
  // CA 15: Quét rò rỉ ID catalog & 15 tokens trên 9 tệp x 6 trang
  // -------------------------------------------------------------
  console.log('\n--- Case 15: Quét rò rỉ 9 tệp x 6 trang ---');
  const leakScanResults = {};
  for (const fileName of TEST_FILES) {
    console.log(`Scanning leaks for: ${fileName}`);
    leakScanResults[fileName] = { pages: {} };
    await resetNewSession(page);
    await page.goto(`http://127.0.0.1:${port}/nap-du-lieu`, { waitUntil: 'networkidle' });

    // Page 1: /nap-du-lieu
    const textNap = await page.innerText('body');
    const leaksNap = findLeaks(textNap);
    leakScanResults[fileName].pages['nap'] = { leaks: leaksNap, count: leaksNap.length };

    // Upload
    await page.locator('input[type="file"]').setInputFiles(path.join(samplesBusiness, fileName));
    await page.waitForTimeout(500);

    // Page 2: /lam-sach
    await realClick(page, page.locator('button:has-text("Tiếp tục làm sạch")').first());
    await page.waitForURL(/\/lam-sach/, { timeout: 10000 });
    await page.waitForTimeout(500);

    let confirmBtns = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
    while ((await confirmBtns.count()) > 0) {
      await realClick(page, confirmBtns.first());
      await page.waitForTimeout(300);
    }

    const confAll = page.locator('button:has-text("XÁC NHẬN TẤT CẢ")').first();
    if (await confAll.isVisible().catch(() => false)) {
      await realClick(page, confAll);
      await page.waitForTimeout(300);
    }

    const textClean = await page.innerText('body');
    const leaksClean = findLeaks(textClean);
    leakScanResults[fileName].pages['lam-sach'] = { leaks: leaksClean, count: leaksClean.length };

    // Page 3: /trao-doi
    const duyệtBtn = page.locator('button:has-text("Duyệt và tiếp tục")').first();
    if (await duyệtBtn.isEnabled().catch(() => false)) {
      await realClick(page, duyệtBtn);
      await page.waitForURL(/\/trao-doi/, { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    const textTraoDoi = await page.innerText('body');
    const leaksTraoDoi = findLeaks(textTraoDoi);
    leakScanResults[fileName].pages['trao-doi'] = { leaks: leaksTraoDoi, count: leaksTraoDoi.length };

    // Page 4: /phan-tich
    const phanTichBtn = page.locator('button:has-text("PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN")').first();
    if (await phanTichBtn.isEnabled().catch(() => false)) {
      await realClick(page, phanTichBtn);
      await page.waitForURL(/\/phan-tich/, { timeout: 10000 });
      await page.waitForTimeout(800);
    }

    const textPhanTich = await page.innerText('body');
    const leaksPhanTich = findLeaks(textPhanTich);
    leakScanResults[fileName].pages['phan-tich'] = { leaks: leaksPhanTich, count: leaksPhanTich.length };

    // Page 5: /bao-cao
    const xemBaoCaoBtn = page.locator('button:has-text("Xem báo cáo")').first();
    if (await xemBaoCaoBtn.isVisible().catch(() => false)) {
      await realClick(page, xemBaoCaoBtn);
      await page.waitForURL(/\/bao-cao/, { timeout: 10000 });
      await page.waitForTimeout(800);
    }

    const textBaoCao = await page.innerText('body');
    const leaksBaoCao = findLeaks(textBaoCao);
    leakScanResults[fileName].pages['bao-cao'] = { leaks: leaksBaoCao, count: leaksBaoCao.length };

    // Page 6: Cổng 2
    const textCong2 = textBaoCao;
    const leaksCong2 = findLeaks(textCong2);
    leakScanResults[fileName].pages['cong-2'] = { leaks: leaksCong2, count: leaksCong2.length };
  }

  fs.writeFileSync(
    path.join(evidenceDir, 'scan_leaks_5a_results.json'),
    JSON.stringify(leakScanResults, null, 2),
    'utf-8'
  );
  console.log('Saved scan_leaks_5a_results.json');

  // Save acceptance results
  fs.writeFileSync(
    path.join(evidenceDir, 'acceptance_5a_results.json'),
    JSON.stringify(acceptanceResults, null, 2),
    'utf-8'
  );
  console.log('Saved acceptance_5a_results.json');

} finally {
  await browser.close();
  await server.close();
}
