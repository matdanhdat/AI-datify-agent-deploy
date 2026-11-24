import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8089;
const BASE_URL = `http://localhost:${PORT}`;
const EVIDENCE_DIR = path.resolve(__dirname, '../1C2aUI_evidence');

const VIEWPORTS = [
  { name: '1920x1080 (Desktop lớn)', width: 1920, height: 1080 },
  { name: '1440x900 (Laptop)', width: 1440, height: 900 },
  { name: '1366x768 (Laptop phổ thông)', width: 1366, height: 768 },
  { name: '1280x720 (Desktop nhỏ)', width: 1280, height: 720 },
  { name: '1024x768 (Tablet ngang)', width: 1024, height: 768 },
];

const ROUTES = [
  { path: '/', label: 'Trang chủ', actionSelector: 'button, a.px-btn, [role="button"]' },
  { path: '/tai-len', label: 'Tải lên', actionSelector: 'button, input[type="file"], .px-dropzone' },
  { path: '/lam-sach', label: 'Làm sạch (Cổng 1)', actionSelector: 'button:has-text("Duyệt"), button:has-text("Làm sạch"), button.px-btn-primary' },
  { path: '/phan-tich', label: 'Phân tích', actionSelector: 'button, [role="tab"]' },
  { path: '/chat', label: 'Hỏi đáp AI', actionSelector: 'button[type="submit"], textarea, button' },
  { path: '/giao-dich', label: 'Giao dịch', actionSelector: 'button' },
  { path: '/chien-luoc', label: 'Chiến lược', actionSelector: 'button, select' },
  { path: '/bao-cao', label: 'Báo cáo', actionSelector: 'button' },
  { path: '/ho-so', label: 'Hồ sơ', actionSelector: 'button' },
];

function computeIntersectionArea(r1, r2) {
  if (!r1 || !r2) return 0;
  const xOverlap = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
  const yOverlap = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
  return xOverlap * yOverlap;
}

async function run() {
  console.log(`Starting Viewport & Route Overlap Audit on ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // Prepare session with data first so all routes are accessible
    await page.goto(`${BASE_URL}/tai-len`);
    await page.waitForLoadState('networkidle');

    // Upload dien-may-nghin-dong-mo-ho.csv once to have rich state
    const filePath = path.resolve(__dirname, 'samples/business/dien-may-nghin-dong-mo-ho.csv');
    const input = page.locator('input[type="file"]');
    if (await input.count() > 0) {
      await input.setInputFiles(filePath);
      await page.waitForTimeout(1000);
    }

    for (const r of ROUTES) {
      await page.goto(`${BASE_URL}${r.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);

      const audit = await page.evaluate(({ actionSelector }) => {
        // Chat launcher element
        const chatLauncher = document.querySelector('[aria-label="Mở trợ lý ảo Datify"]') ||
                             document.querySelector('[aria-label="Khung trợ lý Datify"] button') ||
                             document.querySelector('[aria-label="Khung trợ lý Datify"]');
        
        let chatRect = null;
        if (chatLauncher) {
          const r = chatLauncher.getBoundingClientRect();
          chatRect = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
        }

        // Action button element
        let actionEl = null;
        if (window.location.pathname.includes('/lam-sach')) {
          // Specifically locate Duyệt button
          const buttons = Array.from(document.querySelectorAll('button'));
          actionEl = buttons.find(b => b.textContent && b.textContent.includes('Duyệt và tiếp tục')) ||
                     buttons.find(b => b.textContent && b.textContent.includes('Duyệt'));
        }
        if (!actionEl) {
          actionEl = document.querySelector(actionSelector);
        }

        let actionRect = null;
        let elementAtCenterTag = 'none';
        let hitMatchesAction = false;

        if (actionEl) {
          const r = actionEl.getBoundingClientRect();
          actionRect = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
          const centerX = r.left + r.width / 2;
          const centerY = r.top + r.height / 2;
          const topEl = document.elementFromPoint(centerX, centerY);
          if (topEl) {
            elementAtCenterTag = topEl.tagName.toLowerCase() + (topEl.className ? `.${String(topEl.className).split(' ')[0]}` : '');
            hitMatchesAction = actionEl === topEl || actionEl.contains(topEl) || topEl.contains(actionEl);
          }
        }

        return { chatRect, actionRect, elementAtCenterTag, hitMatchesAction };
      }, { actionSelector: r.actionSelector });

      const area = computeIntersectionArea(audit.chatRect, audit.actionRect);
      results.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        route: r.path,
        routeLabel: r.label,
        chatRect: audit.chatRect,
        actionRect: audit.actionRect,
        intersectionArea: area,
        hitTarget: audit.elementAtCenterTag,
        hitMatchesAction: audit.hitMatchesAction,
      });
    }

    await context.close();
  }

  await browser.close();

  // Save JSON
  const outJson = path.join(EVIDENCE_DIR, 'd3_overlap_45.json');
  fs.writeFileSync(outJson, JSON.stringify(results, null, 2), 'utf-8');

  // Format Markdown / Plain Text Table
  let table = '| STT | Route | Viewport | Nút Chat (top,bottom,left,right) | Nút Hành Động (top,bottom,left,right) | Giao nhau (px²) | elementFromPoint |\n';
  table += '|:---:|:---|:---|:---|:---|:---:|:---|\n';

  results.forEach((row, idx) => {
    const cStr = row.chatRect ? `[${row.chatRect.top},${row.chatRect.bottom},${row.chatRect.left},${row.chatRect.right}]` : 'N/A';
    const aStr = row.actionRect ? `[${row.actionRect.top},${row.actionRect.bottom},${row.actionRect.left},${row.actionRect.right}]` : 'N/A';
    const status = row.hitMatchesAction ? `OK (${row.hitTarget})` : `MISMATCH (${row.hitTarget})`;
    table += `| ${idx + 1} | \`${row.route}\` (${row.routeLabel}) | ${row.viewport} | ${cStr} | ${aStr} | **${row.intersectionArea}** | ${status} |\n`;
  });

  const outTxt = path.join(EVIDENCE_DIR, 'd3_overlap_45.txt');
  fs.writeFileSync(outTxt, table, 'utf-8');

  console.log(`Audit complete: 45 rows measured. Max overlap area: ${Math.max(...results.map(r => r.intersectionArea))} px²`);
  console.log(`Saved output to ${outTxt}`);
}

run().catch((err) => {
  console.error('Error during D3 audit:', err);
  process.exit(1);
});
