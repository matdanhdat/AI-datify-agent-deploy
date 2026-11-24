import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8089;
const BASE_URL = `http://localhost:${PORT}`;
const EVIDENCE_DIR = path.resolve(__dirname, '../1C2aUI_evidence');

const SAMPLES_DIR = path.resolve(__dirname, 'samples/business');

const FILES = [
  { id: 'dien-tu', file: 'dien-tu-thieu-loi-nhuan.csv' },
  { id: 'o-to', file: 'o-to-thieu-kenh.csv' },
  { id: 'ban-le', file: 'du-lieu-test-ban-le.csv' },
  { id: 'thieu-gia-von', file: 'thieu-gia-von-thieu-san-pham.csv' },
  { id: 'nha-dat', file: 'nha-dat-ty-dong-cham-phay.csv' },
  { id: 'dien-may', file: 'dien-may-nghin-dong-mo-ho.csv' },
  { id: 'tong-cong', file: 'tong-cong-nghin-dong-dau-phay.csv' },
];

const FORBIDDEN_STRINGS = [
  'undefined',
  'NaN',
  'null',
  '[object',
  'DS-0',
  'Cổ phiếu',
  'Khối lượng',
  '56 dòng',
  '48 bản ghi',
];

async function run() {
  console.log(`Starting Full Chrome Acceptance Suite on ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  // =========================================================================
  // F1 & E2: dien-may-nghin-dong-mo-ho.csv Step-by-Step Flow
  // =========================================================================
  console.log('\n--- Step F1 & E2: Testing dien-may flow & screenshots ---');
  await page.goto(`${BASE_URL}/tai-len`);
  await page.waitForLoadState('networkidle');

  // Upload dien-may
  const g2Path = path.join(SAMPLES_DIR, 'dien-may-nghin-dong-mo-ho.csv');
  const uploadInput = page.locator('input[type="file"]');
  await uploadInput.setInputFiles(g2Path);
  await page.waitForTimeout(1000);

  // Navigate to /lam-sach
  await page.goto(`${BASE_URL}/lam-sach`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  // F1 - Stage 1: Initial state
  const stage1Path = path.join(EVIDENCE_DIR, 'f1_dien_may_stage1_initial.png');
  await page.screenshot({ path: stage1Path, fullPage: true });
  console.log(`Saved F1 Stage 1 screenshot: ${stage1Path}`);

  // E2: Verify initial UI elements
  const summaryInitial = await page.locator('.px-card').filter({ hasText: 'XÁC NHẬN CÁCH ĐỌC FILE' }).innerText();
  console.log('Summary Initial Text:\n', summaryInitial);

  const confirmAllBtn = page.locator('button:has-text("XÁC NHẬN TẤT CẢ")');
  const confirmAllVisible = await confirmAllBtn.isVisible();
  console.log('XÁC NHẬN TẤT CẢ visible:', confirmAllVisible);

  // F1 - Stage 2: Click "XÁC NHẬN TẤT CẢ"
  await confirmAllBtn.click();
  await page.waitForTimeout(500);

  const stage2Path = path.join(EVIDENCE_DIR, 'f1_dien_may_stage2_after_confirm_all.png');
  await page.screenshot({ path: stage2Path, fullPage: true });
  console.log(`Saved F1 Stage 2 screenshot: ${stage2Path}`);

  const summaryStage2 = await page.locator('.px-card').filter({ hasText: 'XÁC NHẬN CÁCH ĐỌC FILE' }).innerText();
  console.log('Summary Stage 2 Text:\n', summaryStage2);

  // F1 - Stage 3: Click individual confirm on the remaining suspicious row
  const remainingConfirmBtn = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
  console.log('Remaining unconfirmed rows count:', await remainingConfirmBtn.count());
  if (await remainingConfirmBtn.count() > 0) {
    await remainingConfirmBtn.first().click();
    await page.waitForTimeout(500);
  }

  // Type reviewer name
  const reviewerInput = page.locator('input[placeholder*="Nhập tên người duyệt"]');
  await reviewerInput.fill('Nguyễn Văn Kiểm Duyệt');
  await page.waitForTimeout(400);

  const stage3Path = path.join(EVIDENCE_DIR, 'f1_dien_may_stage3_all_confirmed.png');
  await page.screenshot({ path: stage3Path, fullPage: true });
  console.log(`Saved F1 Stage 3 screenshot: ${stage3Path}`);

  // F1 - Stage 4 & E2: Click DUYỆT button at center coordinate
  const duyetBtn = page.locator('button:has-text("Duyệt và tiếp tục")');
  const duyetBox = await duyetBtn.boundingBox();
  console.log('DUYỆT Button Box:', duyetBox);

  // Verify elementFromPoint at center of Duyệt button
  const topElTag = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : '') : 'none';
  }, { x: duyetBox.x + duyetBox.width / 2, y: duyetBox.y + duyetBox.height / 2 });
  console.log('elementFromPoint at DUYỆT center:', topElTag);

  // Mouse click at exact center
  await page.mouse.click(duyetBox.x + duyetBox.width / 2, duyetBox.y + duyetBox.height / 2);
  await page.waitForTimeout(600);

  const stage4Path = path.join(EVIDENCE_DIR, 'f1_dien_may_stage4_modal_opened.png');
  await page.screenshot({ path: stage4Path, fullPage: true });
  console.log(`Saved F1 Stage 4 screenshot: ${stage4Path}`);

  // Close modal so session remains clean
  const cancelBtn = page.locator('button:has-text("Hủy")');
  if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
    await page.waitForTimeout(300);
  }

  // =========================================================================
  // F2: G1 (nha-dat) and G3 (tong-cong) Screenshots
  // =========================================================================
  console.log('\n--- Step F2: Capturing G1 & G3 screenshots ---');

  // G1: nha-dat
  await page.goto(`${BASE_URL}/tai-len`);
  await page.waitForLoadState('networkidle');
  await uploadInput.setInputFiles(path.join(SAMPLES_DIR, 'nha-dat-ty-dong-cham-phay.csv'));
  await page.waitForTimeout(1000);
  await page.goto(`${BASE_URL}/lam-sach`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  // Confirm if needed
  const g1ConfirmBtn = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
  if (await g1ConfirmBtn.count() > 0) {
    const allBtn = page.locator('button:has-text("XÁC NHẬN TẤT CẢ")');
    if (await allBtn.isVisible()) {
      await allBtn.click();
    } else {
      await g1ConfirmBtn.first().click();
    }
    await page.waitForTimeout(400);
  }
  const f2G1Path = path.join(EVIDENCE_DIR, 'f2_g1_nha_dat.png');
  await page.screenshot({ path: f2G1Path, fullPage: true });
  console.log(`Saved F2 G1 screenshot: ${f2G1Path}`);

  // G3: tong-cong
  await page.goto(`${BASE_URL}/tai-len`);
  await page.waitForLoadState('networkidle');
  await uploadInput.setInputFiles(path.join(SAMPLES_DIR, 'tong-cong-nghin-dong-dau-phay.csv'));
  await page.waitForTimeout(1000);
  await page.goto(`${BASE_URL}/lam-sach`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  const g3ConfirmBtn = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
  if (await g3ConfirmBtn.count() > 0) {
    const allBtn = page.locator('button:has-text("XÁC NHẬN TẤT CẢ")');
    if (await allBtn.isVisible()) {
      await allBtn.click();
    } else {
      await g3ConfirmBtn.first().click();
    }
    await page.waitForTimeout(400);
  }
  const f2G3Path = path.join(EVIDENCE_DIR, 'f2_g3_tong_cong.png');
  await page.screenshot({ path: f2G3Path, fullPage: true });
  console.log(`Saved F2 G3 screenshot: ${f2G3Path}`);

  // =========================================================================
  // F3: Re-measure 7 files -> baseline-after.json
  // =========================================================================
  console.log('\n--- Step F3: Measuring 7 baseline files ---');
  const baselineAfter = {};

  for (const item of FILES) {
    await page.goto(`${BASE_URL}/tai-len`);
    await page.waitForLoadState('networkidle');

    const filePath = path.join(SAMPLES_DIR, item.file);
    await uploadInput.setInputFiles(filePath);
    await page.waitForTimeout(1000);

    await page.goto(`${BASE_URL}/lam-sach`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // Confirm all if panel is present
    const confAll = page.locator('button:has-text("XÁC NHẬN TẤT CẢ")');
    if (await confAll.isVisible()) {
      await confAll.click();
      await page.waitForTimeout(300);
    }
    const singleConf = page.locator('button:has-text("ĐÚNG, XÁC NHẬN")');
    while (await singleConf.count() > 0) {
      await singleConf.first().click();
      await page.waitForTimeout(300);
    }

    // Read metrics from KPI cards or profile
    const cards = await page.evaluate(() => {
      const kpis = [];
      const text = document.body.innerText;
      const cardEls = document.querySelectorAll('.px-card, [data-testid="kpi-card"]');
      cardEls.forEach(el => {
        kpis.push(el.innerText);
      });
      return { kpis, fullText: text };
    });

    baselineAfter[item.id] = {
      file: item.file,
      metricsText: cards.kpis.slice(0, 8),
    };
  }

  const afterJsonPath = path.join(EVIDENCE_DIR, 'baseline-after.json');
  fs.writeFileSync(afterJsonPath, JSON.stringify(baselineAfter, null, 2), 'utf-8');
  console.log(`Saved baseline-after.json: ${afterJsonPath}`);

  // Compare baseline-before.json and baseline-after.json
  const beforeJsonPath = path.join(EVIDENCE_DIR, 'baseline-before.json');
  if (fs.existsSync(beforeJsonPath)) {
    const beforeData = JSON.parse(fs.readFileSync(beforeJsonPath, 'utf-8'));
    let matches = 0;
    let total = 0;
    for (const k of Object.keys(beforeData)) {
      total++;
      const bStr = JSON.stringify(beforeData[k].metricsText);
      const aStr = JSON.stringify(baselineAfter[k]?.metricsText);
      if (bStr === aStr) {
        matches++;
      } else {
        console.warn(`Discrepancy in file ${k}:\nBEFORE: ${bStr}\nAFTER: ${aStr}`);
      }
    }
    console.log(`Baseline Comparison: ${matches}/${total} files match 100%`);
  }

  // =========================================================================
  // F4: Quét chuỗi cấm trên G1, G2, G3
  // =========================================================================
  console.log('\n--- Step F4: Scanning forbidden strings on G1, G2, G3 ---');
  const targetFiles = [
    { id: 'G1', file: 'nha-dat-ty-dong-cham-phay.csv' },
    { id: 'G2', file: 'dien-may-nghin-dong-mo-ho.csv' },
    { id: 'G3', file: 'tong-cong-nghin-dong-dau-phay.csv' },
  ];

  let forbiddenReport = '=== F4: BÁO CÁO QUÉT CHUỖI CẤM TRÊN G1, G2, G3 ===\n\n';

  for (const target of targetFiles) {
    await page.goto(`${BASE_URL}/tai-len`);
    await page.waitForLoadState('networkidle');
    await uploadInput.setInputFiles(path.join(SAMPLES_DIR, target.file));
    await page.waitForTimeout(1000);

    await page.goto(`${BASE_URL}/lam-sach`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const innerText = await page.evaluate(() => document.body.innerText);

    forbiddenReport += `File ${target.id} (${target.file}):\n`;
    for (const forbidden of FORBIDDEN_STRINGS) {
      const found = innerText.includes(forbidden);
      forbiddenReport += `  - "${forbidden}": ${found ? 'PHÁT HIỆN LỖI' : 'KHÔNG CÓ (OK)'}\n`;
    }
    forbiddenReport += '\n';
  }

  const forbiddenPath = path.join(EVIDENCE_DIR, 'forbidden_check.txt');
  fs.writeFileSync(forbiddenPath, forbiddenReport, 'utf-8');
  console.log(forbiddenReport);
  console.log(`Saved forbidden check report: ${forbiddenPath}`);

  await browser.close();
  console.log('\nAll Chrome Acceptance Steps (F1..F4, E2) Completed Successfully!');
}

run().catch((err) => {
  console.error('Error during Chrome acceptance:', err);
  process.exit(1);
});
